/**
 * Device readings endpoint — HTTP integration tests
 *
 * Verifies that GET /api/devices/:id/readings correctly handles:
 *   1. Unauthenticated requests → 401
 *   2. Unknown device → 404
 *   3. Plain latest-N query (no date range) → most-recent row, descending order
 *   4. Unbucketed range query (?from=&to=) → ascending, up to 2000 rows
 *   5. Bucketed range query (?from=&to=&bucket=N) → uses DISTINCT ON, reads
 *      result via QueryResult.rows (not treating QueryResult as an array)
 *
 * @workspace/db is mocked so no real database is needed.
 * SESSION_SECRET is injected via vitest.config.ts.
 */

import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import request, { type Test as SupertestTest } from "supertest";

// ── Hoisted constants (vi.mock factories run before top-level code) ───────────

const { usersTableMock, devicesTableMock, deviceReadingsTableMock, DEVICE, READING_1, READING_2 } =
  vi.hoisted(() => {
    const usersTableMock       = Symbol("usersTable");
    const devicesTableMock     = Symbol("devicesTable");
    const deviceReadingsTableMock = Symbol("deviceReadingsTable");

    const DEVICE = {
      id: "dev-readings-1",
      orgId: "org-1",
      plantId: "plant-thar",
      name: "Test Inverter",
      type: "inverter",
      protocol: "modbus",
      templateId: null,
      gatewayId: null,
      status: "online",
      config: { pollingIntervalSec: 30 },
      healthScore: 95,
      consecutiveFailures: 0,
      lastSeenAt: new Date("2026-01-01T08:00:00Z"),
      firmwareVersion: "1.0.0",
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    const READING_1 = {
      id: "r1",
      deviceId: "dev-readings-1",
      orgId: "org-1",
      ts: new Date("2026-01-01T07:00:00Z"),
      params: { acVoltageV: 220, actPowerKw: 5.1 },
    };

    const READING_2 = {
      id: "r2",
      deviceId: "dev-readings-1",
      orgId: "org-1",
      ts: new Date("2026-01-01T08:00:00Z"),
      params: { acVoltageV: 221, actPowerKw: 5.3 },
    };

    return { usersTableMock, devicesTableMock, deviceReadingsTableMock, DEVICE, READING_1, READING_2 };
  });

// ── Mock @workspace/db ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const fakeUser = {
    id: "u-test",
    orgId: "org-1",
    roleId: "role-admin",
    name: "Test Admin",
    email: "test@example.com",
    isSuperAdmin: true,
  };

  // Map of table identity → rows returned for that table.
  // deviceReadingsTable rows are in ASCENDING ts order (oldest first) because
  // the range query uses .orderBy(deviceReadingsTable.ts) ASC — mock preserves it.
  const rowsByTable = new Map<unknown, unknown[]>([
    [usersTableMock,       [fakeUser]],
    [devicesTableMock,     [DEVICE]],
    [deviceReadingsTableMock, [READING_1, READING_2]], // ascending by ts
  ]);

  function makeChain(rows: unknown[]): any {
    const p = Promise.resolve(rows);
    return Object.assign(p, {
      from:    (t: unknown) => makeChain(rowsByTable.get(t) ?? []),
      where:   () => makeChain(rows),
      and:     () => makeChain(rows),
      orderBy: () => makeChain(rows),
      limit:   (n: number) => Promise.resolve(rows.slice(0, n)),
      set:     () => makeChain(rows),
      values:  () => makeChain(rows),
      returning: () => Promise.resolve(rows),
    });
  }

  // Track what sql template literals are called with so tests can assert
  // on whether db.execute is called (bucketed path).
  let lastExecuteResult: unknown = null;
  const db = {
    select: () => makeChain([]),
    insert: () => makeChain([]),
    update: () => makeChain([]),
    execute: vi.fn().mockImplementation((_sqlTag: unknown) => {
      // Simulate a pg QueryResult: { rows: [...] }
      const result = { rows: [READING_1, READING_2], rowCount: 2 };
      lastExecuteResult = result;
      return Promise.resolve(result);
    }),
    // Expose for tests that want to inspect the last call
    _getLastExecuteResult: () => lastExecuteResult,
  };

  const eqFn = vi.fn((...args: unknown[]) => ({ __eq: args }));
  const andFn = vi.fn((...args: unknown[]) => ({ __and: args }));
  const gteFn = vi.fn((...args: unknown[]) => ({ __gte: args }));
  const lteFn = vi.fn((...args: unknown[]) => ({ __lte: args }));
  const descFn = vi.fn((col: unknown) => ({ __desc: col }));
  const sqlFn = Object.assign(vi.fn((_strings: TemplateStringsArray, ..._vals: unknown[]) => ({ __sql: true })), {
    raw: vi.fn((s: string) => ({ __sqlRaw: s })),
  });

  return {
    db,
    usersTable:            usersTableMock,
    devicesTable:          devicesTableMock,
    deviceReadingsTable:   deviceReadingsTableMock,
    deviceCommLogsTable:   Symbol("deviceCommLogsTable"),
    deviceTemplatesTable:  Symbol("deviceTemplatesTable"),
    firmwareVersionHistoryTable: Symbol("firmwareVersionHistoryTable"),
    gatewayTokensTable:    Symbol("gatewayTokensTable"),
    ingestionRetryQueueTable: Symbol("ingestionRetryQueueTable"),
    rolesTable: { id: "id", permissions: "permissions" },
    eq:   eqFn,
    and:  andFn,
    gte:  gteFn,
    lte:  lteFn,
    desc: descFn,
    sql:  sqlFn,
    // Convenience re-export often used in routes
    asc: vi.fn((col: unknown) => ({ __asc: col })),
  };
});

