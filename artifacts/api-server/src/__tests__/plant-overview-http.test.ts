/**
 * Plant overview routes — HTTP integration tests (Task #59)
 *
 * Fires real HTTP requests through the full Express middleware stack via
 * supertest:
 *   cookie-parser → authenticate → resolveOrgId → plantsRouter
 *
 * Covers:
 *  1. GET /api/plants        → 200 with an array of correctly-shaped plant
 *                              summaries (one per plant in org-1).
 *  2. GET /api/plants/:id    → 200 with full plant detail for each known plant.
 *  3. Unauthenticated        → 401 { error: "unauthenticated" }.
 *  4. Tampered session cookie → 401.
 *  5. Unknown plantId        → 404 { error: "not_found" }.
 *  6. Cross-org plant        → 404 (plant not found in the user's org).
 *
 * @workspace/db is mocked so no real database connection is needed.
 * SESSION_SECRET is injected via vitest.config.ts test.env.
 */

// ── 1. Mock @workspace/db before any imports ──────────────────────────────────
//
// Two query patterns are used by the routes under test:
//
//   authenticate:          db.select({…}).from(usersTable).where(…).limit(1)
//   activeAlertCountsByPlant: db.select({…}).from(alertsTable).where(and(…))
//                             — no trailing .limit(), awaited directly
//
// Using Object.assign(Promise.resolve(rows), { chain methods }) makes every
// level of the builder chain both a Promise (for direct await) and a builder
// (for further chaining), so both patterns resolve without errors.

import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import request, { type Test as SupertestTest } from "supertest";

