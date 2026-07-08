/**
 * In-app notification API
 *
 * GET  /notifications              — paginated list for the caller's org (unread first)
 * GET  /notifications/unread-count — { count: N } for bell badge
 * PATCH /notifications/:id/read   — mark one notification read
 * POST  /notifications/read-all   — mark all org notifications read
 */

import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { resolveOrgId } from "../lib/orgScope";

const router: IRouter = Router();

/* ── GET /notifications ──────────────────────────────────────────────── */

router.get("/notifications", async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) {
    res.status(400).json({ error: "org_required", message: "Org context required" });
    return;
  }

  const pageNum = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
  const limitNum = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "50"))));
  const unreadOnly = req.query["unreadOnly"] === "true";

  const conditions = [eq(notificationsTable.orgId, orgId)];
  if (unreadOnly) conditions.push(eq(notificationsTable.isRead, false));

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(and(...conditions))
    // Unread first, then newest
    .orderBy(notificationsTable.isRead, desc(notificationsTable.createdAt))
    .limit(limitNum)
    .offset((pageNum - 1) * limitNum);

  res.json({
    data: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      resourceUrl: r.resourceUrl,
      isRead: r.isRead,
      createdAt: r.createdAt,
    })),
    page: pageNum,
    limit: limitNum,
    hasMore: rows.length === limitNum,
  });
});

/* ── GET /notifications/unread-count ────────────────────────────────── */

router.get("/notifications/unread-count", async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) {
    res.json({ count: 0 });
    return;
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.orgId, orgId), eq(notificationsTable.isRead, false)));

  res.json({ count: result?.count ?? 0 });
});

/* ── PATCH /notifications/:id/read ──────────────────────────────────── */

router.patch("/notifications/:id/read", async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) {
    res.status(400).json({ error: "org_required" });
    return;
  }

  const id = String(req.params["id"] ?? "");
  const [existing] = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.id, id));

  if (!existing || existing.orgId !== orgId) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, id));

  res.json({ ok: true, id });
});

/* ── POST /notifications/read-all ───────────────────────────────────── */

router.post("/notifications/read-all", async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) {
    res.status(400).json({ error: "org_required" });
    return;
  }

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.orgId, orgId), eq(notificationsTable.isRead, false)));

  res.json({ ok: true });
});

export default router;
