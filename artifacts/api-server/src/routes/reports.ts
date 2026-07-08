import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import { db, reportsTable, reportSchedulesTable } from "@workspace/db";
import { getOrgPlants } from "../lib/domain";
import { resolveOrgId, orgCondition } from "../lib/orgScope";
import { requirePermission } from "../middleware/requirePermission";
import { auditLog } from "../lib/auditLog";
import {
  REPORT_TYPE_CATALOG,
  generateReportData,
  toCsv,
  toPdf,
} from "../lib/reportGenerators";

const router: IRouter = Router();

// ── Types ──────────────────────────────────────────────────────────────────────

const FORMATS = ["pdf", "csv"] as const;
type Format = (typeof FORMATS)[number];

const GenerateBody = z.object({
  reportType: z.string().min(1),
  plantIds: z.array(z.string()).min(1),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  format: z.enum(FORMATS),
});

const ScheduleBody = z.object({
  reportType: z.string().min(1),
  plantIds: z.array(z.string()).min(1),
  format: z.enum(FORMATS),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  timeUtc: z.string().regex(/^\d{2}:\d{2}$/).optional().default("08:00"),
  recipients: z.array(z.string().email()).optional().default([]),
});

// ── GET /reports/types ────────────────────────────────────────────────────────

router.get("/reports/types", (req, res) => {
  res.json(REPORT_TYPE_CATALOG);
});

// ── GET /reports ──────────────────────────────────────────────────────────────

router.get("/reports", requirePermission("reports.view"), async (req, res) => {
  const orgId = resolveOrgId(req);

  const conditions: SQL[] = [];
  const oc = orgCondition(reportsTable.orgId, orgId);
  if (oc) conditions.push(oc);

  const rows = await db
    .select()
    .from(reportsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(reportsTable.createdAt))
    .limit(200);

  res.json(
    rows.map((r) => ({
      id: r.id,
      reportType: r.reportType,
      name: r.name,
      format: r.format,
      plantIds: r.plantIds,
      dateFrom: r.dateFrom,
      dateTo: r.dateTo,
      status: r.status,
      requestedBy: r.requestedBy,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    })),
  );
});

// ── POST /org/reports/generate ───────────────────────────────────────────────
// Mounted under /org/ so requireOrgScopeForWrites exempts it for super-admin users.

router.post("/org/reports/generate", requirePermission("reports.export"), async (req, res) => {
  // Under /org/** — always scoped to the caller's own org, consistent with
  // all other /org/** routes. resolveOrgId is not used here.
  const orgId = req.user!.orgId;
  if (!orgId) {
    res.status(400).json({ error: "org_required", message: "Your account is not associated with an organisation" });
    return;
  }

  const body = GenerateBody.parse(req.body);
  const { reportType, plantIds, dateFrom, dateTo, format } = body;

  // Validate plants belong to this org
  const orgPlants = getOrgPlants(orgId);
  const validPlantIds = orgPlants.map((p) => p.id);
  const invalidIds = plantIds.filter((id) => !validPlantIds.includes(id));
  if (invalidIds.length > 0) {
    res.status(400).json({ error: "invalid_plants", message: `Unknown plant IDs: ${invalidIds.join(", ")}` });
    return;
  }

  const catalogEntry = REPORT_TYPE_CATALOG.find((t) => t.id === reportType);
  const reportName = catalogEntry?.name ?? reportType;

  const now = new Date();
  const [created] = await db
    .insert(reportsTable)
    .values({
      id: randomUUID(),
      orgId,
      name: reportName,
      type: "custom",
      format,
      plantIds,
      status: "ready",
      reportType,
      dateFrom,
      dateTo,
      requestedBy: req.user!.id,
      createdAt: now,
      completedAt: now,
      downloadUrl: null,
    })
    .returning();

  auditLog(req, "report.generate", "report", created!.id, { reportType, format, plantIds: plantIds.length });
  req.log.info({ reportId: created!.id, reportType }, "Report generated");

  res.status(201).json({
    id: created!.id,
    reportType: created!.reportType,
    name: created!.name,
    format: created!.format,
    plantIds: created!.plantIds,
    dateFrom: created!.dateFrom,
    dateTo: created!.dateTo,
    status: created!.status,
    createdAt: created!.createdAt,
    completedAt: created!.completedAt,
  });
});

// ── GET /reports/:id/download ─────────────────────────────────────────────────

