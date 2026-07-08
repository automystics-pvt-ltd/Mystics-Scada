import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, reportsTable } from "@workspace/db";
import { ListReportsResponse, GenerateReportBody, GenerateReportResponse } from "@workspace/api-zod";
import { getOrgPlants } from "../lib/domain";
import { resolveOrgId, orgCondition } from "../lib/orgScope";
import { requirePermission } from "../middleware/requirePermission";

const router: IRouter = Router();

const SCHEDULED_REPORT_SEED = [
  { name: "Fleet Daily Generation Summary", type: "daily" as const, format: "pdf" as const },
  { name: "Weekly Performance & PR Review", type: "weekly" as const, format: "excel" as const },
  { name: "Monthly Compliance Report", type: "monthly" as const, format: "pdf" as const },
];

async function ensureScheduledReports(orgId: string) {
  // Only seed if this org has no reports yet
  const existing = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.orgId, orgId))
    .limit(1);
  if (existing.length > 0) return;

  const orgPlants = getOrgPlants(orgId);
  if (orgPlants.length === 0) return;

  await db.insert(reportsTable).values(
    SCHEDULED_REPORT_SEED.map((r, i) => ({
      id: randomUUID(),
      orgId,
      name: r.name,
      type: r.type,
      format: r.format,
      // first report covers all plants, subsequent ones scope to the first plant
      plantIds: i === 0 ? orgPlants.map((p) => p.id) : [orgPlants[0]!.id],
      status: "scheduled",
      requestedBy: null,
      completedAt: null,
      downloadUrl: null,
    })),
  );
}

router.get("/reports", async (req, res) => {
  const orgId = resolveOrgId(req);
  // Only seed for concrete orgs (not super-admin "all orgs" queries)
  if (orgId) await ensureScheduledReports(orgId);

  const conditions: SQL[] = [];
  const oc = orgCondition(reportsTable.orgId, orgId);
  if (oc) conditions.push(oc);

  const rows = await db
    .select()
    .from(reportsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(reportsTable.createdAt));

  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    plantIds: r.plantIds,
    format: r.format,
    recipients: [] as string[],
    lastGeneratedAt: r.completedAt,
    status: r.status,
  }));
  res.json(ListReportsResponse.parse(data));
});

router.post("/reports/generate", requirePermission("reports.export"), async (req, res) => {
  const body = GenerateReportBody.parse(req.body);
  const now = new Date();
  const [created] = await db
    .insert(reportsTable)
    .values({
      id: randomUUID(),
      orgId: req.user!.orgId,   // always stamp the session org
      name: body.name,
      type: "custom",
      format: body.format,
      plantIds: body.plantIds,
      status: "ready",
      requestedBy: null,
      createdAt: now,
      completedAt: now,
      downloadUrl: null,
    })
    .returning();

  req.log.info({ reportId: created?.id }, "Report generated");
  res.status(201).json(
    GenerateReportResponse.parse({
      id: created!.id,
      name: created!.name,
      type: created!.type,
      plantIds: created!.plantIds,
      format: created!.format,
      recipients: [],
      lastGeneratedAt: created!.completedAt,
      status: created!.status,
    }),
  );
});

export default router;
