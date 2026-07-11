/**
 * Generic in-memory pub-sub registry for Server-Sent Events.
 *
 * Maps `channel → orgId → Set<emit>` so multiple independent event streams
 * (notifications, device readings, etc.) can share one org-scoped delivery
 * mechanism instead of each growing its own bespoke Map.
 *
 * Org scoping mirrors `resolveOrgId()`: a super-admin connection (orgId ===
 * null) is registered as a "wildcard" client and receives every org's
 * events on that channel; an org-scoped client only ever receives events
 * published for its own orgId.
 */

type EmitFn = (data: unknown) => void;

interface ChannelRegistry {
  /** orgId -> clients scoped to exactly that org */
  orgClients: Map<string, Set<EmitFn>>;
  /** super-admin clients (orgId === null at connect time) — receive all orgs' events */
  wildcardClients: Set<EmitFn>;
}

const channels = new Map<string, ChannelRegistry>();

function getOrCreateChannel(channel: string): ChannelRegistry {
  let entry = channels.get(channel);
  if (!entry) {
    entry = { orgClients: new Map(), wildcardClients: new Set() };
    channels.set(channel, entry);
  }
  return entry;
}

/**
 * Register an SSE client on a channel, scoped to `orgId` (or `null` for a
 * super-admin client that should see every org's events).
 * Returns an unregister function — call it when the client disconnects.
 */
export function subscribe(channel: string, orgId: string | null, emit: EmitFn): () => void {
  const registry = getOrCreateChannel(channel);

  if (orgId === null) {
    registry.wildcardClients.add(emit);
    return () => registry.wildcardClients.delete(emit);
  }

  if (!registry.orgClients.has(orgId)) registry.orgClients.set(orgId, new Set());
  registry.orgClients.get(orgId)!.add(emit);
  return () => {
    const set = registry.orgClients.get(orgId);
    if (set) {
      set.delete(emit);
      if (set.size === 0) registry.orgClients.delete(orgId);
    }
  };
}

/**
 * Publish an event to every client subscribed to `channel` for `orgId`,
 * plus every wildcard (super-admin) client on that channel.
 */
export function publish(channel: string, orgId: string, data: unknown): void {
  const registry = channels.get(channel);
  if (!registry) return;

  registry.orgClients.get(orgId)?.forEach((emit) => {
    try { emit(data); } catch { /* client already disconnected */ }
  });
  registry.wildcardClients.forEach((emit) => {
    try { emit(data); } catch { /* client already disconnected */ }
  });
}
