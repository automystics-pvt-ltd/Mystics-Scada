/**
 * SSE stream endpoint — HTTP integration tests (Task #64)
 *
 * Fires real HTTP requests through the full Express middleware stack and
 * validates the streaming semantics of:
 *
 *   GET /api/stream/telemetry          — fleet-wide (org-scoped)
 *   GET /api/stream/telemetry/:plantId — plant-specific
 *
 * Covers:
 *  1. Unauthenticated → 401 (both endpoints).
 *  2. Authenticated fleet stream → 200 with Content-Type: text/event-stream;
 *     the first SSE frame is a "telemetry" event whose `plants` array contains
 *     only plants that belong to the authenticated org (org-1).
 *  3. Authenticated plant stream for an owned plant → 200 text/event-stream;
 *     the first frame is a "plant_telemetry" event with the correct plantId.
 *  4. Plant stream for a plant in a different org → 404 (cross-org isolation).
 *  5. Plant stream for an unknown plantId → 404.
 *  6. Notification registry isolation — pushNotificationToOrg for org-2 does
 *     not deliver to an org-1 SSE client registered via
 *     registerOrgNotificationClient.
 *
 * @workspace/db is mocked; SESSION_SECRET is injected via vitest.config.ts.
 */

import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import http from "node:http";
import request, { type Test as SupertestTest } from "supertest";

// ── Mock @workspace/db before any route imports ───────────────────────────────

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
    alertHistoryTable:   {},
    faultOverridesTable: {},
    organizationsTable:  {},
    notificationsTable:  {},
  };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import app from "../app";
import { PLANTS, PLANT_ORG_MAP } from "../lib/simulation";
import {
  registerOrgNotificationClient,
  pushNotificationToOrg,
} from "../lib/notificationRegistry";

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

// ── SSE helper ────────────────────────────────────────────────────────────────

/**
 * Opens an SSE connection through the Express app, waits for the first
 * complete SSE frame (event + data), then destroys the socket.
 *
 * Returns { status, contentType, eventName, eventData }.
 */
function collectFirstSseEvent(
  server: http.Server,
  path: string,
  cookie?: string,
): Promise<{
  status: number;
  contentType: string;
  eventName: string | null;
  eventData: unknown;
}> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      method: "GET",
      path,
      headers: cookie ? { Cookie: cookie } : {},
    };

    const req = server.address()
      ? (() => {
          const addr = server.address() as { port: number };
          return http.request({ ...options, port: addr.port, hostname: "127.0.0.1" });
        })()
      : (() => {
          reject(new Error("Server not listening"));
          return null as unknown as http.ClientRequest;
        })();

    req.on("error", reject);

    req.on("response", (res) => {
      const status = res.statusCode ?? 0;
      const contentType = res.headers["content-type"] ?? "";

      // Non-streaming responses: collect body as JSON and resolve
      if (!contentType.includes("text/event-stream")) {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => { body += c; });
        res.on("end", () => {
          resolve({ status, contentType, eventName: null, eventData: body ? JSON.parse(body) : null });
        });
        return;
      }

      // Streaming: parse the first complete event block, then tear down
      let buf = "";
      let lastEventName: string | null = null;
      res.setEncoding("utf8");

      res.on("data", (chunk: string) => {
        buf += chunk;

        // An SSE frame ends with a blank line (\n\n or \r\n\r\n)
        const frameEnd = buf.indexOf("\n\n");
        if (frameEnd === -1) return;

        const frame = buf.slice(0, frameEnd);
        let eventName: string | null = lastEventName;
        let dataLine: string | null = null;

        for (const line of frame.split("\n")) {
          if (line.startsWith("event: ")) {
            eventName = line.slice("event: ".length).trim();
          } else if (line.startsWith("data: ")) {
            dataLine = line.slice("data: ".length).trim();
          }
          // Skip keepalive comments (": keepalive")
        }

        if (dataLine !== null) {
          req.destroy(); // close the connection — we have what we need
          try {
            resolve({
              status,
              contentType,
              eventName,
              eventData: JSON.parse(dataLine),
            });
          } catch {
            resolve({ status, contentType, eventName, eventData: dataLine });
          }
        } else {
          // Frame was a keepalive comment; keep reading
          buf = buf.slice(frameEnd + 2);
        }
      });

      res.on("error", (e) => { if ((e as NodeJS.ErrnoException).code !== "ECONNRESET") reject(e); });
    });

    req.end();
  });
}

// Start a real HTTP server so we can use node:http for SSE streaming
let server: http.Server;

