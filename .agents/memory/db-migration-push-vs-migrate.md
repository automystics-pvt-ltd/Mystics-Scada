---
name: Drizzle migration runner vs push
description: When DB was originally provisioned via drizzle-kit push, the batch migrator fails on 0000_full_schema.sql and rolls back all pending migrations. Use idempotent raw SQL as a fallback in runMigrations.ts.
---

## Rule
`runMigrations.ts` must always run a set of idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements after (or instead of) the drizzle batch migrator. Never rely solely on drizzle's `migrate()` for production schema fixes.

## Why
The VPS DB was originally created via `drizzle-kit push`, so there is no `__drizzle_migrations` tracking table. On every startup, drizzle tries to run all migrations starting from `0000_full_schema.sql`, which fails immediately with "type already exists" / "table already exists". The entire transaction rolls back — including any new incremental migrations (e.g. `0002_add_reset_token.sql`). Result: new columns are never added and every query on the affected table returns Postgres "column does not exist" → unhandled → 500.

## How to apply
- In `runMigrations.ts`, keep the drizzle `migrate()` call but wrap it in try/catch.
- After the try/catch (regardless of outcome), always run a `IDEMPOTENT_ALTERS` array of raw SQL `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements via `pool.connect()`.
- Whenever a new column is added to the schema, add a corresponding idempotent ALTER to that array in `runMigrations.ts`. This is the source of truth for production column backfills.
- Columns that were present in `0000_full_schema.sql` still need to be in the idempotent list because VPS DBs that fail the batch migrator will also miss those columns if they were created before push was run.
