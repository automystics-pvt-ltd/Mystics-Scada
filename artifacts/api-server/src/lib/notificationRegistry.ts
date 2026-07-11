/**
 * Org-scoped SSE delivery for in-app notifications.
 *
 * Thin wrapper around the generic `sseRegistry` "notification" channel —
 * kept as its own module so existing call sites (`stream.ts`,
 * `createNotification.ts`) don't need to know about channel names.
 *
 * When a new notification is created for an org, every SSE client connected
 * under that org is immediately notified without waiting for the next telemetry
 * tick.  Callbacks are registered at SSE connect time and removed on disconnect.
 */

import { subscribe, publish } from "./sseRegistry";

const CHANNEL = "notification";

type EmitFn = (data: unknown) => void;

/**
 * Register an SSE client for an org.
 * Returns an unregister function — call it when the client disconnects.
 */
export function registerOrgNotificationClient(orgId: string, emit: EmitFn): () => void {
  return subscribe(CHANNEL, orgId, emit);
}

/**
 * Push a notification payload to all SSE clients currently connected under orgId.
 * Super-admin connections (orgId = null) are not registered here.
 */
export function pushNotificationToOrg(orgId: string, data: unknown): void {
  publish(CHANNEL, orgId, data);
}
