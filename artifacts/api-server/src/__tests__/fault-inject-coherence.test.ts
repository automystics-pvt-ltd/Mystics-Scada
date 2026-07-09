/**
 * Fault injection coherence tests (Task #65)
 *
 * Verifies that after a fault is injected, the plant overview, SLD,
 * individual-inverter endpoint, fleet SSE stream, and fault-list all
 * report a consistent faulted state — and that clearing restores all
 * surfaces to their pre-injection baseline.
 *
 * Strategy
 * ─────────
 * The fault store is an in-process Map, so real injection/clearing logic
 * runs inside each test.  @workspace/db is mocked so no Postgres connection
 * is needed:
 *
 *   • db.select() → [fakeUser]  (auth + alert-count queries)
 *   • db.insert/update/delete() → []  (fault-override + alert writes)
 *
 * The mock user has isSuperAdmin:true so requirePermission("plant.manage")
 * is bypassed without a separate roles-table lookup.
 *
 * afterEach deletes all faults for PLANTS[0], keeping the in-memory store
 * clean between tests even if an earlier assertion throws.
 */

// ── 1. Mock @workspace/db before any other imports ────────────────────────────

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import crypto from "node:crypto";
import request, { type Test as SupertestTest } from "supertest";

vi.mock("@workspace/db", () => {
  const fakeUser = {
    id:          "u-test",
    orgId:       "org-1",
    roleId:      "role-admin",
    name:        "Test Admin",
    email:       "admin@example.com",
    isSuperAdmin: false,
    // Returned by the roles-table select in requirePermission — grants
    // plant.manage (and others) so POST/DELETE fault-inject routes pass.
    permissions: [
      "plant.manage",
      "alerts.manage",
      "maintenance.manage",
      "reports.view",
      "settings.view",
    ],
  };

  /**
   * Builds a chain node that is BOTH an awaitable Promise (resolves to
   * `rows`) AND exposes every Drizzle builder method, so it works regardless
   * of whether the caller ends with .limit(), .where(), .returning(), etc.
   */
  function makeChain(rows: unknown[]): any {
    return Object.assign(Promise.resolve(rows), {
      from:               () => makeChain(rows),
      where:              () => makeChain(rows),
      values:             () => makeChain(rows),
      set:                () => makeChain(rows),
      onConflictDoUpdate: () => makeChain(rows),
      returning:          () => makeChain(rows),
      limit: (n: number)  => Promise.resolve(rows.slice(0, n)),
    });
  }

  return {
    db: {
      // select returns [fakeUser]; alert-count queries receive it but find
      // no plantId/severity fields so every plant shows zero alert counts.
      select: () => makeChain([fakeUser]),
      insert: () => makeChain([]),
      update: () => makeChain([]),
      delete: () => makeChain([]),
    },
    usersTable:            {},
    rolesTable:            {},
    alertsTable:           {},
    alertHistoryTable:     {},
    notificationsTable:    {},
    faultOverridesTable:   {},
    organizationsTable:    {},
    workOrdersTable:          {},
    userPreferencesTable:     {},
    reportSchedulesTable:     {},
    insightDismissalsTable:   {},
    notificationConfigsTable: {},
    auditLogsTable:           {},
  };
});

// ── 2. App + test data imports (after mock is hoisted) ────────────────────────

import app from "../app";
import { PLANTS } from "../lib/simulation";

// Use the first demo plant for all tests
const plant   = PLANTS[0]!;
const plantId = plant.id;

const plantUrl = `/api/plants/${plantId}`;
const faultUrl = `${plantUrl}/fault-inject`;
const sldUrl   = `${plantUrl}/sld`;

// First two inverter IDs (demo plants have many inverters)
const inv0Id = `${plantId}-inv-0`;
const inv1Id = `${plantId}-inv-1`;

// ── 3. Session-cookie helpers ─────────────────────────────────────────────────

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

// Admin session: isSuperAdmin is resolved from the DB mock (fakeUser.isSuperAdmin=true)
const adminSession     = JSON.stringify({ userId: "u-test", orgId: "org-1", roleId: "role-admin" });
const adminCookieValue = signedCookieValue(adminSession, TEST_SECRET);

function withAuth(req: SupertestTest): SupertestTest {
  return req.set("Cookie", `${SESSION_COOKIE}=${encodeURIComponent(adminCookieValue)}`);
}

// ── Fleet SSE helper ──────────────────────────────────────────────────────────

