/**
 * Alert-count accuracy — HTTP integration tests (Task #66)
 *
 * Fires real HTTP requests through the full Express middleware stack via
 * supertest:
 *   cookie-parser → authenticate → requireOrgScopeForWrites → portfolioRouter
 *
 * Covers GET /api/portfolio/summary:
 *   1. Unauthenticated → 401 { error: "unauthenticated" }.
 *   2. Tampered cookie → 401.
 *   3. Each plant card in the response carries a numeric alertCounts object
 *      with all four severity keys.
 *   4. alertCounts values reflect whatever activeAlertCountsByPlant returns —
 *      confirming the route wires the live query result directly into each card.
 *   5. Fleet-level alertCounts equals the sum of per-plant counts.
 *   6. Cross-org isolation: an org-2 user's request passes "org-2" to
 *      activeAlertCountsByPlant, never "org-1"; their plant list is empty
 *      (no demo plants belong to org-2).
 *   7. Super-admin with no org override passes null to activeAlertCountsByPlant.
 *
 * Strategy
 * ────────
 * @workspace/db is mocked for the authenticate middleware.  The mock supports
 * both org-1 and org-2 users via a hoisted `currentUser` variable that each
 * test can swap.
 *
 * activeAlertCountsByPlant is mocked at the module level so tests can:
 *   a) inject specific AlertCounts maps and verify they flow to the response, and
 *   b) assert the orgId argument passed by the route (cross-org isolation).
 */

// ── 1. Hoisted state shared between the mock factory and test bodies ──────────

const mocks = vi.hoisted(() => {
  const fakeUserOrg1 = {
    id:           "u-org1",
    orgId:        "org-1",
    roleId:       "role-op",
    name:         "Org-1 Op",
    email:        "op@org1.example",
    isSuperAdmin: false,
  };
  const fakeUserOrg2 = {
    id:           "u-org2",
    orgId:        "org-2",
    roleId:       "role-op2",
    name:         "Org-2 Op",
    email:        "op@org2.example",
    isSuperAdmin: false,
  };
  const fakeSuperAdmin = {
    id:           "u-sa",
    orgId:        "org-1",
    roleId:       "role-sa",
    name:         "Super Admin",
    email:        "sa@admin.example",
    isSuperAdmin: true,
  };
  // currentUser is read by the mock factory on every db.select() call
  const currentUser = { value: fakeUserOrg1 as typeof fakeUserOrg1 | typeof fakeUserOrg2 | typeof fakeSuperAdmin };
  return { currentUser, fakeUserOrg1, fakeUserOrg2, fakeSuperAdmin };
});

// ── 2. Mock @workspace/db BEFORE imports ─────────────────────────────────────
vi.mock("@workspace/db", () => {
  function makeChain(rows: unknown[]) {
    return Object.assign(Promise.resolve(rows), {
      from:               () => makeChain(rows),
      where:              () => makeChain(rows),
      set:                () => makeChain(rows),
      values:             () => makeChain(rows),
      onConflictDoUpdate: () => makeChain(rows),
      returning:          () => makeChain(rows),
      limit: (n: number)  => Promise.resolve((rows as unknown[]).slice(0, n)),
    });
  }
  return {
    db: {
      select: () => makeChain([mocks.currentUser.value]),
      insert: () => makeChain([]),
      update: () => makeChain([]),
      delete: () => makeChain([]),
    },
    usersTable:          {},
    rolesTable:          {},
    alertsTable:         {},
    faultOverridesTable: {},
    organizationsTable:  {},
  };
});

// ── 3. Mock activeAlertCountsByPlant so tests control its return value ────────
vi.mock("../lib/alertCounts", () => ({
  activeAlertCountsByPlant:  vi.fn(),
  activeAlertCountsForPlant: vi.fn(),
}));

// ── 4. Imports ────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import request, { type Test as SupertestTest } from "supertest";
import { activeAlertCountsByPlant } from "../lib/alertCounts";
import { PLANTS } from "../lib/simulation";
import app from "../app";

// ── 5. Helpers ────────────────────────────────────────────────────────────────

const SESSION_COOKIE = "scada_session";
const TEST_SECRET    = process.env["SESSION_SECRET"]!;

type AlertCounts = { critical: number; major: number; minor: number; informational: number };

function makeEmptyCountMap(): Map<string, AlertCounts> {
  return new Map();
}

function signedCookieValue(value: string, secret: string): string {
  const sig = crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("base64")
    .replace(/=+$/, "");
  return `s:${value}.${sig}`;
}

function cookieFor(orgId: string, userId: string, roleId: string): string {
  const session = JSON.stringify({ userId, orgId, roleId });
  const signed  = signedCookieValue(session, TEST_SECRET);
  return `${SESSION_COOKIE}=${encodeURIComponent(signed)}`;
}

const org1Cookie = cookieFor("org-1", "u-org1", "role-op");
const org2Cookie = cookieFor("org-2", "u-org2", "role-op2");
const saCookie   = cookieFor("org-1", "u-sa",   "role-sa");

