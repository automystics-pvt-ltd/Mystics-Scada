import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, alertsTable, alertHistoryTable } from "@workspace/db";
import { ListAlertsQueryParams, ListAlertsResponse, GetAlertResponse, UpdateAlertBody, UpdateAlertResponse, ListAlertHistoryResponse } from "@workspace/api-zod";
import { resolveOrgId, orgCondition } from "../lib/orgScope";
import { requirePermission } from "../middleware/requirePermission";
import { createNotification } from "../lib/createNotification";

const router: IRouter = Router();

router.get("/alerts", async (req, res) => {
  const orgId = resolveOrgId(req);
  const query = ListAlertsQueryParams.parse(req.query);

  const conditions: SQL[] = [];
  const oc = orgCondition(alertsTable.orgId, orgId);
  if (oc) conditions.push(oc);
  if (query.plantId) conditions.push(eq(alertsTable.plantId, query.plantId));
  if (query.severity) conditions.push(eq(alertsTable.severity, query.severity));
  if (query.status) conditions.push(eq(alertsTable.status, query.status));

  const rows = await db
    .select()
    .from(alertsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(alertsTable.createdAt));

  const data = ListAlertsResponse.parse(rows);
  res.json(data);
});

router.get("/alerts/:alertId", async (req, res) => {
  const orgId = resolveOrgId(req);
  const [row] = await db.select().from(alertsTable).where(eq(alertsTable.id, (req.params["alertId"] as string) ?? ""));
  // Return 404 (not 403) on org mismatch to avoid leaking existence
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Alert not found" });
    return;
  }
  res.json(GetAlertResponse.parse(row));
});

router.patch("/alerts/:alertId", requirePermission("alarm.acknowledge"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const alertId = String(req.params["alertId"] ?? "");
  const [existing] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
  // Return 404 on org mismatch to avoid leaking existence
  if (!existing || (orgId !== null && existing.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Alert not found" });
    return;
  }

  const body = UpdateAlertBody.parse(req.body);
  if (!body.status && body.assignedTo === undefined && !body.comment) {
    res.status(400).json({ error: "invalid_request", message: "At least one of status, assignedTo, or comment must be provided" });
    return;
  }

  const now = new Date();
  const updates: Partial<typeof alertsTable.$inferInsert> = {};
  if (body.status) {
    updates.status = body.status;
    if (body.status === "acknowledged" && !existing.acknowledgedAt) updates.acknowledgedAt = now;
    if ((body.status === "resolved" || body.status === "closed") && !existing.resolvedAt) updates.resolvedAt = now;
  }
  if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;

  const updated =
    Object.keys(updates).length > 0
      ? (await db.update(alertsTable).set(updates).where(eq(alertsTable.id, alertId)).returning())[0]
      : existing;

  const historyEntries: (typeof alertHistoryTable.$inferInsert)[] = [];
  if (body.status) {
    historyEntries.push({
      id: randomUUID(),
      orgId: existing.orgId,
      alertId,
      timestamp: now,
      actor: body.assignedTo ?? "Control Room Operator",
      action: `Status changed to ${body.status}`,
      note: null,
      sortOrder: now.getTime().toString(),
    });
  }
  if (body.assignedTo && !body.status) {
    historyEntries.push({
      id: randomUUID(),
      orgId: existing.orgId,
      alertId,
      timestamp: now,
      actor: "Control Room Operator",
      action: `Assigned to ${body.assignedTo}`,
      note: null,
      sortOrder: now.getTime().toString(),
    });
  }
  if (body.comment) {
    historyEntries.push({
      id: randomUUID(),
      orgId: existing.orgId,
      alertId,
      timestamp: now,
      actor: "Control Room Operator",
      action: "Comment added",
      note: body.comment,
      sortOrder: (now.getTime() + 1).toString(),
    });
  }
  if (historyEntries.length > 0) {
    await db.insert(alertHistoryTable).values(historyEntries);
  }

  // Fire in-app notification on status transitions that operators care about
  if (body.status === "acknowledged" || body.status === "resolved") {
    const notifType = body.status === "acknowledged" ? "alarm.acknowledged" : "alarm.resolved";
    createNotification({
      orgId: existing.orgId,
      type: notifType,
      title: body.status === "acknowledged"
        ? `Alert Acknowledged: ${existing.title}`
        : `Alert Resolved: ${existing.title}`,
      message: `${existing.plantName} — ${existing.deviceName}: ${existing.message}`,
      resourceType: "alert",
      resourceId: alertId,
      resourceUrl: `/alerts`,
    });
  }

  req.log.info({ alertId, updates: body }, "Alert updated");
  res.json(UpdateAlertResponse.parse(updated));
});

router.get("/alerts/:alertId/history", async (req, res) => {
  const orgId = resolveOrgId(req);
  const alertId = (req.params["alertId"] as string) ?? "";
  const [alert] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
  if (!alert || (orgId !== null && alert.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Alert not found" });
    return;
  }

  const rows = await db
    .select()
    .from(alertHistoryTable)
    .where(eq(alertHistoryTable.alertId, alertId))
    .orderBy(alertHistoryTable.sortOrder);
  res.json(ListAlertHistoryResponse.parse(rows));
});

export default router;
