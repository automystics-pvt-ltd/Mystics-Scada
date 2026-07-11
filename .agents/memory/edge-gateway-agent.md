---
name: Edge Gateway Agent architecture
description: How the plant-local edge gateway agent authenticates, ingests readings, and coexists with the cloud driver registry — read before touching lib/edge-agent or routes/gateway.ts.
---

## Token auth: never blanket `router.use()` a sub-router mounted without a path prefix
`gatewayAgentRouter` (bearer-token routes: `/gateway/devices`, `/gateway/readings`, `/gateway/heartbeat`) and `gatewayAdminRouter` (session-cookie routes: `/gateway/register`, `/gateway/list`, `/gateway/:id/revoke`) share the `/gateway` prefix but sit on opposite sides of `authenticate` in `routes/index.ts` (agent router mounted before, admin router after).

**Why:** `router.use(validateGatewayToken)` on the whole agent router matches *every* path reaching that router instance, not just the routes actually defined in it. Since the agent router is `app.use()`-mounted with no path argument, it receives all requests — so a blanket `.use` 401'd `/gateway/register` and `/gateway/list` before they could ever reach the admin router later in the chain.

**How to apply:** apply the token-auth middleware per-route (`router.get("/gateway/devices", validateGatewayToken, handler)`), never as a router-wide `.use()`, whenever two routers sharing a path prefix are mounted at different points in the middleware chain.

## Super-admin write guard needs new scoped-route prefixes registered
`routes/index.ts` has a `requireOrgScopeForWrites` guard that 400s any mutating request from an unimpersonated super-admin unless the path starts with `/superadmin`, `/org`, or (now) `/gateway`. Any new top-level route family whose handlers resolve org from something other than `resolveOrgId()` (e.g. from `req.user.orgId` directly, or from a bearer-token payload) must be added to that prefix allowlist or admin-initiated writes will 400 with `org_required` even though the handler itself is correctly scoped.

## Driver registry treats gateway-assigned devices as a distinct status
`devices.gatewayId` (nullable FK → `gateway_tokens`) tells the cloud driver registry (`lib/drivers/registry.ts`) to skip `_launchDriver` for that device and report health-stats status `"managed_by_gateway"` instead of `"no_driver"`. Assigning/unassigning a device to a gateway goes through the normal PATCH `/devices/:id` route (`gatewayId: string | null`), which calls `driverRegistry.restartDevice()` — the existing restart flow correctly stops any live cloud-side driver when `gatewayId` becomes non-null.

## Edge agent package scope (as of the initial build)
`lib/edge-agent` is a standalone deployable Node/Docker package (not a workspace-composite lib — leaf `tsc --noEmit` + esbuild bundle like `artifacts/api-server`). It ships self-contained pollers for Modbus TCP, MQTT, and HTTP only (not the full 6-protocol driver set the cloud API supports) — a deliberate scope cut to avoid extracting ~2500 lines of driver code into a shared package. OPC-UA/BACnet/Modbus-RTU/WebSocket devices must stay unassigned from any gateway. Offline buffering uses a local SQLite file (better-sqlite3, capped rows, oldest-first pruning) flushed to `/gateway/readings` in batches; `better-sqlite3` needed adding to `onlyBuiltDependencies` in pnpm-workspace.yaml.
