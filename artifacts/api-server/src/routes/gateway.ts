/**
 * Edge Gateway Agent endpoints.
 *
 * Two trust boundaries live in this router:
 *  - Admin-facing endpoints (register/list/revoke) run behind the normal
 *    session-cookie `authenticate` + `requirePermission` stack, mounted from
 *    routes/index.ts alongside every other authenticated route.
 *  - Agent-facing endpoints (devices/readings/heartbeat) authenticate with a
 *    bearer gateway token instead and are mounted BEFORE the cookie
 *    `authenticate` middleware (see routes/index.ts) since the agent process
 *    never has a browser session.
 */

import { randomUUID, randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  gatewayTokensTable,
  devicesTable,
  deviceReadingsTable,
  deviceTemplatesTable,
} from "@workspace/db";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateGatewayToken, hashGatewayToken } from "../middleware/validateGatewayToken.js";
import { auditLog } from "../lib/auditLog.js";
import { decryptCredential } from "../lib/credentialCrypto.js";
import { resolveDeviceOfflineAlert } from "../lib/offlineDetection.js";
import { computeDeviceHealthScore } from "../lib/deviceHealth.js";
import { logger } from "../lib/logger.js";

const MAX_READINGS_PER_DEVICE = 2_000;

// ── Admin-facing router (session-cookie auth) ──────────────────────────────

export const gatewayAdminRouter: IRouter = Router();

// GET /gateway/list — gateways for the current org, with device counts + connectivity
gatewayAdminRouter.get("/gateway/list", requirePermission("settings.view"), async (req, res) => {
  const orgId = req.user!.orgId;
  const rows = await db.select().from(gatewayTokensTable).where(eq(gatewayTokensTable.orgId, orgId));
  const deviceCounts = await db
    .select({ gatewayId: devicesTable.gatewayId, count: sql<number>`count(*)::int` })
    .from(devicesTable)
    .where(eq(devicesTable.orgId, orgId))
    .groupBy(devicesTable.gatewayId);
  const countByGateway = new Map(deviceCounts.map((c) => [c.gatewayId, c.count]));

  const HEARTBEAT_STALE_MS = 90_000; // agent sends a heartbeat every 30s

  res.json(
    rows.map((g) => {
      const lastSeenMs = g.lastSeenAt ? Date.now() - g.lastSeenAt.getTime() : null;
      const connectivity = g.revokedAt
        ? "revoked"
        : lastSeenMs === null
          ? "never_connected"
          : lastSeenMs <= HEARTBEAT_STALE_MS
            ? "online"
            : "offline";
      return {
        id: g.id,
        name: g.name,
        lastSeenAt: g.lastSeenAt ? g.lastSeenAt.toISOString() : null,
        deviceCount: countByGateway.get(g.id) ?? 0,
        connectivity,
        createdAt: g.createdAt.toISOString(),
        revokedAt: g.revokedAt ? g.revokedAt.toISOString() : null,
      };
    }),
  );
});

const RegisterGatewayBody = z.object({
  name: z.string().min(1).max(120),
});

// POST /gateway/register — admin generates a new gateway + reveals its token once
gatewayAdminRouter.post("/gateway/register", requirePermission("settings.manage"), async (req, res) => {
  const orgId = req.user!.orgId;
  const body = RegisterGatewayBody.parse(req.body);

  const plaintext = randomBytes(32).toString("hex");
  const id = randomUUID();
  await db.insert(gatewayTokensTable).values({
    id,
    orgId,
    name: body.name,
    tokenHash: hashGatewayToken(plaintext),
    createdAt: new Date(),
  });

  auditLog(req, "gateway.register", "gateway_token", id, { name: body.name });
  res.status(201).json({ id, name: body.name, token: plaintext });
});

// POST /gateway/:id/revoke — admin revokes a gateway's token
gatewayAdminRouter.post("/gateway/:id/revoke", requirePermission("settings.manage"), async (req, res) => {
  const orgId = req.user!.orgId;
  const id = req.params["id"] as string;
  const [row] = await db.select().from(gatewayTokensTable).where(eq(gatewayTokensTable.id, id));
  if (!row || row.orgId !== orgId) {
    res.status(404).json({ error: "not_found", message: "Gateway not found" });
    return;
  }
  if (row.revokedAt) {
    res.status(200).json({ ok: true });
    return;
  }
  await db.update(gatewayTokensTable).set({ revokedAt: new Date() }).where(eq(gatewayTokensTable.id, id));
  auditLog(req, "gateway.revoke", "gateway_token", id, { name: row.name });
  res.json({ ok: true });
});

// ── Agent-facing router (bearer gateway token auth) ────────────────────────

export const gatewayAgentRouter: IRouter = Router();