router.get("/reports/:id/download", requirePermission("reports.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const reportId = (req.params["id"] as string) ?? "";

  const conditions: SQL[] = [eq(reportsTable.id, reportId)];
  const oc = orgCondition(reportsTable.orgId, orgId);
  if (oc) conditions.push(oc);

  const [report] = await db
    .select()
    .from(reportsTable)
    .where(and(...conditions))
    .limit(1);

  if (!report) {
    res.status(404).json({ error: "not_found", message: "Report not found" });
    return;
  }

  if (report.status !== "ready" || !report.reportType || !report.dateFrom || !report.dateTo) {
    res.status(400).json({ error: "not_ready", message: "Report is not yet generated or lacks generation parameters" });
    return;
  }

  // Look up org info for PDF branding
  const orgName = (() => {
    const orgs: Record<string, string> = { "org-1": "Automystics Technologies" };
    return orgs[report.orgId] ?? report.orgId;
  })();

  const orgPlants = getOrgPlants(report.orgId);
  const plants = orgPlants.filter((p) => report.plantIds.includes(p.id));
  if (plants.length === 0) {
    // Fall back to all org plants
    plants.push(...orgPlants);
  }

  const data = generateReportData(report.reportType, plants, report.dateFrom, report.dateTo);
  const safeName = report.reportType.replace(/_/g, "-");
  const dateStr = new Date().toISOString().slice(0, 10);

  const format = (report.format as Format) ?? "csv";

  if (format === "pdf") {
    const buffer = await toPdf(data, orgName);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-${dateStr}.pdf"`);
    res.send(buffer);
    return;
  }

  // CSV (default)
  const csv = toCsv(data);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-${dateStr}.csv"`);
  res.send(csv);
});

// ── GET /reports/plants ───────────────────────────────────────────────────────
// Lightweight plant list for the generate-report modal

router.get("/reports/plants", requirePermission("reports.view"), (req, res) => {
  const orgId = resolveOrgId(req);
  const plants = getOrgPlants(orgId).map((p) => ({
    id: p.id,
    name: p.name,
    location: p.location,
    capacityMw: p.capacityMw,
  }));
  res.json(plants);
});

// ── GET /org/report-schedules ─────────────────────────────────────────────────

router.get("/org/report-schedules", requirePermission("reports.view"), async (req, res) => {
  const orgId = req.user!.orgId;
  const rows = await db
    .select()
    .from(reportSchedulesTable)
    .where(eq(reportSchedulesTable.orgId, orgId))
    .orderBy(desc(reportSchedulesTable.createdAt));

  res.json(rows.map((r) => ({
    id: r.id,
    reportType: r.reportType,
    reportName: REPORT_TYPE_CATALOG.find((t) => t.id === r.reportType)?.name ?? r.reportType,
    plantIds: r.plantIds,
    format: r.format,
    frequency: r.frequency,
    dayOfWeek: r.dayOfWeek,
    timeUtc: r.timeUtc,
    recipients: r.recipients,
    createdAt: r.createdAt,
  })));
});

// ── POST /org/report-schedules ────────────────────────────────────────────────

router.post("/org/report-schedules", requirePermission("reports.schedule"), async (req, res) => {
  const orgId = req.user!.orgId;
  const body = ScheduleBody.parse(req.body);

  // Validate plants
  const orgPlants = getOrgPlants(orgId);
  const validPlantIds = orgPlants.map((p) => p.id);
  const invalidIds = body.plantIds.filter((id) => !validPlantIds.includes(id));
  if (invalidIds.length > 0) {
    res.status(400).json({ error: "invalid_plants", message: `Unknown plant IDs: ${invalidIds.join(", ")}` });
    return;
  }

  const now = new Date();
  let created;
  try {
    const rows = await db
      .insert(reportSchedulesTable)
      .values({
        id: randomUUID(),
        orgId,
        reportType: body.reportType,
        plantIds: body.plantIds,
        format: body.format,
        frequency: body.frequency,
        dayOfWeek: body.dayOfWeek ?? null,
        timeUtc: body.timeUtc,
        recipients: body.recipients,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    created = rows[0];
  } catch (e: unknown) {
    // Drizzle wraps the underlying pg error; check the entire error chain for
    // the unique-violation code (23505) or the constraint name.
    const serialised = String(JSON.stringify(e)) + String((e as Error).message ?? "") +
      String(((e as Error & { cause?: Error }).cause as Error)?.message ?? "");
    if (serialised.includes("23505") || serialised.includes("report_schedules_org_type_freq_uq") || serialised.includes("unique")) {
      res.status(409).json({
        error: "duplicate_schedule",
        message: `A ${body.frequency} schedule for ${body.reportType} already exists for this org`,
      });
      return;
    }
    throw e;
  }

  auditLog(req, "report_schedule.create", "report_schedule", created!.id, { reportType: body.reportType, frequency: body.frequency });
  req.log.info({ scheduleId: created!.id }, "Report schedule created");
  res.status(201).json(created);
});

// ── DELETE /org/report-schedules/:id ─────────────────────────────────────────

router.delete("/org/report-schedules/:id", requirePermission("reports.schedule"), async (req, res) => {
  const orgId = req.user!.orgId;
  const scheduleId = (req.params["id"] as string) ?? "";

  const [existing] = await db
    .select()
    .from(reportSchedulesTable)
    .where(and(eq(reportSchedulesTable.id, scheduleId), eq(reportSchedulesTable.orgId, orgId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "not_found", message: "Schedule not found" });
    return;
  }

  await db.delete(reportSchedulesTable).where(eq(reportSchedulesTable.id, scheduleId));
  auditLog(req, "report_schedule.delete", "report_schedule", scheduleId, { reportType: existing.reportType });
  res.json({ ok: true, id: scheduleId });
});

export default router;