// Use vitest's beforeAll / afterAll via Vitest globals (imported via describe/it)
import { beforeAll, afterAll } from "vitest";

beforeAll(() => {
  server = http.createServer(app);
  return new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

afterAll(() => {
  return new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

/** Cookie header string for org-1 authenticated requests. */
const authCookieHeader = `${SESSION_COOKIE}=${encodeURIComponent(validCookie)}`;

// ── Plants that belong to org-1 ───────────────────────────────────────────────

const org1Plants = PLANTS.filter((p) => PLANT_ORG_MAP[p.id] === "org-1");

// ── 1. Unauthenticated requests → 401 ────────────────────────────────────────

describe("GET /api/stream/telemetry — unauthenticated", () => {
  it("fleet stream without cookie → 401", async () => {
    const res = await request(app)
      .get("/api/stream/telemetry")
      .expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("plant stream without cookie → 401", async () => {
    const plant = org1Plants[0]!;
    const res = await request(app)
      .get(`/api/stream/telemetry/${plant.id}`)
      .expect(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });
});

// ── 2. Fleet stream — authenticated, Content-Type, org scoping ───────────────

describe("GET /api/stream/telemetry — authenticated fleet stream", () => {
  it("returns 200 with Content-Type: text/event-stream", async () => {
    const { status, contentType } = await collectFirstSseEvent(
      server,
      "/api/stream/telemetry",
      authCookieHeader,
    );
    expect(status).toBe(200);
    expect(contentType).toMatch(/text\/event-stream/);
  });

  it("first frame is a 'telemetry' event", async () => {
    const { eventName } = await collectFirstSseEvent(
      server,
      "/api/stream/telemetry",
      authCookieHeader,
    );
    expect(eventName).toBe("telemetry");
  });

  it("telemetry event data contains a plants array and fleet summary", async () => {
    const { eventData } = await collectFirstSseEvent(
      server,
      "/api/stream/telemetry",
      authCookieHeader,
    );
    const data = eventData as Record<string, unknown>;
    expect(typeof data["timestamp"]).toBe("string");
    expect(data["fleet"]).toBeDefined();
    expect(Array.isArray(data["plants"])).toBe(true);
  });

  it("plants array contains only org-1 plants — no cross-org leakage", async () => {
    const { eventData } = await collectFirstSseEvent(
      server,
      "/api/stream/telemetry",
      authCookieHeader,
    );
    const data = eventData as { plants: { id: string }[] };
    const streamedIds = data.plants.map((p) => p.id);

    // Every plant in the stream must belong to org-1
    for (const id of streamedIds) {
      expect(PLANT_ORG_MAP[id]).toBe("org-1");
    }

    // Every org-1 plant must appear in the stream
    for (const plant of org1Plants) {
      expect(streamedIds).toContain(plant.id);
    }
  });

  it("each plant entry has the expected live-telemetry fields", async () => {
    const { eventData } = await collectFirstSseEvent(
      server,
      "/api/stream/telemetry",
      authCookieHeader,
    );
    const data = eventData as { plants: Record<string, unknown>[] };
    expect(data.plants.length).toBeGreaterThan(0);

    for (const p of data.plants) {
      expect(typeof p["id"]).toBe("string");
      expect(typeof p["powerKw"]).toBe("number");
      expect(typeof p["energyKwh"]).toBe("number");
      expect(typeof p["pr"]).toBe("number");
      expect(typeof p["availabilityPct"]).toBe("number");
      expect(typeof p["health"]).toBe("string");
      expect(typeof p["irradianceWm2"]).toBe("number");
      expect(typeof p["offlineInverters"]).toBe("number");
    }
  });
});

// ── 3. Plant-specific stream — authenticated ──────────────────────────────────

describe("GET /api/stream/telemetry/:plantId — authenticated plant stream", () => {
  const plant = org1Plants[0]!;

  it("returns 200 with Content-Type: text/event-stream for owned plant", async () => {
    const { status, contentType } = await collectFirstSseEvent(
      server,
      `/api/stream/telemetry/${plant.id}`,
      authCookieHeader,
    );
    expect(status).toBe(200);
    expect(contentType).toMatch(/text\/event-stream/);
  });

  it("first frame is a 'plant_telemetry' event", async () => {
    const { eventName } = await collectFirstSseEvent(
      server,
      `/api/stream/telemetry/${plant.id}`,
      authCookieHeader,
    );
    expect(eventName).toBe("plant_telemetry");
  });

  it("plant_telemetry event data has correct plantId and inverter array", async () => {
    const { eventData } = await collectFirstSseEvent(
      server,
      `/api/stream/telemetry/${plant.id}`,
      authCookieHeader,
    );
    const data = eventData as Record<string, unknown>;
    expect(data["plantId"]).toBe(plant.id);
    expect(typeof data["timestamp"]).toBe("string");
    expect(typeof data["powerKw"]).toBe("number");
    expect(typeof data["energyKwh"]).toBe("number");
    expect(Array.isArray(data["inverters"])).toBe(true);
    expect((data["inverters"] as unknown[]).length).toBe(plant.inverterCount);
  });

  it("each inverter entry has the expected fields", async () => {
    const { eventData } = await collectFirstSseEvent(
      server,
      `/api/stream/telemetry/${plant.id}`,
      authCookieHeader,
    );
    const data = eventData as { inverters: Record<string, unknown>[] };
    for (const inv of data.inverters) {
      expect(typeof inv["index"]).toBe("number");
      expect(typeof inv["status"]).toBe("string");
      expect(["running", "standby", "fault", "comm_lost"]).toContain(inv["status"]);
      expect(typeof inv["acPowerKw"]).toBe("number");
      expect(typeof inv["dcPowerKw"]).toBe("number");
      expect(typeof inv["acVoltageV"]).toBe("number");
      expect(typeof inv["acCurrentA"]).toBe("number");
      expect(typeof inv["efficiencyPct"]).toBe("number");
      expect(typeof inv["temperatureC"]).toBe("number");
    }
  });
});

// ── 4. Cross-org plant stream → 404 ──────────────────────────────────────────

describe("GET /api/stream/telemetry/:plantId — cross-org isolation", () => {
  it("plant owned by a different org → 404 (not 200, not 403)", async () => {
    // Find a plant not in org-1; if none exist in the demo fleet, fabricate an ID
    const otherOrgPlant = PLANTS.find((p) => PLANT_ORG_MAP[p.id] !== "org-1");
    const plantId = otherOrgPlant ? otherOrgPlant.id : "plant-other-org";

    const { status, eventData } = await collectFirstSseEvent(
      server,
      `/api/stream/telemetry/${plantId}`,
      authCookieHeader,
    );
    expect(status).toBe(404);
    expect((eventData as Record<string, unknown>)["error"]).toBe("not_found");
  });

  it("completely unknown plantId → 404", async () => {
    const { status, eventData } = await collectFirstSseEvent(
      server,
      "/api/stream/telemetry/plant-does-not-exist",
      authCookieHeader,
    );
    expect(status).toBe(404);
    expect((eventData as Record<string, unknown>)["error"]).toBe("not_found");
  });

  it("cross-org plant stream unauthenticated → 401 (not 404)", async () => {
    // Auth check must fire before the org lookup
    const { status } = await collectFirstSseEvent(
      server,
      "/api/stream/telemetry/plant-other-org",
    );
    expect(status).toBe(401);
  });
});

// ── 5. Notification registry isolation ───────────────────────────────────────
//
// This is a direct unit test of the pub-sub layer that backs the SSE
// "notification" sub-event.  It does not require an HTTP server.

describe("Notification registry — org isolation", () => {
  it("pushNotificationToOrg for org-2 does not deliver to an org-1 client", () => {
    const received: unknown[] = [];
    const unregister = registerOrgNotificationClient("org-1", (data) => {
      received.push(data);
    });

    pushNotificationToOrg("org-2", { type: "alarm.new", title: "Cross-org test" });

    unregister();

    expect(received).toHaveLength(0);
  });

  it("pushNotificationToOrg for org-1 DOES deliver to an org-1 client", () => {
    const received: unknown[] = [];
    const unregister = registerOrgNotificationClient("org-1", (data) => {
      received.push(data);
    });

    pushNotificationToOrg("org-1", { type: "alarm.new", title: "Same-org test" });

    unregister();

    expect(received).toHaveLength(1);
    expect((received[0] as Record<string, unknown>)["type"]).toBe("alarm.new");
  });

  it("unregistered client no longer receives pushes", () => {
    const received: unknown[] = [];
    const unregister = registerOrgNotificationClient("org-1", (data) => {
      received.push(data);
    });
    unregister();

    pushNotificationToOrg("org-1", { type: "alarm.new", title: "After unregister" });

    expect(received).toHaveLength(0);
  });

  it("multiple org-1 clients each receive the push", () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    const u1 = registerOrgNotificationClient("org-1", (d) => a.push(d));
    const u2 = registerOrgNotificationClient("org-1", (d) => b.push(d));

    pushNotificationToOrg("org-1", { type: "alarm.acknowledged" });

    u1();
    u2();

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});
