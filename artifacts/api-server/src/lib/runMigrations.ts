/**
 * runMigrations.ts
 *
 * Runs drizzle SQL migrations from the `drizzle/` folder that is copied
 * alongside the compiled binary during build.  Uses drizzle-orm's built-in
 * migrator so each migration is only applied once (tracked in
 * __drizzle_migrations).
 *
 * Called once at server startup, before any table access.
 */

import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { logger } from "./logger.js";

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
    // Non-fatal: tables may already exist from a prior push.
    // Log the error but let the server continue — individual route handlers
    // already handle missing-table errors gracefully.
    logger.warn({ err, migrationsFolder }, "DB migration warning — schema may already be current");
  }
}
