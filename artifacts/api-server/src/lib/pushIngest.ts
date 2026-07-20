/**
 * Shared helpers for zero-config push ingest.
 * Used by both the HTTP /api/push endpoint and the MQTT subscriber.
 */

import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, devicesTable, organizationsTable, plantsTable } from "@workspace/db";
import { logger } from "./logger.js";

// ── Payload flattening ────────────────────────────────────────────────────────

/**
 * Recursively flatten nested JSON into a flat param map.
 * Handles the Teltonika TRB246 {address, value} register pattern:
 *   { "string1Current": { "address": 7013, "value": 784 } }
 *   → { "string1Current": 784 }
 */
export function flattenPayload(
  obj: unknown,
  prefix = "",
  depth = 0,
): Record<string, number | string | boolean> {
  const result: Record<string, number | string | boolean> = {};
  if (depth > 8 || obj == null || typeof obj !== "object" || Array.isArray(obj)) return result;

  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    // Skip metadata-only fields with no measurement value
    if (["device", "timestamp", "ts", "time", "address"].includes(k)) continue;

    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) continue;

    if (typeof v === "object" && !Array.isArray(v)) {
      const nested = v as Record<string, unknown>;
      // TRB246 pattern: {address: N, value: N} → keep value under parent key
      if ("value" in nested && (typeof nested.value === "number" || typeof nested.value === "string")) {
        const n = Number(nested.value);
        result[key] = isFinite(n) ? n : String(nested.value);
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

// ── Device auto-provisioning ──────────────────────────────────────────────────

/** Cache to avoid repeated DB lookups for the same device name each message. */
const _deviceCache = new Map<string, { id: string; orgId: string }>();

/**
 * Find or auto-create a device record by name.
 * Creates it under the first organisation and plant found in the DB.
 * Results are cached in-process for efficiency.
 */
export async function resolveDevice(name: string): Promise<{ id: string; orgId: string }> {
  const cached = _deviceCache.get(name.toLowerCase());
  if (cached) return cached;

  // Look up existing device by name (case-insensitive)
  const [existing] = await db
    .select({ id: devicesTable.id, orgId: devicesTable.orgId })
    .from(devicesTable)
    .where(sql`lower(${devicesTable.name}) = lower(${name})`)
    .limit(1);

  if (existing) {
    _deviceCache.set(name.toLowerCase(), existing);
    return existing;
  }

  // Auto-provision: find first org
  const [org] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .limit(1);

  if (!org) throw new Error("No organisation found — run seed first");

  // Find first plant (optional — silently skip if table absent)
  const [plant] = await db
    .select({ id: plantsTable.id })
    .from(plantsTable)
    .where(eq(plantsTable.orgId, org.id))
    .limit(1)
    .catch(() => [undefined] as const);

  const now = new Date();
  const id  = randomUUID();

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
  const entry = { id, orgId: org.id };
  _deviceCache.set(name.toLowerCase(), entry);
  return entry;
}

/** Invalidate the in-process device cache (call after device rename/delete). */
export function invalidateDeviceCache(name?: string): void {
  if (name) _deviceCache.delete(name.toLowerCase());
  else _deviceCache.clear();
}
