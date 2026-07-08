/**
 * In-memory fault injection store for demo/operator use.
 *
 * Faults are ephemeral — they live only for the duration specified at
 * injection time and disappear on server restart.  No persistence needed:
 * this is purely a simulation overlay.
 */

export type FaultTarget =
  | { kind: "plant" }                         // whole-plant grid disconnect
  | { kind: "inverter"; inverterId: string }; // single inverter offline

export interface ActiveFault {
  /** Stable lookup key: "<plantId>:plant" or "<plantId>:<inverterId>" */
  key: string;
  plantId: string;
  target: FaultTarget;
  /** Human-readable description shown in the UI */
  label: string;
  injectedAt: number; // Unix ms
  expiresAt: number;  // Unix ms
}

// ---- module-level store ----
const store = new Map<string, ActiveFault>();

function makeKey(plantId: string, target: FaultTarget): string {
  return target.kind === "plant"
    ? `${plantId}:plant`
    : `${plantId}:${target.inverterId}`;
}

export function injectFault(
  plantId: string,
  target: FaultTarget,
  durationMs: number,
): ActiveFault {
  const now = Date.now();
  const key = makeKey(plantId, target);
  const label =
    target.kind === "plant"
      ? "Full plant grid disconnect"
      : `Inverter offline (${target.inverterId.split("-inv-")[1] !== undefined ? `#${Number(target.inverterId.split("-inv-")[1]) + 1}` : target.inverterId})`;
  const fault: ActiveFault = {
    key,
    plantId,
    target,
    label,
    injectedAt: now,
    expiresAt: now + durationMs,
  };
  store.set(key, fault);
  return fault;
}

export function clearFault(key: string): void {
  store.delete(key);
}

export function clearAllFaults(plantId: string): void {
  for (const [k, v] of store) {
    if (v.plantId === plantId) store.delete(k);
  }
}

/** Returns only non-expired faults; evicts expired ones as a side-effect. */
export function getActiveFaults(plantId: string): ActiveFault[] {
  const now = Date.now();
  const result: ActiveFault[] = [];
  for (const [k, v] of store) {
    if (v.plantId !== plantId) continue;
    if (v.expiresAt <= now) {
      store.delete(k);
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
