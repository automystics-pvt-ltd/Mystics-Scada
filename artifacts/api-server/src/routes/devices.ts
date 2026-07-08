import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import { db, devicesTable } from "@workspace/db";
import { resolveOrgId, orgCondition } from "../lib/orgScope";
import { requirePermission } from "../middleware/requirePermission";
import { getOrgPlants } from "../lib/domain";
import {
  deviceStatus,
  deviceLogs,
  deviceConnectivityTimeline,
} from "../lib/simulation";

const router: IRouter = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const DEVICE_TYPES = [
  "RTU", "PLC", "data_logger", "smart_meter", "inverter",
  "weather_station", "tracker_controller", "sensor", "gateway",
] as const;

const PROTOCOLS = ["modbus", "mqtt", "http", "opcua"] as const;

const RegisterDeviceBody = z.object({
  name:              z.string().min(1).max(120),
  type:              z.enum(DEVICE_TYPES),
  protocol:          z.enum(PROTOCOLS),
  plantId:           z.string().min(1),
  ipAddress:         z.string().optional(),
  port:              z.number().int().min(1).max(65535).optional(),
  modbusUnitId:      z.number().int().min(1).max(247).optional(),
  brokerUrl:         z.string().optional(),
  topic:             z.string().optional(),
  pollingIntervalSec: z.number().int().min(5).max(3600).default(30),
});

const UpdateDeviceBody = z.object({
  name:              z.string().min(1).max(120).optional(),
  ipAddress:         z.string().optional(),
  port:              z.number().int().min(1).max(65535).optional(),
  modbusUnitId:      z.number().int().min(1).max(247).optional(),
  brokerUrl:         z.string().optional(),
  topic:             z.string().optional(),
  pollingIntervalSec: z.number().int().min(5).max(3600).optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

type DeviceRow = typeof devicesTable.$inferSelect;
type DeviceConfig = {
  ipAddress?: string;
  port?: number;
  modbusUnitId?: number;
  brokerUrl?: string;
  topic?: string;
  pollingIntervalSec?: number;
  pendingDeploy?: boolean;
};

function parseConfig(raw: unknown): DeviceConfig {
  if (!raw || typeof raw !== "object") return {};
  return raw as DeviceConfig;
}

function toDeviceResponse(row: DeviceRow, now: Date) {
  const sim = deviceStatus(row.id, now);
  const cfg = parseConfig(row.config);
  return {
    id: row.id,
    orgId: row.orgId,
    plantId: row.plantId,
    name: row.name,
    type: row.type,
    protocol: row.protocol,
    status: sim.status,
    signalStrengthPct: sim.signalStrengthPct,
    lastSeenAt: sim.lastSeenAt,
    firmwareVersion: sim.firmwareVersion,
    config: {
      ipAddress:          cfg.ipAddress ?? null,
      port:               cfg.port ?? null,
      modbusUnitId:       cfg.modbusUnitId ?? null,
      brokerUrl:          cfg.brokerUrl ?? null,
      topic:              cfg.topic ?? null,
      pollingIntervalSec: cfg.pollingIntervalSec ?? 30,
    },
    pendingDeploy: cfg.pendingDeploy ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── GET /devices ──────────────────────────────────────────────────────────────

router.get("/devices", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const now = new Date();

  const conditions: SQL[] = [];
  const oc = orgCondition(devicesTable.orgId, orgId);
  if (oc) conditions.push(oc);
  if (req.query["plantId"]) conditions.push(eq(devicesTable.plantId, req.query["plantId"] as string));

  const rows = await db
    .select()
    .from(devicesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(devicesTable.name);

  res.json(rows.map((r) => toDeviceResponse(r, now)));
});

// ── POST /devices ─────────────────────────────────────────────────────────────

router.post("/devices", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) {
    res.status(400).json({ error: "org_required", message: "Impersonate a specific org before registering devices" });
    return;
  }

  const body = RegisterDeviceBody.parse(req.body);

  // Verify plant belongs to org
  const plants = getOrgPlants(orgId);
  if (!plants.find((p) => p.id === body.plantId)) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }

  const config: DeviceConfig = {
    ipAddress:          body.ipAddress,
    port:               body.port,
    modbusUnitId:       body.modbusUnitId,
    brokerUrl:          body.brokerUrl,
    topic:              body.topic,
    pollingIntervalSec: body.pollingIntervalSec,
    pendingDeploy:      false,
  };

  const now = new Date();
  const [created] = await db
    .insert(devicesTable)
    .values({
      id:       randomUUID(),
      orgId,
      plantId:  body.plantId,
      name:     body.name,
      type:     body.type,
      protocol: body.protocol,
      status:   "offline",
      config,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  req.log.info({ deviceId: created?.id }, "Device registered");
  res.status(201).json(toDeviceResponse(created!, now));
});

// ── GET /devices/:id ──────────────────────────────────────────────────────────

router.get("/devices/:id", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, (req.params["id"] as string) ?? ""));
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  const now = new Date();
  const timeline = deviceConnectivityTimeline(row.id, now);

  res.json({
    ...toDeviceResponse(row, now),
    connectivityTimeline: timeline.map((p) => ({
      timestamp: p.timestamp,
      status: p.status,
    })),
  });
});

