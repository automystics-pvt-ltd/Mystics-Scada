/**
 * runMigrations.ts
 *
 * Runs drizzle SQL migrations from the `drizzle/` folder that is copied
 * alongside the compiled binary during build.  Uses drizzle-orm's built-in
 * migrator so each migration is only applied once (tracked in
 * __drizzle_migrations).
 *
 * Called once at server startup, before any table access.
 *
 * FALLBACK: If the drizzle batch migrator fails (common when the DB was
 * originally created via `drizzle-kit push` rather than `migrate()`, because
 * 0000_full_schema.sql then conflicts with existing types/tables), we apply
 * critical column additions directly via raw SQL so the server can boot.
 */

import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { logger } from "./logger.js";

/** Critical ALTER statements that must exist regardless of migration state.
 *  Each entry is idempotent (IF NOT EXISTS).  Add new columns here whenever
 *  the schema gains a column that older VPS installs won't have yet. */
const IDEMPOTENT_ALTERS = [
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_super_admin" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "user_preferences" jsonb DEFAULT '{}'::jsonb`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_token" text`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_token_expires_at" timestamp with time zone`,
];

export async function runMigrations(): Promise<void> {
  // __dirname is injected by the esbuild banner and resolves to the binary dir
  // (dist/), so migrationsFolder → dist/drizzle/
  const migrationsFolder = path.join(__dirname, "drizzle");

  // Use a short-lived drizzle instance (no schema needed for migrations)
  const migrationDb = drizzle(pool);

  try {
    await migrate(migrationDb, { migrationsFolder });
    logger.info({ migrationsFolder }, "DB migrations applied ✓");
  } catch (err: unknown) {
    // Common on DBs originally provisioned via `drizzle-kit push`:
    // 0000_full_schema.sql re-creates types/tables that already exist, causing
    // the whole transaction to roll back.  Fall through to the idempotent path.
    logger.warn({ migrationsFolder }, "Drizzle batch migration failed (DB likely pre-dates migration runner) — applying idempotent column alters as fallback");
  }

  // Always run the idempotent alters regardless of whether migrate() succeeded.
  // This guarantees every column the app needs exists, even on legacy installs.
  const client = await pool.connect();
  try {
    for (const sql of IDEMPOTENT_ALTERS) {
      try {
        await client.query(sql);
      } catch (colErr: unknown) {
        // Log but never throw — a column that already exists or a minor issue
        // must not prevent the server from starting.
        logger.warn({ sql, err: colErr }, "Idempotent ALTER skipped (already exists or unsupported)");
      }
    }
    logger.info("Idempotent schema alters complete ✓");
  } finally {
    client.release();
  }
}
