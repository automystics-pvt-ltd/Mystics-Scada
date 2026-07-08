/**
 * In-memory pub-sub registry mapping orgId → set of SSE emit callbacks.
 *
 * When a new notification is created for an org, every SSE client connected
 * under that org is immediately notified without waiting for the next telemetry
 * tick.  Callbacks are registered at SSE connect time and removed on disconnect.
 */

type EmitFn = (data: unknown) => void;

const registry = new Map<string, Set<EmitFn>>();

/**
 * Register an SSE client for an org.
 * Returns an unregister function — call it when the client disconnects.
 */
export function registerOrgNotificationClient(orgId: string, emit: EmitFn): () => void {
  if (!registry.has(orgId)) registry.set(orgId, new Set());
  registry.get(orgId)!.add(emit);
  return () => {
    const set = registry.get(orgId);
    if (set) {
      set.delete(emit);
      if (set.size === 0) registry.delete(orgId);
    }
  };
}

/**
 * Push a notification payload to all SSE clients currently connected under orgId.
 * Super-admin connections (orgId = null) are not registered here.
 */
export function pushNotificationToOrg(orgId: string, data: unknown): void {
  registry.get(orgId)?.forEach((emit) => {
    try { emit(data); } catch { /* client already disconnected */ }
  });
}