// ── PATCH /devices/:id ────────────────────────────────────────────────────────

router.patch("/devices/:id", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const deviceId = (req.params["id"] as string) ?? "";
  const [existing] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (!existing || (orgId !== null && existing.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  const body = UpdateDeviceBody.parse(req.body);
  const currentCfg = parseConfig(existing.config);

  // Merge config changes; set pendingDeploy = true so UI shows "deploy pending"
  const newCfg: DeviceConfig = {
    ...currentCfg,
    ...(body.ipAddress !== undefined && { ipAddress: body.ipAddress }),
    ...(body.port !== undefined && { port: body.port }),
    ...(body.modbusUnitId !== undefined && { modbusUnitId: body.modbusUnitId }),
    ...(body.brokerUrl !== undefined && { brokerUrl: body.brokerUrl }),
    ...(body.topic !== undefined && { topic: body.topic }),
    ...(body.pollingIntervalSec !== undefined && { pollingIntervalSec: body.pollingIntervalSec }),
    pendingDeploy: true,
  };

  const now = new Date();
  const updates: Partial<typeof devicesTable.$inferInsert> = {
    config: newCfg,
    updatedAt: now,
  };
  if (body.name) updates.name = body.name;

  const [updated] = await db.update(devicesTable).set(updates).where(eq(devicesTable.id, deviceId)).returning();
  req.log.info({ deviceId }, "Device config updated — pending deploy");
  res.json(toDeviceResponse(updated!, now));
});

// ── POST /devices/:id/restart ─────────────────────────────────────────────────

router.post("/devices/:id/restart", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const deviceId = (req.params["id"] as string) ?? "";
  const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  req.log.info({ deviceId }, "Device restart requested");
  // Simulate restart: update updatedAt so "last action" timestamp changes
  await db.update(devicesTable).set({ updatedAt: new Date() }).where(eq(devicesTable.id, deviceId));
  res.json({ ok: true, message: "Restart command sent to device" });
});

// ── POST /devices/:id/sync ────────────────────────────────────────────────────

router.post("/devices/:id/sync", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const deviceId = (req.params["id"] as string) ?? "";
  const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  // Clear pendingDeploy — config acknowledged by device
  const cfg = parseConfig(row.config);
  cfg.pendingDeploy = false;
  const [updated] = await db
    .update(devicesTable)
    .set({ config: cfg, updatedAt: new Date() })
    .where(eq(devicesTable.id, deviceId))
    .returning();

  req.log.info({ deviceId }, "Device config sync acknowledged");
  res.json({ ok: true, message: "Config synced to device", pendingDeploy: false, updatedAt: updated?.updatedAt });
});

// ── GET /devices/:id/logs ─────────────────────────────────────────────────────

router.get("/devices/:id/logs", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const deviceId = (req.params["id"] as string) ?? "";
  const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  const count = Math.min(Number(req.query["count"] ?? 100), 200);
  const logs = deviceLogs(deviceId, count, new Date());
  res.json(logs);
});

export default router;
