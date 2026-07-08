# Solar SCADA (Automystics Technologies)

Phase 1 control-room monitoring dashboard for a solar plant portfolio: live plant/inverter/string telemetry, weather, yield/PR/availability/revenue analytics, alerting, maintenance work orders, reporting, and user/role administration.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/solar-scada run dev` — run the frontend (web app, artifact `solar-scada`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec (`lib/api-spec/openapi.yaml`)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec) → `lib/api-zod` (schemas) + `lib/api-client-react` (React Query hooks)
- Frontend: React + Vite, Tailwind, Recharts, wouter routing
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth API contract for all endpoints/schemas.
- `artifacts/api-server/src/lib/simulation.ts` + `domain.ts` — deterministic in-memory telemetry simulation (plants, inverters, strings, weather, SLD, yield/performance/revenue) and its adapter to API response shapes.
- `artifacts/api-server/src/lib/seed.ts` — idempotent Postgres seeding for roles/users/alerts/work orders on server startup.
- `artifacts/api-server/src/routes/` — one route module per resource (portfolio, plants, inverters, alerts, workOrders, reports, users), mounted in `routes/index.ts`.
- `lib/db/src/schema/` — Drizzle schema for persisted resources: alerts, alert history, work orders, users, roles, reports.
- `artifacts/solar-scada/` — the frontend web app (dark-mode-first industrial SCADA UI).

## Architecture decisions

- Telemetry (plants, inverters, strings, weather, yield/PR/availability/revenue, SLD) is computed deterministically in-memory via time-seeded pseudo-random functions — no DB needed, since there are no real sensors in Phase 1. See `.agents/memory/simulated-vs-persisted-telemetry.md`.
- Only entities needing real CRUD/mutation state are persisted in Postgres: alerts (+ history), work orders, users, roles, reports.
- API-first workflow: OpenAPI spec → Orval codegen → both backend routes and frontend hooks are built against the generated zod schemas/types, not hand-rolled fetches.
- DB-row-to-API-response mapping is done explicitly per resource (`toWorkOrderResponse`, etc.) rather than passing raw Drizzle rows into `ResponseSchema.parse()`, since column names and response field names can diverge. See `.agents/memory/db-row-response-mapping.md`.

## Product

- `/` portfolio dashboard, `/plants/:plantId` (+ overview/SLD/inverters/weather/analytics sub-pages), `/alerts` alert center, `/maintenance` work order kanban, `/reports`, `/admin/users`, `/settings`, `/login` (mock UI, no real backend auth yet — Phase 1 scope).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Orval's zod generator can produce a name collision (`<Op>Params`) for operations mixing path + query params; fixed via explicit re-export in `lib/api-zod/src/index.ts`. See `.agents/memory/orval-params-collision.md`.
- After changing `lib/db` schema or any workspace lib, run `pnpm -w run typecheck:libs` before typechecking `api-server`, or stale `dist` declarations cause false type errors.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