// NOTE: validateGatewayToken is applied per-route (not via router.use) because
// this router is mounted with no path prefix alongside the admin router; a
// blanket `.use` would 401 every request that reaches this router instance,
// including ones meant for /gateway/register, /gateway/list, /gateway/:id/revoke.

// GET /gateway/devices?gatewayId=... — devices assigned to this gateway
gatewayAgentRouter.get("/gateway/devices", validateGatewayToken, async (req, res) => {
  const gatewayId = req.gateway!.id;
  const rows = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.gatewayId, gatewayId), eq(devicesTable.orgId, req.gateway!.orgId)));

  const templateIds = Array.from(new Set(rows.map((r) => r.templateId).filter((t): t is string => !!t)));
  const templates = templateIds.length > 0
    ? await db.select().from(deviceTemplatesTable).where(sql`${deviceTemplatesTable.id} = ANY(${templateIds})`)
    : [];
  const templateById = new Map(templates.map((t) => [t.id, t]));

  res.json(
    rows.map((d) => {
      const cfg = (d.config ?? {}) as Record<string, unknown>;
      const tmpl = d.templateId ? templateById.get(d.templateId) : undefined;
      return {
        id: d.id,
        orgId: d.orgId,
        plantId: d.plantId,
        name: d.name,
        type: d.type,
        protocol: d.protocol,
        // Decrypt at point-of-issuance — the agent needs live credentials to
        // connect over the plant LAN; this is the one place they leave the DB.
        config: {
          ...cfg,
          httpAuthValue: typeof cfg["httpAuthValue"] === "string" ? decryptCredential(cfg["httpAuthValue"] as string) : undefined,
          opcuaPassword: typeof cfg["opcuaPassword"] === "string" ? decryptCredential(cfg["opcuaPassword"] as string) : undefined,
        },
        fieldMap: tmpl?.fieldMap ?? [],
        pollingIntervalSec: (cfg["pollingIntervalSec"] as number | undefined) ?? 30,
      };
    }),
  );
});

const ReadingBody = z.object({
  deviceId: z.string().min(1),
  ts: z.string(),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
});
const ReadingsBody = z.array(ReadingBody).max(200);

// POST /gateway/readings — bulk ingest from the agent's offline buffer / live poll
gatewayAgentRouter.post("/gateway/readings", validateGatewayToken, async (req, res) => {
  const gatewayId = req.gateway!.id;
  const orgId = req.gateway!.orgId;
  const parsed = ReadingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }
  const readings = parsed.data;
  if (readings.length === 0) {
    res.json({ accepted: 0, rejected: 0 });
    return;
  }

  // Only accept readings for devices actually assigned to this gateway —
  // prevents a compromised/misconfigured agent from writing into other devices.
  const deviceIds = Array.from(new Set(readings.map((r) => r.deviceId)));
  const assigned = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(and(eq(devicesTable.gatewayId, gatewayId), eq(devicesTable.orgId, orgId)));
  const assignedIds = new Set(assigned.map((d) => d.id));

  let accepted = 0;
  let rejected = 0;
  const touchedDevices = new Set<string>();

  for (const r of readings) {
    if (!assignedIds.has(r.deviceId)) { rejected++; continue; }
    const ts = new Date(r.ts);
    if (isNaN(ts.getTime())) { rejected++; continue; }
    try {
      await db.insert(deviceReadingsTable).values({
        id: randomUUID(),
        deviceId: r.deviceId,
        orgId,
        ts,
        params: r.params,
      });
      accepted++;
      touchedDevices.add(r.deviceId);
    } catch (err) {
      logger.error({ err, deviceId: r.deviceId }, "Failed to persist gateway reading");
      rejected++;
    }
  }

  const now = new Date();
  for (const deviceId of touchedDevices) {
    await db
      .update(devicesTable)
      .set({ lastSeenAt: now, status: "online", consecutiveFailures: 0, updatedAt: now })
      .where(eq(devicesTable.id, deviceId));

    // Same bounded-retention policy as live driver ingestion / CSV import
    await db.execute(sql`
      DELETE FROM device_readings
      WHERE device_id = ${deviceId}
        AND id NOT IN (
          SELECT id FROM device_readings
          WHERE device_id = ${deviceId}
          ORDER BY ts DESC
          LIMIT ${MAX_READINGS_PER_DEVICE}
        )
    `);

    void resolveDeviceOfflineAlert(deviceId, orgId, deviceId);
    void computeDeviceHealthScore(deviceId, now);
  }

  res.json({ accepted, rejected });
});

// POST /gateway/heartbeat — liveness ping, every 30s from the agent
gatewayAgentRouter.post("/gateway/heartbeat", validateGatewayToken, async (req, res) => {
  await db
    .update(gatewayTokensTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(gatewayTokensTable.id, req.gateway!.id));
  res.json({ ok: true });
});
