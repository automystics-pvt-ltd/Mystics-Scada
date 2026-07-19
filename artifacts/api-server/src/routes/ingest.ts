/**
 * HTTP Push Ingest Endpoint
 *
 * Devices (e.g. Teltonika TRB246 "Data to Server") POST their JSON payload to:
 *   POST /api/ingest/:token
 *
 * No session auth — the token IS the device credential.
 * The token is generated at device registration and stored in devices.config->ingestToken.
 */

import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, devicesTable } from "@workspace/db";
import { driverRegistry } from "../lib/drivers/registry.js";

const router = Router();

/** Recursively flatten nested JSON into a ParamMap, handling TRB246 {address,value} pattern. */
function flattenPayload(obj: unknown, prefix = "", depth = 0): Record<string, number | string | boolean> {
  const result: Record<string, number | string | boolean> = {};
  if (depth > 8 || obj == null || typeof obj !== "object" || Array.isArray(obj)) return result;

  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) continue;

    if (typeof v === "object" && !Array.isArray(v)) {
      const nested = v as Record<string, unknown>;
      // TRB246 pattern: {address: N, value: N} → use parent key, extract .value only
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

// POST /api/ingest/:token — no auth middleware, token authenticates the request
router.post("/ingest/:token", async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 16) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  // Look up device by ingest token stored in config JSONB
  const [device] = await db
    .select({ id: devicesTable.id, orgId: devicesTable.orgId, config: devicesTable.config })
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

  // Flatten the payload (handles nested TRB246 readings.*.value structure)
  const params = flattenPayload(body);
  const paramCount = Object.keys(params).length;

  if (paramCount === 0) {
    res.status(400).json({ error: "no_data", message: "No numeric values found in payload" });
    return;
  }

  // Inject into the registry — same pipeline as a live driver reading
  await driverRegistry.injectReading(device.id, device.orgId, params);

  res.json({ ok: true, deviceId: device.id, paramCount, ts: new Date().toISOString() });
});

export default router;