vi.mock("@workspace/db", () => {
  const fakeUser = {
    id: "u-test",
    orgId: "org-1",
    roleId: "role-operator",
    name: "Test Operator",
    email: "test@example.com",
    isSuperAdmin: false,
  };

  /**
   * A chain node that is BOTH awaitable (Promise resolving to `rows`) AND has
   * every Drizzle builder method — so it works whether the caller ends with
   * .limit(), .where(), or nothing.
   */
  function makeChain(rows: unknown[]): any {
    return Object.assign(Promise.resolve(rows), {
      from:               () => makeChain(rows),
      where:              () => makeChain(rows),
      values:             () => makeChain(rows),
      set:                () => makeChain(rows),
      onConflictDoUpdate: () => makeChain(rows),
      // .limit(n) slices — authenticate does .limit(1) and expects at most 1 row
      limit: (n: number) => Promise.resolve(rows.slice(0, n)),
    });
  }

  return {
    db: {
      // All select queries return [fakeUser].  For alert-count queries the
      // fakeUser row has no `plantId` / `severity` fields, so the accumulator
      // never increments anything and every plant shows zero alert counts —
      // which is correct for a test environment with no real alerts.
      select: () => makeChain([fakeUser]),
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

// ── 2. Imports ────────────────────────────────────────────────────────────────

import app from "../app";
import { PLANTS } from "../lib/simulation";

// ── 3. Cookie helpers ─────────────────────────────────────────────────────────

/**
 * Build a signed cookie value compatible with cookie-parser / cookie-signature:
 *   "s:" + value + "." + HMAC-SHA256(value, secret).base64.trimEnd("=")
 */
function signedCookieValue(value: string, secret: string): string {
  const sig = crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("base64")
    .replace(/=+$/, "");
  return `s:${value}.${sig}`;
}

const SESSION_COOKIE = "scada_session";
const TEST_SECRET    = process.env["SESSION_SECRET"]!;

const validSession     = JSON.stringify({ userId: "u-test", orgId: "org-1", roleId: "role-operator" });
const validCookieValue = signedCookieValue(validSession, TEST_SECRET);

function withAuth(req: SupertestTest): SupertestTest {
  return req.set("Cookie", `${SESSION_COOKIE}=${encodeURIComponent(validCookieValue)}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// ── A. GET /api/plants ────────────────────────────────────────────────────────

describe("GET /api/plants", () => {
  it("unauthenticated → 401", async () => {
    const res = await request(app).get("/api/plants").expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("tampered session cookie → 401", async () => {
    const tampered = `${SESSION_COOKIE}=${encodeURIComponent(validCookieValue + "TAMPERED")}`;
    const res = await request(app).get("/api/plants").set("Cookie", tampered).expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("authenticated → 200 with an array of plant summaries", async () => {
    const res = await withAuth(request(app).get("/api/plants")).expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // org-1 owns all 4 demo plants
    expect(res.body.length).toBe(PLANTS.length);
  });

  it("each plant summary has the required fields with correct types", async () => {
    const res = await withAuth(request(app).get("/api/plants")).expect(200);

    for (const plant of res.body as Record<string, unknown>[]) {
      // Identity
      expect(typeof plant["id"]).toBe("string");
      expect(typeof plant["name"]).toBe("string");
      expect(typeof plant["region"]).toBe("string");

      // Geo
      expect(typeof plant["lat"]).toBe("number");
      expect(typeof plant["lng"]).toBe("number");

      // Power / energy
      expect(typeof plant["capacityKw"]).toBe("number");
      expect((plant["capacityKw"] as number)).toBeGreaterThan(0);
      expect(typeof plant["currentPowerKw"]).toBe("number");
      expect(typeof plant["todayEnergyKwh"]).toBe("number");
      expect(typeof plant["pr"]).toBe("number");
      expect(typeof plant["availabilityPct"]).toBe("number");

      // Health
      expect(["normal", "warning", "fault", "offline"]).toContain(plant["healthStatus"]);

      // Alert counts object
      const ac = plant["alertCounts"] as Record<string, unknown>;
      expect(typeof ac).toBe("object");
      expect(typeof ac["critical"]).toBe("number");
      expect(typeof ac["major"]).toBe("number");
      expect(typeof ac["minor"]).toBe("number");
      expect(typeof ac["informational"]).toBe("number");
    }
  });

  it("plant IDs in the response match the known org-1 plant set", async () => {
    const res = await withAuth(request(app).get("/api/plants")).expect(200);
    const ids = (res.body as Record<string, unknown>[]).map((p) => p["id"]).sort();
    const expectedIds = PLANTS.map((p) => p.id).sort();
    expect(ids).toEqual(expectedIds);
  });
});

// ── B. GET /api/plants/:plantId ───────────────────────────────────────────────

describe("GET /api/plants/:plantId", () => {
  it("unauthenticated → 401", async () => {
    const res = await request(app).get(`/api/plants/${PLANTS[0]!.id}`).expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("unknown plantId → 404", async () => {
    const res = await withAuth(
      request(app).get("/api/plants/plant-does-not-exist"),
    ).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it("cross-org plant → 404", async () => {
    // "plant-other-org" is not in PLANT_ORG_MAP for org-1
    const res = await withAuth(
      request(app).get("/api/plants/plant-other-org"),
    ).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  // One it-block per plant so failures identify the exact plant
  for (const plant of PLANTS) {
    it(`${plant.name} (${plant.id}) → 200 with full detail shape`, async () => {
      const res = await withAuth(
        request(app).get(`/api/plants/${plant.id}`),
      ).expect(200);

      const body = res.body as Record<string, unknown>;

      // Identity — must match the requested plant
      expect(body["id"]).toBe(plant.id);
      expect(body["name"]).toBe(plant.name);
      expect(typeof body["region"]).toBe("string");

      // Geo
      expect(typeof body["lat"]).toBe("number");
      expect(typeof body["lng"]).toBe("number");

      // Power / energy
      expect(typeof body["capacityKw"]).toBe("number");
      expect((body["capacityKw"] as number)).toBeGreaterThan(0);
      expect(typeof body["currentPowerKw"]).toBe("number");
      expect(typeof body["todayEnergyKwh"]).toBe("number");
      expect(typeof body["todayTargetKwh"]).toBe("number");
      expect(typeof body["pr"]).toBe("number");
      expect(typeof body["availabilityPct"]).toBe("number");

      // Health
      expect(["normal", "warning", "fault", "offline"]).toContain(body["healthStatus"]);

      // Alert counts
      const ac = body["alertCounts"] as Record<string, unknown>;
      expect(typeof ac["critical"]).toBe("number");
      expect(typeof ac["major"]).toBe("number");
      expect(typeof ac["minor"]).toBe("number");
      expect(typeof ac["informational"]).toBe("number");

      // Detail-only fields
      expect(typeof body["irradiancePoaWm2"]).toBe("number");
      expect(typeof body["irradianceGhiWm2"]).toBe("number");
      expect(typeof body["ambientTempC"]).toBe("number");
      expect(typeof body["moduleTempC"]).toBe("number");
      expect(typeof body["inverterCount"]).toBe("number");
      expect((body["inverterCount"] as number)).toBe(plant.inverterCount);
      expect(typeof body["offlineInverterCount"]).toBe("number");
      expect(typeof body["lastUpdated"]).toBe("string"); // ISO timestamp over JSON
    });
  }
});
