/**
 * Fault injection consistency tests (Task #65)
 *
 * Verifies that injecting a fault is immediately reflected on ALL three
 * read surfaces, and that clearing a fault restores all surfaces to normal:
 *
 *   1. Fleet SSE stream  — GET /api/stream/telemetry
 *   2. Plant SSE stream  — GET /api/stream/telemetry/:plantId
 *   3. SLD REST endpoint — GET /api/plants/:plantId/sld
 *
 * The in-memory fault store in faultInjection.ts is the source of truth
 * consumed by all three surfaces; these tests confirm no surface reads a
 * stale or independent snapshot.
 *
 * @workspace/db is mocked; SESSION_SECRET is injected via vitest.config.ts.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import crypto from "node:crypto";
import http from "node:http";
import request from "supertest";

// ── Mock @workspace/db before any route imports ───────────────────────────────
//
// The fakeUser has isSuperAdmin:true so that:
//   • authenticate() sets req.user.isSuperAdmin = true
//   • requirePermission() calls next() unconditionally (super-admin bypass)
//   • resolveOrgId() returns req.user.orgId = "org-1" (no ?orgId override)
//
vi.mock("@workspace/db", () => {
  // A regular (non-super-admin) user in org-1 with the plant.manage permission.
  //
  // Using isSuperAdmin:false avoids the requireOrgScopeForWrites middleware
  // which blocks super-admin mutations when no specific org is impersonated.
  // Adding `permissions` to the fakeUser means the requirePermission middleware
  // (which selects from rolesTable and returns this same row) sees plant.manage.
  const fakeUser = {
    id: "u-manager",
    orgId: "org-1",
    roleId: "role-manager",
    name: "Test Manager",
    email: "manager@example.com",
    isSuperAdmin: false,
    // Returned when requirePermission queries rolesTable for this roleId
    permissions: ["plant.manage", "plant.view", "dashboard.view", "device.view", "alarm.view"],
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
    alertHistoryTable:   {},
    faultOverridesTable: {},
    organizationsTable:  {},
    notificationsTable:  {},
    auditLogsTable:      {},
  };
});

// ── Imports (after mock is registered) ───────────────────────────────────────

import app from "../app";
import { PLANTS, PLANT_ORG_MAP } from "../lib/simulation";
import { clearAllFaults } from "../lib/faultInjection";

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

// Session payload — isSuperAdmin is derived from the DB row, not the cookie.
// Using a regular (non-super-admin) org-1 user avoids the requireOrgScopeForWrites
// middleware that blocks super-admin mutations without an impersonated org.
const managerSession = JSON.stringify({ userId: "u-manager", orgId: "org-1", roleId: "role-manager" });
const managerCookie  = signedCookieValue(managerSession, TEST_SECRET);
const adminCookieHeader = `${SESSION_COOKIE}=${encodeURIComponent(managerCookie)}`;

// ── Test plant selection ──────────────────────────────────────────────────────

const org1Plants   = PLANTS.filter((p) => PLANT_ORG_MAP[p.id] === "org-1");
const testPlant    = org1Plants[0]!;
// First inverter in the plant — format: "<plantId>-inv-0"
const testInverterId = `${testPlant.id}-inv-0`;

// ── SSE helper ────────────────────────────────────────────────────────────────
//
// Opens an SSE connection, waits for the first complete data frame, then
// destroys the socket.  Returns { status, contentType, eventName, eventData }.
//
function collectFirstSseEvent(
  server: http.Server,
  path: string,
  cookie: string,
): Promise<{
  status: number;
  contentType: string;
  eventName: string | null;
  eventData: unknown;
}> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };

    const req = http.request({
      method:   "GET",
      path,
      port:     addr.port,
      hostname: "127.0.0.1",
      headers:  { Cookie: cookie },
    });

    req.on("error", reject);

    req.on("response", (res) => {
      const status      = res.statusCode ?? 0;
      const contentType = res.headers["content-type"] ?? "";

      // Non-streaming response (e.g. 401 / 404) — collect body as JSON
      if (!contentType.includes("text/event-stream")) {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => { body += c; });
        res.on("end", () => {
          resolve({
            status,
            contentType,
            eventName: null,
            eventData: body ? JSON.parse(body) : null,
          });
        });
        return;
      }

      // Streaming: parse the first complete SSE frame (event + data)
      let buf = "";
      res.setEncoding("utf8");

      res.on("data", (chunk: string) => {
        buf += chunk;
        const frameEnd = buf.indexOf("\n\n");
        if (frameEnd === -1) return; // frame not yet complete

        const frame = buf.slice(0, frameEnd);
        let eventName: string | null = null;
        let dataLine:  string | null = null;

        for (const line of frame.split("\n")) {
          if (line.startsWith("event: ")) {
            eventName = line.slice("event: ".length).trim();
          } else if (line.startsWith("data: ")) {
            dataLine = line.slice("data: ".length).trim();
          }
          // keepalive comments (": keepalive") are skipped
        }

        if (dataLine !== null) {
          req.destroy(); // we have what we need
          try {
            resolve({ status, contentType, eventName, eventData: JSON.parse(dataLine) });
          } catch {
            resolve({ status, contentType, eventName, eventData: dataLine });
          }
        } else {
          // Frame was a keepalive comment; keep reading
          buf = buf.slice(frameEnd + 2);
        }
      });

      res.on("error", (e) => {
        if ((e as NodeJS.ErrnoException).code !== "ECONNRESET") reject(e);
      });
    });

    req.end();
  });
}

// ── HTTP server lifecycle ─────────────────────────────────────────────────────

let server: http.Server;

beforeAll(() => {
  server = http.createServer(app);
  return new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

afterAll(() => {
  return new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

// Clear injected faults for the test plant after every test so state does not
// leak between cases.  clearAllFaults() writes to the in-memory store first
// and the DB mock accepts the delete — no real DB required.
afterEach(async () => {
  await clearAllFaults(testPlant.id);
});

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function injectPlantFault(durationSeconds = 60) {
  const res = await request(app)
    .post(`/api/plants/${testPlant.id}/fault-inject`)
    .set("Cookie", adminCookieHeader)
    .send({ target: "plant", durationSeconds });
  expect(res.status).toBe(201);
  return res.body as { key: string; label: string; expiresAt: string; remainingMs: number };
}

async function injectInverterFault(durationSeconds = 60) {
  const res = await request(app)
    .post(`/api/plants/${testPlant.id}/fault-inject`)
    .set("Cookie", adminCookieHeader)
    .send({ target: "inverter", inverterId: testInverterId, durationSeconds });
  expect(res.status).toBe(201);
  return res.body as { key: string; label: string; expiresAt: string; remainingMs: number };
}

async function clearAllFaultsViaHttp() {
  await request(app)
    .delete(`/api/plants/${testPlant.id}/fault-inject`)
    .set("Cookie", adminCookieHeader)
    .expect(204);
}

// ── 1. Plant fault — injection consistency ────────────────────────────────────

describe("Plant fault injection — all three surfaces agree", () => {
  it("fleet stream: powerKw=0, all inverters offline, health=offline", async () => {
    await injectPlantFault();

    const { eventData } = await collectFirstSseEvent(server, "/api/stream/telemetry", adminCookieHeader);
    const data = eventData as {
      plants: { id: string; powerKw: number; offlineInverters: number; health: string }[];
    };
    const plantEntry = data.plants.find((p) => p.id === testPlant.id);

    expect(plantEntry).toBeDefined();
    expect(plantEntry!.powerKw).toBe(0);
    expect(plantEntry!.offlineInverters).toBe(testPlant.inverterCount);
    expect(plantEntry!.health).toBe("offline");
  });

  it("plant stream: all inverters comm_lost, powerKw=0, health=offline", async () => {
    await injectPlantFault();

    const { eventData } = await collectFirstSseEvent(
      server,
      `/api/stream/telemetry/${testPlant.id}`,
      adminCookieHeader,
    );
    const data = eventData as {
      powerKw: number;
      health: string;
      inverters: { index: number; status: string; acPowerKw: number }[];
    };

    expect(data.powerKw).toBe(0);
    expect(data.health).toBe("offline");
    for (const inv of data.inverters) {
      expect(inv.status).toBe("comm_lost");
      expect(inv.acPowerKw).toBe(0);
    }
  });

  it("SLD: all inverter nodes are offline with zero power", async () => {
    await injectPlantFault();

    const res = await request(app)
      .get(`/api/plants/${testPlant.id}/sld`)
      .set("Cookie", adminCookieHeader)
      .expect(200);

    const data = res.body as {
      nodes: { id: string; type: string; status: string; powerKw: number | null }[];
    };
    const inverterNodes = data.nodes.filter((n) => n.type === "inverter");
    expect(inverterNodes.length).toBeGreaterThan(0);

    // SLD node status is a HealthState ("normal"|"warning"|"fault"|"offline"),
    // not the stream InverterStatus ("running"|"standby"|"fault"|"comm_lost").
    // Forced-offline inverters have health="offline".
    for (const node of inverterNodes) {
      expect(node.status).toBe("offline");
      // Power must be zero while the plant is disconnected
      expect(node.powerKw === 0 || node.powerKw === null).toBe(true);
    }
  });

  it("fleet stream, plant stream, and SLD all agree on health=offline", async () => {
    await injectPlantFault();

    // Fetch all three surfaces in parallel — they must read the same in-memory state
    const [fleetResult, plantResult, sldRes] = await Promise.all([
      collectFirstSseEvent(server, "/api/stream/telemetry", adminCookieHeader),
      collectFirstSseEvent(server, `/api/stream/telemetry/${testPlant.id}`, adminCookieHeader),
      request(app).get(`/api/plants/${testPlant.id}/sld`).set("Cookie", adminCookieHeader),
    ]);

    // Fleet stream health
    const fleetData = fleetResult.eventData as { plants: { id: string; health: string }[] };
    const fleetPlant = fleetData.plants.find((p) => p.id === testPlant.id)!;
    expect(fleetPlant.health).toBe("offline");

    // Plant stream health
    const plantData = plantResult.eventData as { health: string };
    expect(plantData.health).toBe("offline");

    // SLD — all inverter nodes must be offline (HealthState, not InverterStatus)
    const sldNodes = (sldRes.body as { nodes: { type: string; status: string }[] }).nodes;
    const sldInverters = sldNodes.filter((n) => n.type === "inverter");
    for (const n of sldInverters) {
      expect(n.status).toBe("offline");
    }
  });
});

// ── 2. Plant fault — clearance consistency ────────────────────────────────────

describe("Plant fault clearance — all three surfaces return to normal", () => {
  it("fleet stream: offlineInverters drops below inverterCount after clearing", async () => {
    await injectPlantFault();

    // Confirm fault is visible first
    const { eventData: before } = await collectFirstSseEvent(server, "/api/stream/telemetry", adminCookieHeader);
    const beforePlant = (before as { plants: { id: string; offlineInverters: number }[] }).plants
      .find((p) => p.id === testPlant.id)!;
    expect(beforePlant.offlineInverters).toBe(testPlant.inverterCount);

    // Clear and re-read
    await clearAllFaultsViaHttp();

    const { eventData: after } = await collectFirstSseEvent(server, "/api/stream/telemetry", adminCookieHeader);
    const afterPlant = (after as { plants: { id: string; offlineInverters: number }[] }).plants
      .find((p) => p.id === testPlant.id)!;
    expect(afterPlant.offlineInverters).toBeLessThan(testPlant.inverterCount);
  });

  it("plant stream: inverters no longer all comm_lost after clearing", async () => {
    await injectPlantFault();
    await clearAllFaultsViaHttp();

    const { eventData } = await collectFirstSseEvent(
      server,
      `/api/stream/telemetry/${testPlant.id}`,
      adminCookieHeader,
    );
    const data = eventData as { inverters: { status: string }[] };

    // At least one inverter must have recovered from comm_lost
    const allCommLost = data.inverters.every((inv) => inv.status === "comm_lost");
    expect(allCommLost).toBe(false);
  });

  it("SLD: at least one inverter node is non-offline after clearing", async () => {
    await injectPlantFault();
    await clearAllFaultsViaHttp();

    const res = await request(app)
      .get(`/api/plants/${testPlant.id}/sld`)
      .set("Cookie", adminCookieHeader)
      .expect(200);

    // SLD node status is a HealthState: "normal"|"warning"|"fault"|"offline".
    // After clearing a plant fault, inverters recover to "normal" or "warning".
    const data = res.body as { nodes: { type: string; status: string }[] };
    const inverterNodes = data.nodes.filter((n) => n.type === "inverter");
    const hasRecovered = inverterNodes.some((n) => ["normal", "warning"].includes(n.status));
    expect(hasRecovered).toBe(true);
  });

  it("fault list endpoint returns empty after clearing", async () => {
    await injectPlantFault();
    await clearAllFaultsViaHttp();

    const res = await request(app)
      .get(`/api/plants/${testPlant.id}/fault-inject`)
      .set("Cookie", adminCookieHeader)
      .expect(200);

    expect(res.body.faults).toHaveLength(0);
  });
});

// ── 3. Inverter fault — injection consistency ─────────────────────────────────

describe("Inverter fault injection — all three surfaces agree", () => {
  it("fleet stream: offlineInverters is at least 1 after inverter fault", async () => {
    await injectInverterFault();

    const { eventData } = await collectFirstSseEvent(server, "/api/stream/telemetry", adminCookieHeader);
    const data = eventData as { plants: { id: string; offlineInverters: number }[] };
    const plantEntry = data.plants.find((p) => p.id === testPlant.id)!;
    expect(plantEntry.offlineInverters).toBeGreaterThanOrEqual(1);
  });

  it("plant stream: faulted inverter index 0 is comm_lost with acPowerKw=0", async () => {
    await injectInverterFault();

    const { eventData } = await collectFirstSseEvent(
      server,
      `/api/stream/telemetry/${testPlant.id}`,
      adminCookieHeader,
    );
    const data = eventData as { inverters: { index: number; status: string; acPowerKw: number }[] };
    const faultedInv = data.inverters.find((inv) => inv.index === 0)!;

    expect(faultedInv).toBeDefined();
    expect(faultedInv.status).toBe("comm_lost");
    expect(faultedInv.acPowerKw).toBe(0);
  });

  it("SLD: faulted inverter node is offline (HealthState)", async () => {
    await injectInverterFault();

    const res = await request(app)
      .get(`/api/plants/${testPlant.id}/sld`)
      .set("Cookie", adminCookieHeader)
      .expect(200);

    // SLD node status is a HealthState; forced-offline inverters emit "offline"
    const data = res.body as { nodes: { id: string; type: string; status: string }[] };
    const faultedNode = data.nodes.find((n) => n.type === "inverter" && n.id === testInverterId);

    expect(faultedNode).toBeDefined();
    expect(faultedNode!.status).toBe("offline");
  });

  it("fleet, plant stream, and SLD all agree: faulted inverter is offline", async () => {
    await injectInverterFault();

    const [fleetResult, plantResult, sldRes] = await Promise.all([
      collectFirstSseEvent(server, "/api/stream/telemetry", adminCookieHeader),
      collectFirstSseEvent(server, `/api/stream/telemetry/${testPlant.id}`, adminCookieHeader),
      request(app).get(`/api/plants/${testPlant.id}/sld`).set("Cookie", adminCookieHeader),
    ]);

    // Fleet: at least 1 offline
    const fleetPlant = (fleetResult.eventData as { plants: { id: string; offlineInverters: number }[] }).plants
      .find((p) => p.id === testPlant.id)!;
    expect(fleetPlant.offlineInverters).toBeGreaterThanOrEqual(1);

    // Plant stream: inverter 0 is comm_lost
    const plantInverters = (plantResult.eventData as { inverters: { index: number; status: string }[] }).inverters;
    const faultedInv = plantInverters.find((inv) => inv.index === 0)!;
    expect(faultedInv.status).toBe("comm_lost");

    // SLD: the specific inverter node is offline (HealthState)
    const sldNodes = (sldRes.body as { nodes: { id: string; type: string; status: string }[] }).nodes;
    const sldInverterNode = sldNodes.find((n) => n.type === "inverter" && n.id === testInverterId)!;
    expect(sldInverterNode.status).toBe("offline");
  });

  it("non-faulted inverters remain operational after single inverter fault", async () => {
    if (testPlant.inverterCount < 2) return; // single-inverter plants cannot have a "partial" fault

    await injectInverterFault();

    const { eventData } = await collectFirstSseEvent(
      server,
      `/api/stream/telemetry/${testPlant.id}`,
      adminCookieHeader,
    );
    const data = eventData as { inverters: { index: number; status: string }[] };
    const otherInverters = data.inverters.filter((inv) => inv.index !== 0);

    // At least one non-faulted inverter should not be comm_lost
    const hasNonFaulted = otherInverters.some((inv) => inv.status !== "comm_lost");
    expect(hasNonFaulted).toBe(true);
  });
});

// ── 4. Inverter fault — clearance consistency ─────────────────────────────────

describe("Inverter fault clearance — all three surfaces return to normal", () => {
  it("plant stream: faulted inverter recovers after DELETE /by/:suffix", async () => {
    await injectInverterFault();

    // Confirm fault is visible
    const { eventData: before } = await collectFirstSseEvent(
      server,
      `/api/stream/telemetry/${testPlant.id}`,
      adminCookieHeader,
    );
    const beforeInv = (before as { inverters: { index: number; status: string }[] }).inverters
      .find((inv) => inv.index === 0)!;
    expect(beforeInv.status).toBe("comm_lost");

    // Clear the specific inverter fault — suffix is the full inverterId
    await request(app)
      .delete(`/api/plants/${testPlant.id}/fault-inject/by/${testInverterId}`)
      .set("Cookie", adminCookieHeader)
      .expect(204);

    // Inverter 0 should no longer be forced comm_lost
    const { eventData: after } = await collectFirstSseEvent(
      server,
      `/api/stream/telemetry/${testPlant.id}`,
      adminCookieHeader,
    );
    const afterInv = (after as { inverters: { index: number; status: string }[] }).inverters
      .find((inv) => inv.index === 0)!;
    expect(afterInv.status).not.toBe("comm_lost");
  });

  it("SLD: inverter node recovers to normal/warning after clearing inverter fault", async () => {
    await injectInverterFault();
    await clearAllFaultsViaHttp();

    const res = await request(app)
      .get(`/api/plants/${testPlant.id}/sld`)
      .set("Cookie", adminCookieHeader)
      .expect(200);

    // After clearing, the node's HealthState should be "normal" or "warning"
    const data = res.body as { nodes: { id: string; type: string; status: string }[] };
    const recoveredNode = data.nodes.find((n) => n.type === "inverter" && n.id === testInverterId);

    expect(recoveredNode).toBeDefined();
    expect(["normal", "warning"]).toContain(recoveredNode!.status);
  });

  it("fleet stream: offlineInverters returns to baseline after clearing inverter fault", async () => {
    // Capture baseline (no faults)
    const { eventData: baseline } = await collectFirstSseEvent(server, "/api/stream/telemetry", adminCookieHeader);
    const baselineCount = (baseline as { plants: { id: string; offlineInverters: number }[] }).plants
      .find((p) => p.id === testPlant.id)!.offlineInverters;

    await injectInverterFault();

    const { eventData: faulted } = await collectFirstSseEvent(server, "/api/stream/telemetry", adminCookieHeader);
    const faultedCount = (faulted as { plants: { id: string; offlineInverters: number }[] }).plants
      .find((p) => p.id === testPlant.id)!.offlineInverters;
    // Fault must have increased the offline count
    expect(faultedCount).toBeGreaterThan(baselineCount);

    await clearAllFaultsViaHttp();

    const { eventData: cleared } = await collectFirstSseEvent(server, "/api/stream/telemetry", adminCookieHeader);
    const clearedCount = (cleared as { plants: { id: string; offlineInverters: number }[] }).plants
      .find((p) => p.id === testPlant.id)!.offlineInverters;
    // After clearing, must return to baseline
    expect(clearedCount).toBe(baselineCount);
  });
});

// ── 5. Fault list endpoint tracks injected state ──────────────────────────────

describe("GET /api/plants/:plantId/fault-inject — list reflects injected state", () => {
  it("returns empty list when no faults are active", async () => {
    const res = await request(app)
      .get(`/api/plants/${testPlant.id}/fault-inject`)
      .set("Cookie", adminCookieHeader)
      .expect(200);

    expect(res.body.plantId).toBe(testPlant.id);
    expect(res.body.faults).toHaveLength(0);
  });

  it("lists one active plant fault after injection", async () => {
    await injectPlantFault();

    const res = await request(app)
      .get(`/api/plants/${testPlant.id}/fault-inject`)
      .set("Cookie", adminCookieHeader)
      .expect(200);

    expect(res.body.faults).toHaveLength(1);
    expect(res.body.faults[0].target).toEqual({ kind: "plant" });
    expect(res.body.faults[0].remainingMs).toBeGreaterThan(0);
  });

  it("lists one active inverter fault after injection", async () => {
    await injectInverterFault();

    const res = await request(app)
      .get(`/api/plants/${testPlant.id}/fault-inject`)
      .set("Cookie", adminCookieHeader)
      .expect(200);

    expect(res.body.faults).toHaveLength(1);
    expect(res.body.faults[0].target).toEqual({ kind: "inverter", inverterId: testInverterId });
    expect(res.body.faults[0].remainingMs).toBeGreaterThan(0);
  });

  it("re-injecting the same target overwrites the previous fault (idempotent)", async () => {
    await injectPlantFault(30);
    await injectPlantFault(60); // second injection should overwrite

    const res = await request(app)
      .get(`/api/plants/${testPlant.id}/fault-inject`)
      .set("Cookie", adminCookieHeader)
      .expect(200);

    // Still exactly one fault, not two
    expect(res.body.faults).toHaveLength(1);
    // The new remainingMs should be close to 60 s
    expect(res.body.faults[0].remainingMs).toBeGreaterThan(50_000);
  });
});