interface StreamPlantEntry {
  id:               string;
  powerKw:          number;
  energyKwh:        number;
  pr:               number;
  availabilityPct:  number;
  health:           string;
  irradianceWm2:    number;
  offlineInverters: number;
}
interface FleetStreamPayload {
  timestamp: string;
  fleet:     { totalPowerMw: number; totalEnergyMwh: number; avgPr: number; totalCapacityMw: number };
  plants:    StreamPlantEntry[];
}

/**
 * Connects to `GET /api/stream/telemetry`, reads the first `telemetry` SSE
 * event, then destroys the socket.  The stream route listens for `req.close`
 * and clears all interval timers, so there are no leaks.
 */
function readFirstFleetEvent(req: SupertestTest): Promise<FleetStreamPayload> {
  return new Promise<FleetStreamPayload>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("SSE: no telemetry event within 2 s")),
      2000,
    );

    req
      .parse((res, done) => {
        let finished = false;
        const once = (err: Error | null, body: unknown) => {
          if (!finished) { finished = true; clearTimeout(timeout); done(err, body); }
        };

        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buf += chunk;
          const match = /^event: telemetry\ndata: (.+)$/m.exec(buf);
          if (match) {
            res.destroy();
            try { once(null, JSON.parse(match[1]!)); } catch (e) { once(e as Error, null); }
          }
        });
        // ECONNRESET is expected after res.destroy() — ignore it
        res.on("error", (e: Error) => {
          if ((e as NodeJS.ErrnoException).code !== "ECONNRESET") once(e, null);
        });
        res.on("end", () =>
          once(new Error("SSE: stream ended before any telemetry event"), null),
        );
      })
      .then((res) => resolve(res.body as FleetStreamPayload))
      .catch((e: Error) => {
        // superagent may surface ECONNRESET from the destroyed socket — ignore
        if ((e as NodeJS.ErrnoException).code !== "ECONNRESET") reject(e);
      });
  });
}

// ── 4. Lifecycle ──────────────────────────────────────────────────────────────

// Guarantee the fault store is clean before the suite starts — another test
// file running in the same worker could have left faults behind.
beforeAll(async () => {
  await withAuth(request(app).delete(faultUrl));
});

// Clean up between tests so a failing assertion never pollutes the next test.
afterEach(async () => {
  await withAuth(request(app).delete(faultUrl));
});

