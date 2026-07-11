/**
 * Devices route — gateway/protocol compatibility guard (HTTP integration tests)
 *
 * The Edge Gateway Agent (lib/edge-agent) only implements pollers for
 * Modbus TCP, MQTT, and HTTP. A device using any other protocol
 * (opcua/bacnet/modbus_rtu/websocket) must never be assignable to a gateway:
 * doing so would silently stop cloud polling (the driver registry skips any
 * device with `gatewayId` set) while the edge agent has no poller to pick it
 * up either — a permanent telemetry-loss trap.
 *
 * These tests exercise the real Express route (POST /devices, PATCH
 * /devices/:id) through supertest so the guard is verified end-to-end, not
 * just as a unit of the validation function.
 *
 * @workspace/db is mocked; SESSION_SECRET is injected via vitest.config.ts.
 */

import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import request, { type Test as SupertestTest } from "supertest";

// ── Mock @workspace/db ──────────────────────────────────────────────────────
// Table objects are given distinct identities so the mock can branch on which
// table a `.from(...)` call targets, mirroring the real drizzle query shapes
// used in authenticate.ts / routes/devices.ts.
//
// vi.mock() factories are hoisted above the file's top-level statements, so
// every value the factory (or the tests) needs must be declared via
// vi.hoisted() rather than a plain top-level const.

const {
  usersTableMock,
  devicesTableMock,
  gatewayTokensTableMock,
  deviceTemplatesTableMock,
  GATEWAY_ID,
  EXISTING_BACNET_DEVICE,
} = vi.hoisted(() => {
  const usersTableMock = { id: "id", orgId: "orgId" };
  const devicesTableMock = { name: "devices", orgId: "orgId", plantId: "plantId" };
  const gatewayTokensTableMock = { id: "id", orgId: "orgId" };
  const deviceTemplatesTableMock = { id: "id" };

  const GATEWAY_ID = "gw-1";

  const EXISTING_BACNET_DEVICE = {
    id: "dev-bacnet-1",
    orgId: "org-1",
    plantId: "plant-thar",
    name: "BACnet Controller",
    type: "PLC",
    protocol: "bacnet",
    templateId: null,
    gatewayId: null,
    status: "online",
    config: { pollingIntervalSec: 30 },
    healthScore: 90,
    consecutiveFailures: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    usersTableMock,
    devicesTableMock,
    gatewayTokensTableMock,
    deviceTemplatesTableMock,
    GATEWAY_ID,
    EXISTING_BACNET_DEVICE,
  };
});

vi.mock("@workspace/db", () => {
  // Super-admin bypasses requirePermission entirely, so no rolesTable mock is needed.
  const fakeUser = {
    id: "u-test",
    orgId: "org-1",
    roleId: "role-admin",
    name: "Test Admin",
    email: "test@example.com",
    isSuperAdmin: true,
  };
  const fakeGateway = { id: GATEWAY_ID, orgId: "org-1", revokedAt: null };

  // Rows to return, keyed by which mocked table object the query targets.
  const rowsByTable = new Map<unknown, unknown[]>([
    [usersTableMock, [fakeUser]],
    [gatewayTokensTableMock, [fakeGateway]],
    [devicesTableMock, [EXISTING_BACNET_DEVICE]],
    [deviceTemplatesTableMock, []],
  ]);

  function makeChain(rows: unknown[]): any {
    return Object.assign(Promise.resolve(rows), {
      from: (t: unknown) => makeChain(rowsByTable.get(t) ?? []),
      where: () => makeChain(rows),
      values: () => makeChain(rows),
      set: () => makeChain(rows),
      returning: () => Promise.resolve(rows),
      orderBy: () => Promise.resolve(rows),
      limit: (n: number) => Promise.resolve(rows.slice(0, n)),
    });
  }

  return {
    db: {
      select: () => makeChain([]),
      insert: () => makeChain([{ ...EXISTING_BACNET_DEVICE, id: "dev-new" }]),
      update: () => makeChain([{ ...EXISTING_BACNET_DEVICE, gatewayId: GATEWAY_ID }]),
    },
    usersTable: usersTableMock,
    devicesTable: devicesTableMock,
    deviceReadingsTable: {},
    deviceCommLogsTable: {},
    deviceTemplatesTable: deviceTemplatesTableMock,
    firmwareVersionHistoryTable: {},
    gatewayTokensTable: gatewayTokensTableMock,
    rolesTable: { id: "id", permissions: "permissions" },
    eq: vi.fn((...args: unknown[]) => ({ __eq: args })),
    and: vi.fn((...args: unknown[]) => ({ __and: args })),
    desc: vi.fn(),
    sql: Object.assign(vi.fn(), { raw: vi.fn() }),
  };
});

import app from "../app";

// ── Auth cookie helper (mirrors other HTTP integration tests in this suite) ──

function signedCookieValue(value: string, secret: string): string {
  const sig = crypto.createHmac("sha256", secret).update(value).digest("base64").replace(/=+$/, "");
  return `s:${value}.${sig}`;
}

const SESSION_COOKIE = "scada_session";
const TEST_SECRET = process.env["SESSION_SECRET"]!;
const validSession = JSON.stringify({ userId: "u-test", orgId: "org-1", roleId: "role-admin" });
const validCookieValue = signedCookieValue(validSession, TEST_SECRET);

function withAuth(req: SupertestTest) {
  return req.set("Cookie", `${SESSION_COOKIE}=${encodeURIComponent(validCookieValue)}`);
}

describe("Gateway assignment is rejected for protocols the Edge Gateway Agent can't poll", () => {
  it("POST /api/devices rejects an opcua device assigned to a gateway", async () => {
    const res = await withAuth(
      request(app).post(`/api/devices?orgId=org-1`).send({
        name: "New OPC-UA Meter",
        type: "smart_meter",
        protocol: "opcua",
        plantId: "plant-thar",
        gatewayId: GATEWAY_ID,
        url: "opc.tcp://10.0.1.99:4840",
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unsupported_gateway_protocol");
  });

  it("PATCH /api/devices/:id rejects assigning a gateway to an existing bacnet device", async () => {
    const res = await withAuth(
      request(app).patch(`/api/devices/${EXISTING_BACNET_DEVICE.id}?orgId=org-1`).send({
        gatewayId: GATEWAY_ID,
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unsupported_gateway_protocol");
  });
});
