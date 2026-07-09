/**
 * Inverter routes — HTTP integration tests (Task #60)
 *
 * Fires real HTTP requests through the full Express middleware stack via
 * supertest:
 *   cookie-parser → authenticate → resolveOrgId → plantsRouter / invertersRouter
 *
 * Covers:
 *  1. GET /api/plants/:plantId/inverters
 *     → 200 with an array of inverter summaries; length == plant.inverterCount;
 *       each item has the required Inverter fields.
 *  2. GET /api/inverters/:inverterId
 *     → 200 with full inverter detail shape.
 *  3. GET /api/inverters/:inverterId/strings
 *     → 200 with an array of string readings.
 *  4. GET /api/inverters/:inverterId/trend
 *     → 200 with an array of trend points for each valid range.
 *  5. Unauthenticated → 401 { error: "unauthenticated" }.
 *  6. Unknown / cross-org plant or inverter → 404 { error: "not_found" }.
 *
 * @workspace/db is mocked; SESSION_SECRET is injected via vitest.config.ts.
 */

import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import request, { type Test as SupertestTest } from "supertest";

// ── Mock @workspace/db before any route imports ───────────────────────────────
// Object.assign(Promise.resolve(rows), chainMethods) makes every chain level
// directly awaitable AND chainable, handling both:
//   authenticate: .from(...).where(...).limit(1)   — ends with .limit()
//   any future query that awaits after .where() directly — no .limit()

