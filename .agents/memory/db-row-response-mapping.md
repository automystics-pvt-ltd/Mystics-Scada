---
name: DB row vs API response shape drift
description: Why raw Drizzle rows must never be passed straight into a codegen'd zod response schema's .parse().
---

When an Express route does `db.select().from(table)` and then calls `ResponseSchema.parse(rows)` directly, any place where the DB column name differs from the OpenAPI/zod response field name (e.g. DB `dueAt` vs API `dueDate`, or a DB-only field like `closedAt` that isn't in the response contract) causes a cryptic `ZodError: invalid_date` / `unrecognized_keys` at request time — not at compile time, since Drizzle's inferred row type and the zod response type are structurally unrelated.

**Why:** This bug class is invisible to `tsc` because nothing type-checks the DB row shape against the response schema; it only surfaces as a runtime 500.

**How to apply:** Whenever a DB table's column names don't 1:1 match the OpenAPI response schema field names, write an explicit `toXResponse(row)` mapping function and use it in every route (list/get/create/update) for that resource, rather than passing rows straight to `.parse()`. Audit new persisted resources' routes for this specifically — it's easy to miss for update/create paths since only `.returning()` results are wrong, not the DB writes themselves.
