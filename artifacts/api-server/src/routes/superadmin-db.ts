/**
 * Database Administration routes — /api/superadmin/db/**
 * All routes require isSuperAdmin (enforced by parent router in index.ts).
 */

import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

// ── CSRF guard for mutations ──────────────────────────────────────────────────
router.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next(); return;
  }
  if (!req.headers["x-scada-request"]) {
    res.status(403).json({ error: "forbidden", message: "Missing required request header" });
    return;
  }
  next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch all public table names from the DB (used for whitelist validation). */
async function getPublicTables(): Promise<string[]> {
  const rows = await db.execute(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );
  return (rows as unknown as { table_name: string }[]).map((r) => r.table_name);
}

/** Validate that a table name exists in the public schema. */
async function validateTable(name: string): Promise<boolean> {
  const tables = await getPublicTables();
  return tables.includes(name);
}

// ── GET /superadmin/db/tables ─────────────────────────────────────────────────

router.get("/superadmin/db/tables", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        t.table_name AS name,
        COALESCE(s.n_live_tup, 0)::integer AS row_count
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
      WHERE t.table_schema = 'public'
      ORDER BY t.table_name
    `);
    res.json(rows);
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ── GET /superadmin/db/tables/:table/schema ───────────────────────────────────

router.get("/superadmin/db/tables/:table/schema", async (req, res) => {
  const tableName = req.params["table"] ?? "";
  if (!(await validateTable(tableName))) {
    res.status(404).json({ error: "table_not_found" }); return;
  }
  try {
    const columns = await db.execute(sql`
      SELECT
        c.column_name AS name,
        c.data_type AS "dataType",
        c.is_nullable AS "isNullable",
        c.column_default AS "columnDefault",
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS "isPrimaryKey"
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = ${tableName}
          AND tc.table_schema = 'public'
      ) pk ON pk.column_name = c.column_name
      WHERE c.table_schema = 'public' AND c.table_name = ${tableName}
      ORDER BY c.ordinal_position
    `);
    res.json({ columns });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ── GET /superadmin/db/tables/:table/records ──────────────────────────────────

router.get("/superadmin/db/tables/:table/records", async (req, res) => {
  const tableName = req.params["table"] ?? "";
  if (!(await validateTable(tableName))) {
    res.status(404).json({ error: "table_not_found" }); return;
  }

  const limit  = Math.min(500, Math.max(1, parseInt(req.query["limit"]  as string) || 50));
  const offset = Math.max(0, parseInt(req.query["offset"] as string) || 0);
  const orderDir = req.query["orderDir"] === "asc" ? "ASC" : "DESC";

  try {
    // Get columns to pick a default sort
    const colRows = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
      ORDER BY ordinal_position LIMIT 1
    `);
    const firstCol = (colRows as unknown as { column_name: string }[])[0]?.column_name ?? "id";
    const orderBy = req.query["orderBy"]?.toString() ?? firstCol;

    // Validate orderBy column
    const allCols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
    `);
    const colNames = (allCols as unknown as { column_name: string }[]).map((c) => c.column_name);
    const safeOrderBy = colNames.includes(orderBy) ? orderBy : firstCol;

    // Execute with raw SQL via drizzle's sql.raw helper
    const records = await db.execute(
      sql.raw(`SELECT * FROM "${tableName}" ORDER BY "${safeOrderBy}" ${orderDir} LIMIT ${limit} OFFSET ${offset}`)
    );
    const countRows = await db.execute(
      sql.raw(`SELECT COUNT(*)::integer AS total FROM "${tableName}"`)
    );
    const total = (countRows as unknown as { total: number }[])[0]?.total ?? 0;
    const columns = colNames;

    res.json({ records, total, columns });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ── PATCH /superadmin/db/tables/:table/records/:id ────────────────────────────

router.patch("/superadmin/db/tables/:table/records/:id", async (req, res) => {
  const tableName = req.params["table"] ?? "";
  const recordId  = req.params["id"]    ?? "";
  if (!(await validateTable(tableName))) {
    res.status(404).json({ error: "table_not_found" }); return;
  }

  const { field, value } = req.body as { field?: string; value?: unknown };
  if (!field) { res.status(400).json({ error: "field required" }); return; }

  // Validate field exists
  const allCols = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `);
  const colNames = (allCols as unknown as { column_name: string }[]).map((c) => c.column_name);
  if (!colNames.includes(field)) {
    res.status(400).json({ error: "invalid_field" }); return;
  }

  try {
    const updated = await db.execute(
      sql.raw(`UPDATE "${tableName}" SET "${field}" = '${String(value).replace(/'/g, "''")}' WHERE id = '${recordId.replace(/'/g, "''")}' RETURNING *`)
    );
    req.log.info({ table: tableName, id: recordId, field }, "Super admin updated record");
    res.json({ record: (updated as unknown[])[0] ?? null });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ── DELETE /superadmin/db/tables/:table/records/:id ───────────────────────────

router.delete("/superadmin/db/tables/:table/records/:id", async (req, res) => {
  const tableName = req.params["table"] ?? "";
  const recordId  = req.params["id"]    ?? "";
  if (!(await validateTable(tableName))) {
    res.status(404).json({ error: "table_not_found" }); return;
  }
  try {
    const deleted = await db.execute(
      sql.raw(`DELETE FROM "${tableName}" WHERE id = '${recordId.replace(/'/g, "''")}' RETURNING *`)
    );
    req.log.warn({ table: tableName, id: recordId }, "Super admin deleted record");
    res.json({ deleted: (deleted as unknown[])[0] ?? null });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ── POST /superadmin/db/query ─────────────────────────────────────────────────

router.post("/superadmin/db/query", async (req, res) => {
  const { sql: userSql } = req.body as { sql?: string };
  if (!userSql?.trim()) {
    res.status(400).json({ error: "sql required" }); return;
  }

  const t0 = Date.now();
  try {
    const rows = await db.execute(sql.raw(userSql));
    const executionMs = Date.now() - t0;
    const rowArr = Array.isArray(rows) ? rows : [];
    req.log.info({ sqlLen: userSql.length, rowCount: rowArr.length }, "Super admin SQL query");
    res.json({
      rows: rowArr,
      rowCount: rowArr.length,
      executionMs,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg, executionMs: Date.now() - t0 });
  }
});

// ── GET /superadmin/db/export/:table ─────────────────────────────────────────

router.get("/superadmin/db/export/:table", async (req, res) => {
  const tableName = req.params["table"] ?? "";
  if (!(await validateTable(tableName))) {
    res.status(404).json({ error: "table_not_found" }); return;
  }
  const format = req.query["format"] === "csv" ? "csv" : "json";
  const limit  = Math.min(50000, parseInt(req.query["limit"] as string) || 10000);

  try {
    const rows = await db.execute(sql.raw(`SELECT * FROM "${tableName}" LIMIT ${limit}`));
    const arr = Array.isArray(rows) ? rows : [];

    if (format === "csv") {
      if (arr.length === 0) { res.setHeader("Content-Type", "text/csv").send(""); return; }
      const headers = Object.keys(arr[0] as Record<string, unknown>);
      const csv = [
        headers.join(","),
        ...arr.map((row) =>
          headers.map((h) => {
            const v = (row as Record<string, unknown>)[h];
            const s = v == null ? "" : String(v);
            return s.includes(",") || s.includes('"') || s.includes("\n")
              ? `"${s.replace(/"/g, '""')}"` : s;
          }).join(",")
        ),
      ].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${tableName}.csv"`);
      res.send(csv);
    } else {
      res.setHeader("Content-Disposition", `attachment; filename="${tableName}.json"`);
      res.json(arr);
    }
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ── GET /superadmin/db/integrity ──────────────────────────────────────────────

router.get("/superadmin/db/integrity", async (_req, res) => {
  try {
    const checks: { name: string; description: string; count: number; status: "ok" | "warning" | "error" }[] = [];

    const run = async (label: string, description: string, query: string) => {
      const r = await db.execute(sql.raw(query));
      const count = Number((r as unknown as { count: string }[])[0]?.count ?? 0);
      checks.push({ name: label, description, count, status: count === 0 ? "ok" : "warning" });
    };

    await run("Orphaned Users",       "Users referencing non-existent orgs",     `SELECT COUNT(*)::integer AS count FROM users u WHERE u.org_id NOT IN (SELECT id FROM organizations)`);
    await run("Orphaned Devices",     "Devices referencing non-existent orgs",   `SELECT COUNT(*)::integer AS count FROM devices d WHERE d.org_id NOT IN (SELECT id FROM organizations)`);
    await run("Orphaned Alerts",      "Alerts referencing non-existent orgs",    `SELECT COUNT(*)::integer AS count FROM alerts a WHERE a.org_id NOT IN (SELECT id FROM organizations)`);
    await run("Orphaned Work Orders", "Work orders referencing non-existent orgs",`SELECT COUNT(*)::integer AS count FROM work_orders wo WHERE wo.org_id NOT IN (SELECT id FROM organizations)`);
    await run("Invalid Role Refs",    "Users with role_id not in roles table",   `SELECT COUNT(*)::integer AS count FROM users u WHERE u.role_id IS NOT NULL AND u.role_id NOT IN (SELECT id FROM roles)`);
    await run("Orphaned Audit Logs",  "Audit logs referencing non-existent orgs",`SELECT COUNT(*)::integer AS count FROM audit_logs al WHERE al.org_id NOT IN (SELECT id FROM organizations)`);
    await run("Duplicate User Emails","Users with duplicate email within an org", `SELECT COUNT(*)::integer AS count FROM (SELECT email, org_id, COUNT(*) FROM users GROUP BY email, org_id HAVING COUNT(*) > 1) sub`);

    const passedAll = checks.every((c) => c.status === "ok");
    res.json({ checks, passedAll, checkedAt: new Date().toISOString() });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ── POST /superadmin/db/maintenance/vacuum ────────────────────────────────────

router.post("/superadmin/db/maintenance/vacuum", async (req, res) => {
  try {
    await db.execute(sql.raw("VACUUM ANALYZE"));
    req.log.info("Super admin ran VACUUM ANALYZE");
    res.json({ ok: true, message: "VACUUM ANALYZE completed successfully" });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ── POST /superadmin/db/maintenance/reindex ───────────────────────────────────

router.post("/superadmin/db/maintenance/reindex", async (req, res) => {
  try {
    const tables = await getPublicTables();
    req.log.info({ tableCount: tables.length }, "Super admin reindex preview");
    // Return table list as a maintenance preview (actual REINDEX is disruptive, skip for safety)
    res.json({ ok: true, tables, message: "Reindex preview — execute per-table as needed" });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// ── GET /superadmin/db/stats ──────────────────────────────────────────────────

router.get("/superadmin/db/stats", async (_req, res) => {
  try {
    const sizeRows = await db.execute(sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size, pg_database_size(current_database()) AS db_size_bytes`);
    const tableRows = await db.execute(sql`
      SELECT relname AS name, pg_size_pretty(pg_total_relation_size(relid)) AS size,
             n_live_tup AS rows, n_dead_tup AS dead_rows
      FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20
    `);
    const connRows = await db.execute(sql`SELECT count(*) AS active FROM pg_stat_activity WHERE state = 'active'`);
    const size = (sizeRows as unknown as { db_size: string; db_size_bytes: number }[])[0];
    const activeConns = (connRows as unknown as { active: number }[])[0]?.active ?? 0;
    res.json({ dbSize: size?.db_size, dbSizeBytes: size?.db_size_bytes, tables: tableRows, activeConnections: activeConns });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
