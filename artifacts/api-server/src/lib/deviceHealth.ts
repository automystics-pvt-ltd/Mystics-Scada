/**
 * Communication Health Score
 *
 * Reads the last hour of device_comm_logs for a device and computes a
 * recency-weighted success ratio (0-100): recent events count more than
 * older ones, so a device that just recovered from a bad patch trends back
 * up quickly instead of being dragged down by stale failures.
 */

import { and, eq, gte } from "drizzle-orm";
import { db, devicesTable, deviceCommLogsTable } from "@workspace/db";
import { logger } from "./logger.js";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const SUCCESS_EVENTS = new Set(["READ_OK", "CONNECT"]);
const FAILURE_EVENTS = new Set([
  "READ_FAIL", "TIMEOUT", "PARSE_ERROR", "ERROR", "DISCONNECT",
]);

/**
 * Computes a 0-100 health score from the last hour of comm log events and
 * persists it to devices.health_score. Returns the computed score, or null
 * if there is no comm log data in the window (score left untouched).
 */
export async function computeDeviceHealthScore(deviceId: string, now: Date): Promise<number | null> {
  const windowStart = new Date(now.getTime() - WINDOW_MS);

  const rows = await db
    .select({ eventType: deviceCommLogsTable.eventType, occurredAt: deviceCommLogsTable.occurredAt })
    .from(deviceCommLogsTable)
    .where(and(eq(deviceCommLogsTable.deviceId, deviceId), gte(deviceCommLogsTable.occurredAt, windowStart)));

  const relevant = rows.filter((r) => SUCCESS_EVENTS.has(r.eventType) || FAILURE_EVENTS.has(r.eventType));
  if (relevant.length === 0) return null;

  // Recency weight: linear ramp from 0.2 (start of window, 1h ago) to 1.0 (now).
  let weightedSuccess = 0;
  let weightedTotal = 0;
  for (const r of relevant) {
    const ageMs = now.getTime() - r.occurredAt.getTime();
    const ageFrac = Math.min(1, Math.max(0, ageMs / WINDOW_MS));
    const weight = 1 - ageFrac * 0.8; // 1.0 (now) .. 0.2 (1h ago)
    weightedTotal += weight;
    if (SUCCESS_EVENTS.has(r.eventType)) weightedSuccess += weight;
  }

  const score = weightedTotal > 0 ? Math.round((weightedSuccess / weightedTotal) * 100) : 0;

  try {
    await db.update(devicesTable).set({ healthScore: score, updatedAt: now }).where(eq(devicesTable.id, deviceId));
  } catch (err) {
    logger.warn({ deviceId, err }, "Failed to persist device health score (non-critical)");
  }

  return score;
}
