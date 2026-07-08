---
name: Notifications architecture
description: How in-app notifications, SSE push, email/webhook delivery, and the bell UI are wired together.
---

## Rule
`createNotification()` is fire-and-forget: it writes to `notificationsTable`, pushes to all connected SSE clients for that org via `notificationRegistry`, then async-delivers email/webhook.  Callers never await it.

**Why:** Notification failure must never block the primary mutation response (alert PATCH, WO create, etc.).

**How to apply:** Import from `../lib/createNotification` in any API route that should emit a notification; call without await.

## Key architectural pieces

- `lib/db/src/schema/notifications.ts` — `notificationsTable` (id, orgId, type, title, message, resourceType, resourceId, resourceUrl, isRead, createdAt).
- `artifacts/api-server/src/lib/notificationRegistry.ts` — Map<orgId, Set<EmitFn>>; clients register at SSE connect time.
- `artifacts/api-server/src/lib/createNotification.ts` — persist + SSE push + async email/webhook delivery.
- `artifacts/api-server/src/routes/notifications.ts` — GET /notifications, GET /notifications/unread-count, PATCH /:id/read, POST /read-all.
- `artifacts/solar-scada/src/components/notification-panel.tsx` — exports `NotificationBell` (bell + slide-over panel) and `useUnreadCount` hook.

## Webhook signing rule
Only include `X-SCADA-Signature` header when the tenant has set a secret.  Sending a predictable HMAC (e.g. "default-secret") creates a false integrity signal.  When no secret is configured, deliver unsigned (no signature header).

## DB package rebuild
`lib/db` emits `.d.ts` files into `dist/` via TypeScript project references.  Adding a new schema file requires `npx tsc -p tsconfig.json` in `lib/db` before downstream packages see the new types.

## SSE stream pairing
The fleet SSE stream (`/stream/telemetry`) calls `registerOrgNotificationClient` at connection time and the returned unregister function on `req.close`.  No additional stream endpoint is needed — notifications ride the existing SSE channel as a `notification` event type.
