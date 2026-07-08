import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, alertsTable, alertHistoryTable } from "@workspace/db";
import { ListAlertsQueryParams, ListAlertsResponse, GetAlertResponse, UpdateAlertBody, UpdateAlertResponse, ListAlertHistoryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/alerts", async (req, res) => {
  const query = ListAlertsQueryParams.parse(req.query);
  const conditions = [];
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
  const [row] = await db.select().from(alertsTable).where(eq(alertsTable.id, req.params["alertId"] ?? ""));
  if (!row) {
    res.status(404).json({ error: "not_found", message: "Alert not found" });
    return;
  }
  res.json(GetAlertResponse.parse(row));
});

router.patch("/alerts/:alertId", async (req, res) => {
  const alertId = req.params["alertId"] ?? "";
  const [existing] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
  if (!existing) {
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

  req.log.info({ alertId, updates: body }, "Alert updated");
  res.json(UpdateAlertResponse.parse(updated));
});

router.get("/alerts/:alertId/history", async (req, res) => {
  const alertId = req.params["alertId"] ?? "";
  const [alert] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
  if (!alert) {
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
