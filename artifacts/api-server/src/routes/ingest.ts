/**
 * Zero-config push ingest endpoints.
 *
 * POST /api/push  — device POSTs its JSON to one fixed URL, no token, no setup.
 *   • Reads device name from body field "device" (default: "TRB246")
 *   • Auto-creates the device under the first org/plant on first POST
 *   • Flattens nested JSON, handles Teltonika {address, value} pairs
 *
 * POST /api/ingest/:token  — token-authenticated variant (kept for backward compat)
 */

import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, devicesTable, organizationsTable, plantsTable } from "@workspace/db";
import { driverRegistry } from "../lib/drivers/registry.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Recursively flatten nested JSON. Teltonika {address, value} → keep .value under parent key. */
function flattenPayload(
  obj: unknown,
  prefix = "",
  depth = 0,
): Record<string, number | string | boolean> {
  const result: Record<string, number | string | boolean> = {};
  if (depth > 8 || obj == null || typeof obj !== "object" || Array.isArray(obj)) return result;

  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    // Skip metadata fields that carry no measurement value
    if (["device", "timestamp", "ts", "time", "address"].includes(k)) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) continue;

    if (typeof v === "object" && !Array.isArray(v)) {
      const nested = v as Record<string, unknown>;
      // Teltonika pattern: {address: N, value: N} → store as parent key = value
      if ("value" in nested && typeof nested.value === "number") {
        result[key] = nested.value;
      } else {
        Object.assign(result, flattenPayload(v, key, depth + 1));
      }
    } else if (typeof v === "number") {
      result[key] = v;
    } else if (typeof v === "string") {
      const n = Number(v);
      result[key] = v.trim() !== "" && isFinite(n) ? n : v;
    } else if (typeof v === "boolean") {
      result[key] = v;
    }
  }
  return result;
}

/** Find or auto-create a device by name. Returns {id, orgId}. */
async function resolveDevice(name: string): Promise<{ id: string; orgId: string }> {
  // 1. Try to find existing device with this name
  const [existing] = await db
    .select({ id: devicesTable.id, orgId: devicesTable.orgId })
    .from(devicesTable)
    .where(sql`lower(${devicesTable.name}) = lower(${name})`)
    .limit(1);

  if (existing) return existing;

  // 2. Auto-provision: grab the first org
  const [org] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .limit(1);

  if (!org) throw new Error("No organisation found — seed the database first");

  // 3. Grab the first plant (optional — device can exist without one)
  const [plant] = await db
    .select({ id: plantsTable.id })
    .from(plantsTable)
    .where(eq(plantsTable.orgId, org.id))
    .limit(1);

  // 4. Create the device
  const now  = new Date();
  const id   = randomUUID();
  await db.insert(devicesTable).values({
    id,
    orgId:     org.id,
    plantId:   plant?.id ?? null,
    name,
    type:      "data_logger",
    protocol:  "http_push",
    status:    "offline",
    config:    {},
    createdAt: now,
    updatedAt: now,
  });

  logger.info({ id, name, orgId: org.id }, "Auto-provisioned push device");
  return { id, orgId: org.id };
}

// ── POST /api/push — zero-config, no token required ──────────────────────────
router.post("/push", async (req, res) => {
  const body = req.body as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "body_required", message: "POST body must be JSON" });
    return;
  }

  // Device name from body, query param, or fallback
  const deviceName = String(
    (req.query["device"] as string | undefined) ??
    body["device"] ??
    body["name"] ??
    body["deviceName"] ??
    "TRB246"
  );

  try {
    const device = await resolveDevice(deviceName);
    const params = flattenPayload(body);
    const paramCount = Object.keys(params).length;

    if (paramCount === 0) {
      res.status(400).json({ error: "no_data", message: "No numeric values found in payload" });
      return;
    }

    await driverRegistry.injectReading(device.id, device.orgId, params);
    res.json({ ok: true, device: deviceName, paramCount, ts: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, "Push ingest error");
    res.status(500).json({ error: "ingest_failed", message: String(err) });
  }
});

// ── POST /api/ingest/:token — token-authenticated variant (backward compat) ──
router.post("/ingest/:token", async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 16) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  const [device] = await db
    .select({ id: devicesTable.id, orgId: devicesTable.orgId })
    .from(devicesTable)
    .where(sql`${devicesTable.config}->>'ingestToken' = ${token}`)
    .limit(1);

  if (!device) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  const body = req.body as unknown;
  if (body == null || typeof body !== "object") {
    res.status(400).json({ error: "body_required", message: "POST body must be JSON" });
    return;
  }

  const params = flattenPayload(body as Record<string, unknown>);
  const paramCount = Object.keys(params).length;

  if (paramCount === 0) {
    res.status(400).json({ error: "no_data", message: "No numeric values found in payload" });
    return;
  }

  await driverRegistry.injectReading(device.id, device.orgId, params);
  res.json({ ok: true, deviceId: device.id, paramCount, ts: new Date().toISOString() });
});

export default router;