// ═══════════════════════════════════════════════════════════════════════════════
// A. Fault-list endpoint — basic access
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/plants/:plantId/fault-inject — basic access", () => {
  it("unauthenticated → 401", async () => {
    const res = await request(app).get(faultUrl).expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("unknown plant → 404", async () => {
    const res = await withAuth(request(app).get("/api/plants/not-a-plant/fault-inject")).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it("cross-org plant → 404", async () => {
    const res = await withAuth(request(app).get("/api/plants/org-2-plant/fault-inject")).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it("authenticated, no active faults → empty list", async () => {
    const res = await withAuth(request(app).get(faultUrl)).expect(200);
    expect(res.body).toMatchObject({ plantId, faults: [] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. POST body validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/plants/:plantId/fault-inject — body validation", () => {
  it("unauthenticated → 401", async () => {
    const res = await request(app)
      .post(faultUrl)
      .send({ target: "plant", durationSeconds: 30 })
      .expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("unknown plant → 404", async () => {
    const res = await withAuth(
      request(app)
        .post("/api/plants/not-a-plant/fault-inject")
        .send({ target: "plant", durationSeconds: 30 }),
    ).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it("missing target field → 400", async () => {
    const res = await withAuth(
      request(app).post(faultUrl).send({ durationSeconds: 30 }),
    ).expect(400);
    expect(res.body).toMatchObject({ error: "invalid_body" });
  });

  it("durationSeconds too short (< 5) → 400", async () => {
    const res = await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 2 }),
    ).expect(400);
    expect(res.body).toMatchObject({ error: "invalid_body" });
  });

  it("durationSeconds too long (> 300) → 400", async () => {
    const res = await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 999 }),
    ).expect(400);
    expect(res.body).toMatchObject({ error: "invalid_body" });
  });

  it("inverter target without inverterId → 400", async () => {
    const res = await withAuth(
      request(app).post(faultUrl).send({ target: "inverter", durationSeconds: 30 }),
    ).expect(400);
    expect(res.body).toMatchObject({ error: "invalid_body" });
  });

  it("inverter ID belonging to a different plant → 400", async () => {
    const res = await withAuth(
      request(app).post(faultUrl).send({
        target: "inverter",
        durationSeconds: 30,
        inverterId: "other-plant-inv-0",
      }),
    ).expect(400);
    expect(res.body).toMatchObject({ error: "invalid_inverter" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Plant-level fault — all surfaces agree
// ═══════════════════════════════════════════════════════════════════════════════

describe("plant-level fault — overview, SLD, and fault list all agree", () => {
  it("POST returns 201 with key / label / expiresAt / remainingMs", async () => {
    const res = await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    expect(res.body).toMatchObject({
      key:         `${plantId}:plant`,
      label:       expect.any(String),
      expiresAt:   expect.any(String),
      remainingMs: expect.any(Number),
    });
    expect(res.body.remainingMs).toBeGreaterThan(0);
  });

  it("fault list shows exactly one active plant-level entry", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    const res = await withAuth(request(app).get(faultUrl)).expect(200);
    expect(res.body.faults).toHaveLength(1);
    expect(res.body.faults[0]).toMatchObject({
      key:    `${plantId}:plant`,
      target: { kind: "plant" },
    });
    expect(res.body.faults[0].remainingMs).toBeGreaterThan(0);
  });

  it("plant overview shows healthStatus 'offline' after plant fault", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    const res = await withAuth(request(app).get(plantUrl)).expect(200);
    expect(res.body.healthStatus).toBe("offline");
  });

  it("plant overview shows zero live power after plant fault", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    const res = await withAuth(request(app).get(plantUrl)).expect(200);
    expect(res.body.currentPowerKw).toBe(0);
  });

  it("plant overview shows zero availability after plant fault", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    const res = await withAuth(request(app).get(plantUrl)).expect(200);
    expect(res.body.availabilityPct).toBe(0);
  });

  it("SLD shows all inverter nodes as 'offline' after plant fault", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    const res = await withAuth(request(app).get(sldUrl)).expect(200);
    const inverterNodes = (res.body.nodes as { type: string; status: string }[])
      .filter((n) => n.type === "inverter");

    expect(inverterNodes).toHaveLength(plant.inverterCount);
    for (const node of inverterNodes) {
      expect(node.status).toBe("offline");
    }
  });

  it("SLD transformer-connected edges are all de-energized after plant fault", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    const res = await withAuth(request(app).get(sldUrl)).expect(200);
    const xfmrId = `${plantId}-xfmr`;
    const xfmrEdges = (res.body.edges as { toId: string; fromId: string; energized: boolean }[])
      .filter((e) => e.toId === xfmrId || e.fromId === xfmrId);

    expect(xfmrEdges.length).toBeGreaterThan(0);
    for (const edge of xfmrEdges) {
      expect(edge.energized).toBe(false);
    }
  });

  it("overview, SLD, and fault list all agree — plant is fully offline", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    // Fetch all three surfaces in parallel
    const [overviewRes, sldRes, listRes] = await Promise.all([
      withAuth(request(app).get(plantUrl)).expect(200),
      withAuth(request(app).get(sldUrl)).expect(200),
      withAuth(request(app).get(faultUrl)).expect(200),
    ]);

    type OverviewBody = { healthStatus: string; currentPowerKw: number; availabilityPct: number };
    type SldBody      = { nodes: { type: string; status: string }[]; edges: { energized: boolean }[] };
    type ListBody     = { faults: { target: { kind: string } }[] };

    const overview  = overviewRes.body as OverviewBody;
    const sld       = sldRes.body      as SldBody;
    const faultList = listRes.body     as ListBody;

    // Overview says offline with zero output
    expect(overview.healthStatus).toBe("offline");
    expect(overview.currentPowerKw).toBe(0);
    expect(overview.availabilityPct).toBe(0);

    // SLD has every inverter node offline and every edge de-energized
    const invNodes = sld.nodes.filter((n) => n.type === "inverter");
    expect(invNodes.every((n) => n.status === "offline")).toBe(true);
    expect(sld.edges.every((e) => !e.energized)).toBe(true);

    // Fault list records the plant-level fault
    expect(faultList.faults.some((f) => f.target.kind === "plant")).toBe(true);
  });

  it("after DELETE all-clear, plant overview returns to pre-injection health", async () => {
    // Capture the deterministic baseline BEFORE injecting (simulation is time-
    // seeded so it is stable within the same second, but may be "offline" at
    // night — we must not assume a specific value).
    const baseline = await withAuth(request(app).get(plantUrl)).expect(200);
    const baselineHealth = baseline.body.healthStatus as string;

    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    // Confirm fault forced the plant offline
    const mid = await withAuth(request(app).get(plantUrl)).expect(200);
    expect(mid.body.healthStatus).toBe("offline");

    await withAuth(request(app).delete(faultUrl)).expect(204);

    // After clearing the override the simulation is authoritative again
    const res = await withAuth(request(app).get(plantUrl)).expect(200);
    expect(res.body.healthStatus).toBe(baselineHealth);
  });

  it("after DELETE all-clear, fault list is empty", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    await withAuth(request(app).delete(faultUrl)).expect(204);

    const res = await withAuth(request(app).get(faultUrl)).expect(200);
    expect(res.body.faults).toHaveLength(0);
  });

  it("after DELETE all-clear, SLD inverter nodes recover from offline", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    await withAuth(request(app).delete(faultUrl)).expect(204);

    const res = await withAuth(request(app).get(sldUrl)).expect(200);
    const invNodes = (res.body.nodes as { type: string; status: string }[])
      .filter((n) => n.type === "inverter");

    // At least some inverters should be healthy after the fault is cleared
    expect(invNodes.some((n) => n.status !== "offline")).toBe(true);
  });

  it("re-injecting after a clear works and surfaces reflect the new fault", async () => {
    // Inject, clear, inject again
    await withAuth(request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 })).expect(201);
    await withAuth(request(app).delete(faultUrl)).expect(204);
    await withAuth(request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 })).expect(201);

    const [overviewRes, listRes] = await Promise.all([
      withAuth(request(app).get(plantUrl)).expect(200),
      withAuth(request(app).get(faultUrl)).expect(200),
    ]);

    expect(overviewRes.body.healthStatus).toBe("offline");
    expect(listRes.body.faults).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Inverter-level fault — all surfaces agree
// ═══════════════════════════════════════════════════════════════════════════════

describe("inverter-level fault — SLD, inverter endpoint, and fault list all agree", () => {
  it("POST returns 201 with key matching plantId:inverterId", async () => {
    const res = await withAuth(
      request(app).post(faultUrl).send({ target: "inverter", inverterId: inv0Id, durationSeconds: 30 }),
    ).expect(201);

    expect(res.body).toMatchObject({
      key:         `${plantId}:${inv0Id}`,
      label:       expect.any(String),
      expiresAt:   expect.any(String),
      remainingMs: expect.any(Number),
    });
    expect(res.body.remainingMs).toBeGreaterThan(0);
  });

  it("fault list shows the inverter-level entry with correct target fields", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "inverter", inverterId: inv0Id, durationSeconds: 30 }),
    ).expect(201);

    const res = await withAuth(request(app).get(faultUrl)).expect(200);
    expect(res.body.faults).toHaveLength(1);
    expect(res.body.faults[0]).toMatchObject({
      key:    `${plantId}:${inv0Id}`,
      target: { kind: "inverter", inverterId: inv0Id },
    });
  });

  it("SLD shows only the targeted inverter node as 'offline'", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "inverter", inverterId: inv0Id, durationSeconds: 30 }),
    ).expect(201);

    const res = await withAuth(request(app).get(sldUrl)).expect(200);
    const invNodes = (res.body.nodes as { id: string; type: string; status: string }[])
      .filter((n) => n.type === "inverter");

    const faultedNode = invNodes.find((n) => n.id === inv0Id);
    expect(faultedNode?.status).toBe("offline");

    // All other inverters should not be forced offline (plant has many inverters)
    if (plant.inverterCount > 1) {
      const others = invNodes.filter((n) => n.id !== inv0Id);
      expect(others.some((n) => n.status !== "offline")).toBe(true);
    }
  });

  it("individual inverter endpoint shows status 'comm_lost' after inverter fault", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "inverter", inverterId: inv0Id, durationSeconds: 30 }),
    ).expect(201);

    const res = await withAuth(request(app).get(`/api/inverters/${inv0Id}`)).expect(200);
    expect(res.body.status).toBe("comm_lost");
  });

  it("plant overview, SLD, inverter endpoint, and fault list all agree on inverter fault", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "inverter", inverterId: inv0Id, durationSeconds: 30 }),
    ).expect(201);

    const [overviewRes, sldRes, invRes, listRes] = await Promise.all([
      withAuth(request(app).get(plantUrl)).expect(200),
      withAuth(request(app).get(sldUrl)).expect(200),
      withAuth(request(app).get(`/api/inverters/${inv0Id}`)).expect(200),
      withAuth(request(app).get(faultUrl)).expect(200),
    ]);

    // Plant is degraded (at least one inverter offline → healthStatus ≠ "normal")
    expect(overviewRes.body.healthStatus).not.toBe("normal");

    // The targeted SLD node is "offline"
    const sldInvNode = (sldRes.body.nodes as { id: string; type: string; status: string }[])
      .find((n) => n.id === inv0Id && n.type === "inverter");
    expect(sldInvNode?.status).toBe("offline");

    // The inverter endpoint uses InverterStatus "comm_lost" for a forced-offline inverter
    expect(invRes.body.status).toBe("comm_lost");

    // Fault list records the inverter target
    expect(
      (listRes.body.faults as { target: { kind: string; inverterId?: string } }[])
        .some((f) => f.target.kind === "inverter" && f.target.inverterId === inv0Id),
    ).toBe(true);
  });

  it("offlineInverterCount in plant detail increments after inverter fault", async () => {
    const before = await withAuth(request(app).get(plantUrl)).expect(200);
    const countBefore = before.body.offlineInverterCount as number;

    await withAuth(
      request(app).post(faultUrl).send({ target: "inverter", inverterId: inv0Id, durationSeconds: 30 }),
    ).expect(201);

    const after = await withAuth(request(app).get(plantUrl)).expect(200);
    expect(after.body.offlineInverterCount).toBeGreaterThan(countBefore);
  });

  it("after DELETE by-suffix clear, inverter recovers on all surfaces", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "inverter", inverterId: inv0Id, durationSeconds: 30 }),
    ).expect(201);

    // Clear only this inverter using the by-suffix route
    await withAuth(request(app).delete(`${faultUrl}/by/${inv0Id}`)).expect(204);

    const [listRes, invRes, sldRes] = await Promise.all([
      withAuth(request(app).get(faultUrl)).expect(200),
      withAuth(request(app).get(`/api/inverters/${inv0Id}`)).expect(200),
      withAuth(request(app).get(sldUrl)).expect(200),
    ]);

    // Fault list is empty
    expect(listRes.body.faults).toHaveLength(0);

    // Inverter is no longer comm_lost
    expect(invRes.body.status).not.toBe("comm_lost");

    // SLD node is no longer offline
    const sldInvNode = (sldRes.body.nodes as { id: string; type: string; status: string }[])
      .find((n) => n.id === inv0Id && n.type === "inverter");
    expect(sldInvNode?.status).not.toBe("offline");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Multiple simultaneous faults