function withOrg1(req: SupertestTest): SupertestTest {
  return req.set("Cookie", org1Cookie);
}
function withOrg2(req: SupertestTest): SupertestTest {
  return req.set("Cookie", org2Cookie);
}

const mockedAlertCounts = vi.mocked(activeAlertCountsByPlant);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/portfolio/summary — alert count accuracy", () => {

  beforeEach(() => {
    // Clear call history so per-test assertions aren't polluted by earlier tests
    vi.clearAllMocks();
    // Reset to org-1 user and empty alert counts
    mocks.currentUser.value = mocks.fakeUserOrg1;
    mockedAlertCounts.mockResolvedValue(makeEmptyCountMap());
  });

  // ── Auth gate ───────────────────────────────────────────────────────────────

  it("unauthenticated → 401", async () => {
    const res = await request(app).get("/api/portfolio/summary").expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("tampered session cookie → 401", async () => {
    const tampered = `${SESSION_COOKIE}=${encodeURIComponent(org1Cookie + "TAMPERED")}`;
    const res = await request(app)
      .get("/api/portfolio/summary")
      .set("Cookie", tampered)
      .expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  // ── Response shape ──────────────────────────────────────────────────────────

  it("200 with plants array and fleet alertCounts", async () => {
    const res = await withOrg1(request(app).get("/api/portfolio/summary")).expect(200);
    expect(Array.isArray(res.body.plants)).toBe(true);
    const fleet = res.body.alertCounts as Record<string, unknown>;
    expect(typeof fleet["critical"]).toBe("number");
    expect(typeof fleet["major"]).toBe("number");
    expect(typeof fleet["minor"]).toBe("number");
    expect(typeof fleet["informational"]).toBe("number");
  });

  it("each plant card carries a numeric alertCounts object with all four severity keys", async () => {
    const res = await withOrg1(request(app).get("/api/portfolio/summary")).expect(200);
    expect((res.body.plants as unknown[]).length).toBeGreaterThan(0);
    for (const plant of res.body.plants as Record<string, unknown>[]) {
      const ac = plant["alertCounts"] as Record<string, unknown>;
      expect(typeof ac).toBe("object");
      expect(ac).not.toBeNull();
      expect(typeof ac["critical"]).toBe("number");
      expect(typeof ac["major"]).toBe("number");
      expect(typeof ac["minor"]).toBe("number");
      expect(typeof ac["informational"]).toBe("number");
      // Counts must be non-negative integers
      expect(ac["critical"]).toBeGreaterThanOrEqual(0);
      expect(ac["major"]).toBeGreaterThanOrEqual(0);
      expect(ac["minor"]).toBeGreaterThanOrEqual(0);
      expect(ac["informational"]).toBeGreaterThanOrEqual(0);
    }
  });

  // ── Live count wiring ───────────────────────────────────────────────────────

  it("plant card alertCounts reflect the live DB query result", async () => {
    // Inject specific counts for the first demo plant
    const targetPlantId = PLANTS[0]!.id;
    mockedAlertCounts.mockResolvedValue(
      new Map([[targetPlantId, { critical: 3, major: 2, minor: 1, informational: 0 }]]),
    );

    const res = await withOrg1(request(app).get("/api/portfolio/summary")).expect(200);
    const plant = (res.body.plants as Record<string, unknown>[]).find(
      (p) => p["id"] === targetPlantId,
    );
    expect(plant).toBeDefined();
    const ac = plant!["alertCounts"] as Record<string, unknown>;
    expect(ac["critical"]).toBe(3);
    expect(ac["major"]).toBe(2);
    expect(ac["minor"]).toBe(1);
    expect(ac["informational"]).toBe(0);
  });

  it("plants with no alerts in the map receive zeroed alertCounts", async () => {
    // Mock returns a map with only one plant; others get defaults
    const targetPlantId = PLANTS[0]!.id;
    mockedAlertCounts.mockResolvedValue(
      new Map([[targetPlantId, { critical: 5, major: 0, minor: 0, informational: 0 }]]),
    );

    const res = await withOrg1(request(app).get("/api/portfolio/summary")).expect(200);
    const otherPlants = (res.body.plants as Record<string, unknown>[]).filter(
      (p) => p["id"] !== targetPlantId,
    );
    for (const plant of otherPlants) {
      const ac = plant["alertCounts"] as Record<string, unknown>;
      expect(ac["critical"]).toBe(0);
      expect(ac["major"]).toBe(0);
      expect(ac["minor"]).toBe(0);
      expect(ac["informational"]).toBe(0);
    }
  });

  // ── Fleet total accuracy ────────────────────────────────────────────────────

  it("fleet-level alertCounts equals the sum of all per-plant counts", async () => {
    const countMap = new Map<string, AlertCounts>();
    for (const plant of PLANTS) {
      countMap.set(plant.id, { critical: 1, major: 2, minor: 3, informational: 4 });
    }
    mockedAlertCounts.mockResolvedValue(countMap);

    const res = await withOrg1(request(app).get("/api/portfolio/summary")).expect(200);
    const fleet = res.body.alertCounts as AlertCounts;
    // Derive n from the actual response so this test doesn't break if demo
    // plants are added or reassigned to other orgs in future.
    const n = (res.body.plants as unknown[]).length;
    expect(n).toBeGreaterThan(0); // sanity: org-1 must have at least one plant

    expect(fleet.critical).toBe(n * 1);
    expect(fleet.major).toBe(n * 2);
    expect(fleet.minor).toBe(n * 3);
    expect(fleet.informational).toBe(n * 4);
  });

  it("fleet alertCounts is zero when no plants have alerts", async () => {
    mockedAlertCounts.mockResolvedValue(makeEmptyCountMap());
    const res = await withOrg1(request(app).get("/api/portfolio/summary")).expect(200);
    const fleet = res.body.alertCounts as AlertCounts;
    expect(fleet.critical).toBe(0);
    expect(fleet.major).toBe(0);
    expect(fleet.minor).toBe(0);
    expect(fleet.informational).toBe(0);
  });

  // ── Cross-org isolation ─────────────────────────────────────────────────────

  it("org-1 user: activeAlertCountsByPlant is called with 'org-1'", async () => {
    mockedAlertCounts.mockResolvedValue(makeEmptyCountMap());
    await withOrg1(request(app).get("/api/portfolio/summary")).expect(200);
    expect(mockedAlertCounts).toHaveBeenCalledWith("org-1");
    expect(mockedAlertCounts).not.toHaveBeenCalledWith("org-2");
    expect(mockedAlertCounts).not.toHaveBeenCalledWith(null);
  });

  it("org-2 user: activeAlertCountsByPlant is called with 'org-2', not 'org-1'", async () => {
    mocks.currentUser.value = mocks.fakeUserOrg2;
    mockedAlertCounts.mockResolvedValue(makeEmptyCountMap());

    await withOrg2(request(app).get("/api/portfolio/summary")).expect(200);

    expect(mockedAlertCounts).toHaveBeenCalledWith("org-2");
    expect(mockedAlertCounts).not.toHaveBeenCalledWith("org-1");
  });

  it("org-2 user receives an empty plants array (all demo plants belong to org-1)", async () => {
    mocks.currentUser.value = mocks.fakeUserOrg2;
    mockedAlertCounts.mockResolvedValue(makeEmptyCountMap());

    const res = await withOrg2(request(app).get("/api/portfolio/summary")).expect(200);
    // getOrgPlants("org-2") returns [] — no data from org-1 leaks through
    expect(res.body.plants).toHaveLength(0);
    expect(res.body.totalPlants).toBe(0);
  });

  it("org-2 user cannot see org-1 alert counts even when org-1 has active alerts", async () => {
    // Simulate org-1 having alerts in the DB; org-2 user makes the request
    mocks.currentUser.value = mocks.fakeUserOrg2;

    // Mock: org-2 query returns empty map (correct isolation behaviour)
    mockedAlertCounts.mockImplementation(async (orgId) => {
      if (orgId === "org-2") return makeEmptyCountMap();
      // If the route accidentally passes org-1, return non-zero counts
      return new Map([["plant-thar", { critical: 99, major: 99, minor: 99, informational: 99 }]]);
    });

    const res = await withOrg2(request(app).get("/api/portfolio/summary")).expect(200);

    // org-2 has no plants, so no alert counts leak
    expect(res.body.plants).toHaveLength(0);
    expect(res.body.alertCounts.critical).toBe(0);
    // Confirm the query was scoped to org-2
    expect(mockedAlertCounts).toHaveBeenCalledWith("org-2");
    expect(mockedAlertCounts).not.toHaveBeenCalledWith("org-1");
  });

  it("super-admin with no org override: activeAlertCountsByPlant is called with null", async () => {
    mocks.currentUser.value = mocks.fakeSuperAdmin;
    mockedAlertCounts.mockResolvedValue(makeEmptyCountMap());

    // Super-admin cookie — orgId matches fakeUser, isSuperAdmin=true in DB
    await request(app)
      .get("/api/portfolio/summary")
      .set("Cookie", saCookie)
      .expect(200);

    // resolveOrgId returns null for super-admin with no override
    expect(mockedAlertCounts).toHaveBeenCalledWith(null);
  });

  // ── activeAlertCountsByPlant is always called (never skipped or cached) ─────

  it("activeAlertCountsByPlant is called on every request, not skipped", async () => {
    mockedAlertCounts.mockResolvedValue(makeEmptyCountMap());

    await withOrg1(request(app).get("/api/portfolio/summary")).expect(200);
    await withOrg1(request(app).get("/api/portfolio/summary")).expect(200);
    await withOrg1(request(app).get("/api/portfolio/summary")).expect(200);

    expect(mockedAlertCounts).toHaveBeenCalledTimes(3);
  });
});
