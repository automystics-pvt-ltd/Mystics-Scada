/**
 * Fault injection store for demo/operator use.
 *
 * Faults are kept in a fast in-process Map for hot-path reads (telemetry
 * stream checks every 3 s), AND persisted to the `fault_overrides` Postgres
 * table so they survive a server restart or hot-reload.
 *
 * Critical mutations (inject, clear, attach alertId) await their DB writes
 * before returning so the on-disk state is authoritative at restart boundaries.
 * Background cleanup paths (lazy expiry in getActiveFaults, startup prune) are
 * still fire-and-forget since a missed cleanup is harmless — the next call
 * re-evicts the row.
 */

import { eq, inArray, lt } from "drizzle-orm";
import { db, faultOverridesTable } from "@workspace/db";
import { logger } from "./logger";

export type FaultTarget =
  | { kind: "plant" }                         // whole-plant grid disconnect
  | { kind: "inverter"; inverterId: string }; // single inverter offline

export interface ActiveFault {
  /** Stable lookup key: "<plantId>:plant" or "<plantId>:<inverterId>" */
  key: string;
  plantId: string;
  /** Organisation that owns this plant — stored so expiry callbacks have it. */
  orgId: string;
  target: FaultTarget;
  /** Human-readable description shown in the UI */
  label: string;
  injectedAt: number; // Unix ms
  expiresAt: number;  // Unix ms
  /** Alert row ID written to the DB when this fault was injected. */
  alertId?: string;
}

// ---- module-level store ----
const store = new Map<string, ActiveFault>();

function makeKey(plantId: string, target: FaultTarget): string {
  return target.kind === "plant"
    ? `${plantId}:plant`
    : `${plantId}:${target.inverterId}`;
}

/**
 * Inject a fault into the in-memory store AND persist it to the DB.
 * Awaiting the DB write ensures the fault survives an immediate restart.
 */
export async function injectFault(
  orgId: string,
  plantId: string,
  target: FaultTarget,
  durationMs: number,
): Promise<ActiveFault> {
  const now = Date.now();
  const key = makeKey(plantId, target);
  const label =
    target.kind === "plant"
      ? "Full plant grid disconnect"
      : `Inverter offline (${target.inverterId.split("-inv-")[1] !== undefined ? `#${Number(target.inverterId.split("-inv-")[1]) + 1}` : target.inverterId})`;
  const fault: ActiveFault = {
    key,
    plantId,
    orgId,
    target,
    label,
    injectedAt: now,
    expiresAt: now + durationMs,
  };

  // Persist to DB FIRST — if this throws the route returns 5xx and the fault
  // is never written to memory, keeping state consistent on failure.
  // alertId is excluded from the conflict-update set (updated separately via
  // attachAlertToFault). On re-inject, stale alertId is explicitly cleared so
  // a crash before the new attach restores with alertId=null (no wrong resolve).
  await db.insert(faultOverridesTable)
    .values({
      key,
      plantId,
      orgId,
      targetJson: target as Record<string, unknown>,
      label,
      injectedAt: new Date(now),
      expiresAt: new Date(now + durationMs),
    })
    .onConflictDoUpdate({
      target: faultOverridesTable.key,
      set: {
        plantId,
        orgId,
        targetJson: target as Record<string, unknown>,
        label,
        injectedAt: new Date(now),
        expiresAt: new Date(now + durationMs),
        alertId: null,
      },
    });

  // DB write succeeded — now reflect in memory
  store.set(key, fault);
  return fault;
}

/**
 * Attach the DB alert row ID to a fault after async creation.
 * Awaited so that a crash right after alert creation doesn't lose the linkage.
 */
export async function attachAlertToFault(key: string, alertId: string): Promise<void> {
  const fault = store.get(key);
  if (fault) fault.alertId = alertId;

  // Errors propagate — caller should handle (route awaits this before responding)
  await db.update(faultOverridesTable)
    .set({ alertId })
    .where(eq(faultOverridesTable.key, key));
}

/**
 * Remove a single fault from memory AND the DB.
 * Returns the evicted fault (with its alertId) so the caller can resolve the alert.
 */
export async function clearFault(key: string): Promise<ActiveFault | undefined> {
  const fault = store.get(key);

  // Delete from DB FIRST — if this throws, in-memory entry is untouched so
  // there is no contradiction between memory and the persisted store.
  await db.delete(faultOverridesTable).where(eq(faultOverridesTable.key, key));

  store.delete(key);
  return fault;
}

/**
 * Remove all faults for a plant from memory AND the DB.
 * Returns the evicted faults so the caller can resolve their alerts.
 */
export async function clearAllFaults(plantId: string): Promise<ActiveFault[]> {
  // Collect candidates first — do not remove from memory until DB delete succeeds
  const cleared: ActiveFault[] = [];
  for (const [, v] of store) {
    if (v.plantId === plantId) cleared.push(v);
  }

  if (cleared.length > 0) {
    // Delete from DB FIRST, then remove from memory once durability is confirmed.
    await db.delete(faultOverridesTable).where(inArray(faultOverridesTable.key, cleared.map((f) => f.key)));
    for (const f of cleared) store.delete(f.key);
  }

  return cleared;
}

/**
 * Returns only non-expired faults; lazily evicts expired ones.
 * DB cleanup here is fire-and-forget — a missed delete is harmless (startup prune catches it).
 */
export function getActiveFaults(plantId: string): ActiveFault[] {
  const now = Date.now();
  const result: ActiveFault[] = [];
  for (const [k, v] of store) {
    if (v.plantId !== plantId) continue;
    if (v.expiresAt <= now) {
      store.delete(k);
      db.delete(faultOverridesTable)
        .where(eq(faultOverridesTable.key, k))
        .catch((err: unknown) => logger.error({ err, key: k }, "Failed to delete expired fault from DB"));
      continue;
    }
    result.push(v);
  }
  return result;
}

/** Returns the set of inverter IDs that should be forced offline for a plant. */
export function getFaultedInverterIds(plantId: string): Set<string> {
  const faults = getActiveFaults(plantId);
  const ids = new Set<string>();
  for (const f of faults) {
    if (f.target.kind === "inverter") ids.add(f.target.inverterId);
  }
  return ids;
}

/** True when a full plant-disconnect fault is active for `plantId`. */
export function isPlantDisconnected(plantId: string): boolean {
  return getActiveFaults(plantId).some((f) => f.target.kind === "plant");
}

/**
 * Restore a fault into the in-memory store from a persisted DB row.
 * Does NOT write to the DB — used exclusively during startup replay so
 * original timestamps are preserved exactly.
 */
export function restoreFaultInMemory(fault: ActiveFault): void {
  store.set(fault.key, { ...fault });
}

/**
 * Delete all rows in fault_overrides that have already expired.
 * Fire-and-forget — called from initFaultStore; harmless if it fails.
 */
export function pruneExpiredFaultRows(): void {
  db.delete(faultOverridesTable)
    .where(lt(faultOverridesTable.expiresAt, new Date()))
    .catch((err: unknown) => logger.error({ err }, "Failed to prune expired fault rows"));
}
