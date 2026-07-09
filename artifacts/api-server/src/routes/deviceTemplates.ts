/**
 * Device Template CRUD API
 *
 * GET  /device-templates          — list all (system + org-private)
 * GET  /device-templates/library  — system templates only
 * GET  /device-templates/:id      — single template
 * POST /device-templates          — create org-private template
 * PATCH /device-templates/:id     — update org-private template
 * DELETE /device-templates/:id    — delete org-private template
 * POST /device-templates/:id/clone — clone system template into org
 */

import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq, or, isNull, and } from "drizzle-orm";
import { z } from "zod/v4";
import { db, deviceTemplatesTable } from "@workspace/db";
import { resolveOrgId } from "../lib/orgScope.js";
import { requirePermission } from "../middleware/requirePermission.js";

const router: IRouter = Router();

const FieldDefSchema = z.object({
  key:          z.string().min(1).max(80),
  label:        z.string().min(1).max(120),
  unit:         z.string().max(20).default(""),
  address:      z.number().int().min(0).max(65535).optional(),
  length:       z.number().int().min(1).max(2).optional(),
  dataType:     z.enum(["INT16", "UINT16", "INT32", "UINT32", "FLOAT32"]).optional(),
  multiplier:   z.number().optional(),
  offset:       z.number().optional(),
  jsonPath:     z.string().max(200).optional(),
  alarmHigh:    z.number().optional(),
  alarmLow:     z.number().optional(),
  readWrite:    z.boolean().optional(),
});

const CreateTemplateBody = z.object({
  manufacturer:       z.string().min(1).max(120),
  model:              z.string().min(1).max(120),
  protocol:           z.enum(["modbus_tcp", "modbus_rtu", "mqtt", "http", "websocket"]),
  fieldMap:           z.array(FieldDefSchema).default([]),
  defaultPollIntervalS: z.number().int().min(5).max(3600).default(30),
  firmwareVersionParam: z.string().max(80).optional(),
});

const UpdateTemplateBody = CreateTemplateBody.partial();

// ── GET /device-templates ─────────────────────────────────────────────────────

router.get("/device-templates", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);

  // Return system templates (org_id IS NULL) + org-private templates
  const rows = await db
    .select()
    .from(deviceTemplatesTable)
    .where(
      or(
        isNull(deviceTemplatesTable.orgId),
        orgId ? eq(deviceTemplatesTable.orgId, orgId) : isNull(deviceTemplatesTable.orgId),
      ),
    )
    .orderBy(deviceTemplatesTable.manufacturer, deviceTemplatesTable.model);

  res.json(rows);
});

// ── GET /device-templates/library ─────────────────────────────────────────────

router.get("/device-templates/library", requirePermission("device.view"), async (_req, res) => {
  const rows = await db
    .select()
    .from(deviceTemplatesTable)
    .where(isNull(deviceTemplatesTable.orgId))
    .orderBy(deviceTemplatesTable.manufacturer, deviceTemplatesTable.model);
  res.json(rows);
});

// ── GET /device-templates/:id ─────────────────────────────────────────────────

router.get("/device-templates/:id", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const id = (req.params["id"] as string) ?? "";
  const [row] = await db
    .select()
    .from(deviceTemplatesTable)
    .where(eq(deviceTemplatesTable.id, id));

  if (!row) { res.status(404).json({ error: "not_found" }); return; }
  // Org-private templates only visible to their org
  if (row.orgId && orgId !== null && row.orgId !== orgId) {
    res.status(404).json({ error: "not_found" }); return;
  }
  res.json(row);
});

// ── POST /device-templates ────────────────────────────────────────────────────

router.post("/device-templates", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) {
    res.status(400).json({ error: "org_required", message: "Impersonate a specific org first" });
    return;
  }
  const body = CreateTemplateBody.parse(req.body);
  const now = new Date();
  const [created] = await db.insert(deviceTemplatesTable).values({
    id: randomUUID(),
    orgId,
    ...body,
    createdAt: now,
    updatedAt: now,
  }).returning();
  res.status(201).json(created);
});

// ── PATCH /device-templates/:id ───────────────────────────────────────────────

router.patch("/device-templates/:id", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const id = (req.params["id"] as string) ?? "";
  const [existing] = await db.select().from(deviceTemplatesTable).where(eq(deviceTemplatesTable.id, id));
  if (!existing) { res.status(404).json({ error: "not_found" }); return; }
  if (!existing.orgId || (orgId !== null && existing.orgId !== orgId)) {
    res.status(403).json({ error: "forbidden", message: "System templates are read-only" });
    return;
  }
  const body = UpdateTemplateBody.parse(req.body);
  const [updated] = await db
    .update(deviceTemplatesTable)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(deviceTemplatesTable.id, id))
    .returning();
  res.json(updated);
});

// ── DELETE /device-templates/:id ──────────────────────────────────────────────

router.delete("/device-templates/:id", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const id = (req.params["id"] as string) ?? "";
  const [existing] = await db.select().from(deviceTemplatesTable).where(eq(deviceTemplatesTable.id, id));
  if (!existing) { res.status(404).json({ error: "not_found" }); return; }
  if (!existing.orgId || (orgId !== null && existing.orgId !== orgId)) {
    res.status(403).json({ error: "forbidden", message: "System templates cannot be deleted" });
    return;
  }
  await db.delete(deviceTemplatesTable).where(eq(deviceTemplatesTable.id, id));
  res.json({ ok: true });
});

// ── POST /device-templates/:id/clone ─────────────────────────────────────────

router.post("/device-templates/:id/clone", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) {
    res.status(400).json({ error: "org_required", message: "Impersonate a specific org first" });
    return;
  }
  const id = (req.params["id"] as string) ?? "";
  const [src] = await db.select().from(deviceTemplatesTable).where(eq(deviceTemplatesTable.id, id));
  if (!src) { res.status(404).json({ error: "not_found" }); return; }

  const now = new Date();
  const [clone] = await db.insert(deviceTemplatesTable).values({
    id: randomUUID(),
    orgId,
    manufacturer: src.manufacturer,
    model: `${src.model} (Custom)`,
    protocol: src.protocol,
    fieldMap: src.fieldMap,
    defaultPollIntervalS: src.defaultPollIntervalS,
    firmwareVersionParam: src.firmwareVersionParam,
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).returning();
  res.status(201).json(clone);
});

export default router;
