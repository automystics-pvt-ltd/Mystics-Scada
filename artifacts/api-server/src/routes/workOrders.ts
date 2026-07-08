import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, workOrdersTable } from "@workspace/db";
import {
  ListWorkOrdersQueryParams,
  ListWorkOrdersResponse,
  CreateWorkOrderBody,
  CreateWorkOrderResponse,
  GetWorkOrderResponse,
  UpdateWorkOrderBody,
  UpdateWorkOrderResponse,
} from "@workspace/api-zod";
import { getOrgPlants } from "../lib/domain";
import { resolveOrgId, orgCondition } from "../lib/orgScope";

const router: IRouter = Router();

function toWorkOrderResponse(row: typeof workOrdersTable.$inferSelect) {
  return {
    id: row.id,
    plantId: row.plantId,
    plantName: row.plantName,
    equipment: row.equipment,
    faultDescription: row.faultDescription,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assignedTo,
    createdAt: row.createdAt,
    dueDate: row.dueAt,
    slaBreached: row.slaBreached,
    rootCause: row.rootCause,
    resolutionNotes: row.resolutionNotes,
    sourceAlertId: row.sourceAlertId,
  };
}

router.get("/work-orders", async (req, res) => {
  const orgId = resolveOrgId(req);
  const query = ListWorkOrdersQueryParams.parse(req.query);

  const conditions: SQL[] = [];
  const oc = orgCondition(workOrdersTable.orgId, orgId);
  if (oc) conditions.push(oc);
  if (query.plantId) conditions.push(eq(workOrdersTable.plantId, query.plantId));
  if (query.status) conditions.push(eq(workOrdersTable.status, query.status));

  const rows = await db
    .select()
    .from(workOrdersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(workOrdersTable.createdAt));

  res.json(ListWorkOrdersResponse.parse(rows.map(toWorkOrderResponse)));
});

router.post("/work-orders", async (req, res) => {
  const orgId = resolveOrgId(req);
  const body = CreateWorkOrderBody.parse(req.body);

  // Verify the plant exists and belongs to the caller's org
  const plant = getOrgPlants(orgId).find((p) => p.id === body.plantId);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }

  const now = new Date();
  const [created] = await db
    .insert(workOrdersTable)
    .values({
      id: randomUUID(),
      orgId: req.user!.orgId,   // always stamp the actual session org (no override)
      plantId: plant.id,
      plantName: plant.name,
      equipment: body.equipment,
      faultDescription: body.faultDescription,
      priority: body.priority,
      status: "open",
      assignedTo: body.assignedTo ?? null,
      dueAt: body.dueDate ?? null,
      slaBreached: false,
      rootCause: null,
      resolutionNotes: null,
      sourceAlertId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  req.log.info({ workOrderId: created?.id }, "Work order created");
  res.status(201).json(CreateWorkOrderResponse.parse(toWorkOrderResponse(created!)));
});

router.get("/work-orders/:workOrderId", async (req, res) => {
  const orgId = resolveOrgId(req);
  const [row] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, req.params["workOrderId"] ?? ""));
  // Return 404 on org mismatch to avoid leaking existence
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Work order not found" });
    return;
  }
  res.json(GetWorkOrderResponse.parse(toWorkOrderResponse(row)));
});

router.patch("/work-orders/:workOrderId", async (req, res) => {
  const orgId = resolveOrgId(req);
  const workOrderId = req.params["workOrderId"] ?? "";
  const [existing] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, workOrderId));
  // Return 404 on org mismatch to avoid leaking existence
  if (!existing || (orgId !== null && existing.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Work order not found" });
    return;
  }

  const body = UpdateWorkOrderBody.parse(req.body);
  if (
    !body.status &&
    body.assignedTo === undefined &&
    !body.priority &&
    body.rootCause === undefined &&
    body.resolutionNotes === undefined
  ) {
    res.status(400).json({ error: "invalid_request", message: "At least one updatable field must be provided" });
    return;
  }

  const now = new Date();
  const updates: Partial<typeof workOrdersTable.$inferInsert> = { updatedAt: now };
  if (body.status) {
    updates.status = body.status;
    if (body.status === "closed") updates.closedAt = now;
  }
  if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
  if (body.priority) updates.priority = body.priority;
  if (body.rootCause !== undefined) updates.rootCause = body.rootCause;
  if (body.resolutionNotes !== undefined) updates.resolutionNotes = body.resolutionNotes;

  const [updated] = await db.update(workOrdersTable).set(updates).where(eq(workOrdersTable.id, workOrderId)).returning();
  req.log.info({ workOrderId, updates: body }, "Work order updated");
  res.json(UpdateWorkOrderResponse.parse(toWorkOrderResponse(updated!)));
});

export default router;