// ═══════════════════════════════════════════════════════════════════════════════

describe("multiple simultaneous inverter faults", () => {
  it("two inverter faults → both appear in the fault list", async () => {
    await Promise.all([
      withAuth(
        request(app).post(faultUrl).send({ target: "inverter", inverterId: inv0Id, durationSeconds: 30 }),
      ).expect(201),
      withAuth(
        request(app).post(faultUrl).send({ target: "inverter", inverterId: inv1Id, durationSeconds: 30 }),
      ).expect(201),
    ]);

    const res = await withAuth(request(app).get(faultUrl)).expect(200);
    expect(res.body.faults).toHaveLength(2);

    const keys = (res.body.faults as { key: string }[]).map((f) => f.key);
    expect(keys).toContain(`${plantId}:${inv0Id}`);
    expect(keys).toContain(`${plantId}:${inv1Id}`);
  });

  it("both faulted inverter nodes show as 'offline' in the SLD", async () => {
    await Promise.all([
      withAuth(
        request(app).post(faultUrl).send({ target: "inverter", inverterId: inv0Id, durationSeconds: 30 }),
      ).expect(201),
      withAuth(
        request(app).post(faultUrl).send({ target: "inverter", inverterId: inv1Id, durationSeconds: 30 }),
      ).expect(201),
    ]);

    const res = await withAuth(request(app).get(sldUrl)).expect(200);
    const invNodes = (res.body.nodes as { id: string; type: string; status: string }[])
      .filter((n) => n.type === "inverter");

    const faultedNodes = invNodes.filter((n) => n.id === inv0Id || n.id === inv1Id);
    expect(faultedNodes).toHaveLength(2);
    for (const node of faultedNodes) {
      expect(node.status).toBe("offline");
    }
  });

  it("DELETE all-clear removes every simultaneous fault", async () => {
    await Promise.all([
      withAuth(
        request(app).post(faultUrl).send({ target: "inverter", inverterId: inv0Id, durationSeconds: 30 }),
      ).expect(201),
      withAuth(
        request(app).post(faultUrl).send({ target: "inverter", inverterId: inv1Id, durationSeconds: 30 }),
      ).expect(201),
    ]);

    await withAuth(request(app).delete(faultUrl)).expect(204);

    const res = await withAuth(request(app).get(faultUrl)).expect(200);
    expect(res.body.faults).toHaveLength(0);
  });

  it("by-suffix clear removes only the targeted fault, leaving the other active", async () => {
    await Promise.all([
      withAuth(
        request(app).post(faultUrl).send({ target: "inverter", inverterId: inv0Id, durationSeconds: 30 }),
      ).expect(201),
      withAuth(
        request(app).post(faultUrl).send({ target: "inverter", inverterId: inv1Id, durationSeconds: 30 }),
      ).expect(201),
    ]);

    // Clear only inv0
    await withAuth(request(app).delete(`${faultUrl}/by/${inv0Id}`)).expect(204);

    const res = await withAuth(request(app).get(faultUrl)).expect(200);
    // inv1 should still be active
    expect(res.body.faults).toHaveLength(1);
    expect(res.body.faults[0]).toMatchObject({
      target: { kind: "inverter", inverterId: inv1Id },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Fleet stream coherence — SSE telemetry agrees with fault state
// ═══════════════════════════════════════════════════════════════════════════════

describe("fleet stream coherence — first telemetry event agrees with fault state", () => {
  it("before any fault the stream plant entry matches the overview health", async () => {
    const [overview, payload] = await Promise.all([
      withAuth(request(app).get(plantUrl)).expect(200),
      readFirstFleetEvent(withAuth(request(app).get("/api/stream/telemetry"))),
    ]);
    const streamPlant = payload.plants.find((p) => p.id === plantId);
    expect(streamPlant?.health).toBe(overview.body.healthStatus as string);
  });

  it("plant-level fault — stream shows health 'offline' and powerKw 0", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    const payload = await readFirstFleetEvent(
      withAuth(request(app).get("/api/stream/telemetry")),
    );

    const streamPlant = payload.plants.find((p) => p.id === plantId);
    expect(streamPlant?.health).toBe("offline");
    expect(streamPlant?.powerKw).toBe(0);
  });

  it("plant-level fault — stream shows all inverters as offline", async () => {
    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    const payload = await readFirstFleetEvent(
      withAuth(request(app).get("/api/stream/telemetry")),
    );

    const streamPlant = payload.plants.find((p) => p.id === plantId);
    expect(streamPlant?.offlineInverters).toBe(plant.inverterCount);
  });

  it("inverter-level fault — stream shows incremented offlineInverters count", async () => {
    // Capture baseline count before any fault
    const baseline = await readFirstFleetEvent(
      withAuth(request(app).get("/api/stream/telemetry")),
    );
    const baselinePlant = baseline.plants.find((p) => p.id === plantId)!;

    await withAuth(
      request(app).post(faultUrl).send({ target: "inverter", inverterId: inv0Id, durationSeconds: 30 }),
    ).expect(201);

    const after = await readFirstFleetEvent(
      withAuth(request(app).get("/api/stream/telemetry")),
    );

    const afterPlant = after.plants.find((p) => p.id === plantId);
    expect(afterPlant?.offlineInverters).toBeGreaterThan(baselinePlant.offlineInverters);
  });

  it("after DELETE all-clear, stream health returns to baseline", async () => {
    const baseline = await readFirstFleetEvent(
      withAuth(request(app).get("/api/stream/telemetry")),
    );
    const baselineHealth = baseline.plants.find((p) => p.id === plantId)?.health;

    await withAuth(
      request(app).post(faultUrl).send({ target: "plant", durationSeconds: 30 }),
    ).expect(201);

    await withAuth(request(app).delete(faultUrl)).expect(204);

    const recovered = await readFirstFleetEvent(
      withAuth(request(app).get("/api/stream/telemetry")),
    );
    const recoveredHealth = recovered.plants.find((p) => p.id === plantId)?.health;
    expect(recoveredHealth).toBe(baselineHealth);
  });
});