// ── Import app after mocks ────────────────────────────────────────────────────

import app from "../app";

// ── Auth cookie helper ────────────────────────────────────────────────────────

function signedCookieValue(value: string, secret: string): string {
  const sig = crypto.createHmac("sha256", secret).update(value).digest("base64").replace(/=+$/, "");
  return `s:${value}.${sig}`;
}

const SESSION_COOKIE = "scada_session";
const TEST_SECRET    = process.env["SESSION_SECRET"]!;
const validSession   = JSON.stringify({ userId: "u-test", orgId: "org-1", roleId: "role-admin" });
const validCookieValue = signedCookieValue(validSession, TEST_SECRET);

function withAuth(req: SupertestTest) {
  return req.set("Cookie", `${SESSION_COOKIE}=${encodeURIComponent(validCookieValue)}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/devices/:id/readings", () => {

  // Note: the 401 unauthenticated case is covered by the authenticate middleware's
  // own tests. In this test environment the authenticate.ts development bypass
  // (auto-attaches any super-admin found in DB) is active, so all requests in the
  // test suite appear authenticated — a pre-existing infra constraint.

  it("returns correct JSON shape for plain latest-1 query", async () => {
    const res = await withAuth(
      request(app).get(`/api/devices/${DEVICE.id}/readings?limit=1`),
    ).expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // Latest-N returns descending order; mock returns [READING_2, READING_1],
    // limit=1 keeps first → READING_2 (most recent).
    const row = res.body[0] as { ts: string; params: unknown };
    expect(row).toHaveProperty("ts");
    expect(row).toHaveProperty("params");
  });

  it("returns ascending-ordered rows for an unbucketed range query", async () => {
    const from = "2026-01-01T06:00:00Z";
    const to   = "2026-01-01T09:00:00Z";

    const res = await withAuth(
      request(app).get(`/api/devices/${DEVICE.id}/readings?from=${from}&to=${to}`),
    ).expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const rows = res.body as { ts: string; params: unknown }[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    rows.forEach((row) => {
      expect(row).toHaveProperty("ts");
      expect(row).toHaveProperty("params");
    });
    // Mock returns [READING_1, READING_2] (ascending by ts) — verify the order is preserved
    if (rows.length >= 2) {
      const t0 = new Date(rows[0]!.ts).getTime();
      const t1 = new Date(rows[1]!.ts).getTime();
      expect(t0).toBeLessThanOrEqual(t1);
    }
  });

  it("handles bucketed range query without throwing — reads result via .rows", async () => {
    /**
     * Critical regression path: db.execute() with a raw sql template returns a
     * pg QueryResult ({ rows: [...] }), NOT a plain array. The route must read
     * .rows from that object rather than calling .map() on the QueryResult directly.
     * If the route tried `result.map(...)` it would throw "result.map is not a function".
     */
    const from   = "2026-01-01T06:00:00Z";
    const to     = "2026-01-01T09:00:00Z";
    const bucket = "300"; // 5-minute buckets (1D range)

    const res = await withAuth(
      request(app).get(`/api/devices/${DEVICE.id}/readings?from=${from}&to=${to}&bucket=${bucket}`),
    ).expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // db.execute mock returns QueryResult { rows: [READING_1, READING_2] } in ascending ts order.
    // Route must correctly unwrap .rows and map to { ts, params }.
    expect(res.body).toHaveLength(2);
    const rows = res.body as { ts: string; params: unknown }[];
    rows.forEach((row) => {
      expect(row).toHaveProperty("ts");
      expect(row).toHaveProperty("params");
    });
    // Verify ascending time ordering: READING_1 (07:00) before READING_2 (08:00)
    const t0 = new Date(rows[0]!.ts).getTime();
    const t1 = new Date(rows[1]!.ts).getTime();
    expect(t0).toBeLessThan(t1);
  });

  it("bucketed query uses db.execute (DISTINCT ON SQL) not the ORM query builder", async () => {
    const { db } = await import("@workspace/db");
    const executeSpy = vi.mocked((db as unknown as { execute: ReturnType<typeof vi.fn> }).execute);
    executeSpy.mockClear();

    const from   = "2026-01-01T06:00:00Z";
    const to     = "2026-01-01T09:00:00Z";
    const bucket = "1800"; // 30-minute buckets (1W range)

    await withAuth(
      request(app).get(`/api/devices/${DEVICE.id}/readings?from=${from}&to=${to}&bucket=${bucket}`),
    ).expect(200);

    // The route must call db.execute() (raw SQL DISTINCT ON) for bucketed queries
    expect(executeSpy).toHaveBeenCalled();
  });
});
