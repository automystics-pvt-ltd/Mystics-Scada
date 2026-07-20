/**
 * Zero-config push ingest endpoints.
 *
 * POST /api/push        — device POSTs its JSON to one fixed URL, no token, no setup.
 * POST /api/ingest/:token — token-authenticated variant (kept for backward compat)
 *
 * Both routes share flattenPayload() and resolveDevice() from lib/pushIngest.ts.
 */

import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, devicesTable } from "@workspace/db";
import { driverRegistry } from "../lib/drivers/registry.js";
import { flattenPayload, resolveDevice } from "../lib/pushIngest.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── POST /api/push — zero-config, no token required ──────────────────────────
router.post("/push", async (req, res) => {
  const body = req.body as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "body_required", message: "POST body must be JSON" });
    return;
  }

  // Device name: query param → body field → fallback
  const deviceName = String(
    (req.query["device"] as string | undefined) ??
    body["device"] ??
    body["name"] ??
    body["deviceName"] ??
    "TRB246",
  );

  try {
    const device     = await resolveDevice(deviceName);
    const params     = flattenPayload(body);
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

// ── POST /api/ingest/:token — token-authenticated variant ────────────────────
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

  const params     = flattenPayload(body as Record<string, unknown>);
  const paramCount = Object.keys(params).length;

  if (paramCount === 0) {
    res.status(400).json({ error: "no_data", message: "No numeric values found in payload" });
    return;
  }

  await driverRegistry.injectReading(device.id, device.orgId, params);
  res.json({ ok: true, deviceId: device.id, paramCount, ts: new Date().toISOString() });
});

export default router;
