---
name: Reporting Engine Architecture
description: How the Task #13 reporting engine is structured — generation flow, PDF, schedules, and org-scoping.
---

# Reporting Engine

## Generation flow
Reports are generated **on-demand at download time** — no file storage needed:
1. `POST /api/org/reports/generate` creates a DB record with `status=ready` immediately.
2. `GET /api/reports/:id/download` re-generates the content from stored `reportType`, `dateFrom`, `dateTo` using simulation functions.

**Why:** The simulation layer is deterministic and in-memory, so regeneration is trivial and avoids any file storage infrastructure.

## Route scoping
- `POST /api/org/reports/generate` is under `/org/` so `requireOrgScopeForWrites` exempts it for super-admin users. Uses `req.user!.orgId` directly (consistent with all `/org/**` routes).
- `GET /api/reports/:id/download` uses `resolveOrgId(req)` to filter by org — prevents cross-tenant download.
- `/org/report-schedules` CRUD all use `req.user!.orgId` directly.

**Why:** `/org/**` routes always bind to the caller's own org (see codebase-wide convention). `resolveOrgId` is for cross-org-capable read routes.

## pdfkit in esbuild
`pdfkit` must be in the `external` list in `artifacts/api-server/build.mjs`. Without this, fontkit→brotli requires `@swc/helpers` CJS which is externalized but not installed.

## Duplicate schedule prevention
DB unique constraint `report_schedules_org_type_freq_uq` on `(orgId, reportType, frequency)`.
Catch block catches by checking `"23505"` | `"unique"` in the serialized error (Drizzle wraps pg errors, constraint name not always in `.message`).

## New DB tables/columns
- `reportSchedulesTable` in `lib/db/src/schema/reportSchedules.ts`
- `reportsTable` gained: `reportType text`, `dateFrom timestamptz`, `dateTo timestamptz`
- New permission: `reports.schedule`
- Run `pnpm --filter @workspace/db push` after schema changes; then `pnpm exec tsc -b` in `lib/db` and `lib/permissions` to regenerate `.d.ts` for project references.