vi.mock("@workspace/db", () => {
  const fakeUser = {
    id: "u-test",
    orgId: "org-1",
    roleId: "role-operator",
    name: "Test Operator",
    email: "test@example.com",
    isSuperAdmin: false,
  };

  function makeChain(rows: unknown[]): any {
    return Object.assign(Promise.resolve(rows), {
      from:               () => makeChain(rows),
      where:              () => makeChain(rows),
      values:             () => makeChain(rows),
      set:                () => makeChain(rows),
      onConflictDoUpdate: () => makeChain(rows),
      limit: (n: number)  => Promise.resolve(rows.slice(0, n)),
    });
  }

  return {
    db: {
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

// ── Imports ───────────────────────────────────────────────────────────────────

import app from "../app";
import { PLANTS } from "../lib/simulation";

// ── Cookie helpers ────────────────────────────────────────────────────────────

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
const validSession   = JSON.stringify({ userId: "u-test", orgId: "org-1", roleId: "role-operator" });
const validCookie    = signedCookieValue(validSession, TEST_SECRET);

function withAuth(req: SupertestTest): SupertestTest {
  return req.set("Cookie", `${SESSION_COOKIE}=${encodeURIComponent(validCookie)}`);
}

// ── Inverter status values from the OpenAPI spec ──────────────────────────────
const INVERTER_STATUSES = ["running", "standby", "fault", "comm_lost"] as const;

// ── A. GET /api/plants/:plantId/inverters ─────────────────────────────────────

describe("GET /api/plants/:plantId/inverters", () => {
  it("unauthenticated → 401", async () => {
    const res = await request(app)
      .get(`/api/plants/${PLANTS[0]!.id}/inverters`)
      .expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("unknown plantId → 404", async () => {
    const res = await withAuth(
      request(app).get("/api/plants/plant-does-not-exist/inverters"),
    ).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it("cross-org plant → 404", async () => {
    const res = await withAuth(
      request(app).get("/api/plants/plant-other-org/inverters"),
    ).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  for (const plant of PLANTS) {
    it(`${plant.name} (${plant.id}) → 200, ${plant.inverterCount} inverters with correct shape`, async () => {
      const res = await withAuth(
        request(app).get(`/api/plants/${plant.id}/inverters`),
      ).expect(200);

      const body = res.body as Record<string, unknown>[];
      expect(Array.isArray(body)).toBe(true);

      // One entry per inverter
      expect(body.length).toBe(plant.inverterCount);

      for (const inv of body) {
        // Identity
        expect(typeof inv["id"]).toBe("string");
        expect((inv["id"] as string).startsWith(plant.id)).toBe(true);
        expect(inv["plantId"]).toBe(plant.id);
        expect(typeof inv["name"]).toBe("string");

        // Status
        expect(INVERTER_STATUSES).toContain(inv["status"]);

        // AC / DC power + electrical readings
        expect(typeof inv["acPowerKw"]).toBe("number");
        expect(typeof inv["dcPowerKw"]).toBe("number");
        expect(typeof inv["acVoltageV"]).toBe("number");
        expect(typeof inv["acCurrentA"]).toBe("number");
        expect(typeof inv["dcVoltageV"]).toBe("number");
        expect(typeof inv["dcCurrentA"]).toBe("number");
        expect(typeof inv["frequencyHz"]).toBe("number");
        expect(typeof inv["efficiencyPct"]).toBe("number");
        expect(typeof inv["temperatureC"]).toBe("number");
        expect(typeof inv["powerFactor"]).toBe("number");

        // Energy counters
        expect(typeof inv["dailyEnergyKwh"]).toBe("number");
        expect(typeof inv["monthlyEnergyKwh"]).toBe("number");
        expect(typeof inv["lifetimeEnergyMwh"]).toBe("number");

        // Timestamp (serialised as ISO string over JSON)
        expect(typeof inv["lastUpdated"]).toBe("string");
      }
    });
  }

  it("inverter IDs across all plants are unique and plant-prefixed", async () => {
    const allIds: string[] = [];
    for (const plant of PLANTS) {
      const res = await withAuth(
        request(app).get(`/api/plants/${plant.id}/inverters`),
      ).expect(200);
      for (const inv of res.body as Record<string, unknown>[]) {
        allIds.push(inv["id"] as string);
      }
    }
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

// ── B. GET /api/inverters/:inverterId ─────────────────────────────────────────

describe("GET /api/inverters/:inverterId", () => {
  const plant   = PLANTS[0]!;
  const invId   = `${plant.id}-inv-0`;

  it("unauthenticated → 401", async () => {
    const res = await request(app).get(`/api/inverters/${invId}`).expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("unknown inverterId → 404", async () => {
    const res = await withAuth(
      request(app).get("/api/inverters/plant-does-not-exist-inv-0"),
    ).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it("cross-org inverterId → 404", async () => {
    const res = await withAuth(
      request(app).get("/api/inverters/plant-other-org-inv-0"),
    ).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it("out-of-range inverter index → 404", async () => {
    const res = await withAuth(
      request(app).get(`/api/inverters/${plant.id}-inv-9999`),
    ).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it("valid inverterId → 200 with full inverter shape", async () => {
    const res = await withAuth(
      request(app).get(`/api/inverters/${invId}`),
    ).expect(200);

    const inv = res.body as Record<string, unknown>;
    expect(inv["id"]).toBe(invId);
    expect(inv["plantId"]).toBe(plant.id);
    expect(INVERTER_STATUSES).toContain(inv["status"]);
    expect(typeof inv["acPowerKw"]).toBe("number");
    expect(typeof inv["dcPowerKw"]).toBe("number");
    expect(typeof inv["acVoltageV"]).toBe("number");
    expect(typeof inv["acCurrentA"]).toBe("number");
    expect(typeof inv["dcVoltageV"]).toBe("number");
    expect(typeof inv["dcCurrentA"]).toBe("number");
    expect(typeof inv["frequencyHz"]).toBe("number");
    expect(typeof inv["efficiencyPct"]).toBe("number");
    expect(typeof inv["temperatureC"]).toBe("number");
    expect(typeof inv["powerFactor"]).toBe("number");
    expect(typeof inv["dailyEnergyKwh"]).toBe("number");
    expect(typeof inv["monthlyEnergyKwh"]).toBe("number");
    expect(typeof inv["lifetimeEnergyMwh"]).toBe("number");
    expect(typeof inv["lastUpdated"]).toBe("string");
  });

  it("all inverters on each plant return 200 individually", async () => {
    for (const p of PLANTS) {
      for (let i = 0; i < p.inverterCount; i++) {
        const id = `${p.id}-inv-${i}`;
        await withAuth(request(app).get(`/api/inverters/${id}`)).expect(200);
      }
    }
  });
});

// ── C. GET /api/inverters/:inverterId/strings ─────────────────────────────────

describe("GET /api/inverters/:inverterId/strings", () => {
  const plant = PLANTS[0]!;
  const invId = `${plant.id}-inv-0`;

  it("unauthenticated → 401", async () => {
    const res = await request(app)
      .get(`/api/inverters/${invId}/strings`)
      .expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("unknown inverterId → 404", async () => {
    const res = await withAuth(
      request(app).get("/api/inverters/plant-does-not-exist-inv-0/strings"),
    ).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it("cross-org inverterId → 404", async () => {
    const res = await withAuth(
      request(app).get("/api/inverters/plant-other-org-inv-0/strings"),
    ).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it("valid inverterId → 200 with array of string readings", async () => {
    const res = await withAuth(
      request(app).get(`/api/inverters/${invId}/strings`),
    ).expect(200);

    const body = res.body as Record<string, unknown>[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(plant.stringsPerInverter);

    for (const s of body) {
      expect(typeof s["id"]).toBe("string");
      expect(typeof s["label"]).toBe("string");
      expect(typeof s["currentA"]).toBe("number");
      expect(typeof s["voltageV"]).toBe("number");
      expect(typeof s["deviationPct"]).toBe("number");
    }
  });
});

// ── D. GET /api/inverters/:inverterId/trend ───────────────────────────────────

describe("GET /api/inverters/:inverterId/trend", () => {
  const plant = PLANTS[0]!;
  const invId = `${plant.id}-inv-0`;

  it("unauthenticated → 401", async () => {
    const res = await request(app)
      .get(`/api/inverters/${invId}/trend?range=hour`)
      .expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("unknown inverterId → 404", async () => {
    const res = await withAuth(
      request(app).get("/api/inverters/plant-does-not-exist-inv-0/trend?range=hour"),
    ).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it("cross-org inverterId → 404", async () => {
    const res = await withAuth(
      request(app).get("/api/inverters/plant-other-org-inv-0/trend?range=hour"),
    ).expect(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  for (const range of ["hour", "day", "week", "month"] as const) {
    it(`range=${range} → 200 with non-empty trend array`, async () => {
      const res = await withAuth(
        request(app).get(`/api/inverters/${invId}/trend?range=${range}`),
      ).expect(200);

      const body = res.body as Record<string, unknown>[];
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);

      // Spot-check first point shape
      const pt = body[0]!;
      expect(typeof pt["timestamp"]).toBe("string");
      expect(typeof pt["acPowerKw"]).toBe("number");
      expect(typeof pt["dcPowerKw"]).toBe("number");
      expect(typeof pt["temperatureC"]).toBe("number");
      expect(typeof pt["efficiencyPct"]).toBe("number");
    });
  }
});
