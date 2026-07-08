import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, reportsTable } from "@workspace/db";
import { ListReportsResponse, GenerateReportBody, GenerateReportResponse } from "@workspace/api-zod";
import { PLANTS } from "../lib/domain";

const router: IRouter = Router();

const SCHEDULED_REPORT_SEED = [
  { name: "Fleet Daily Generation Summary", type: "daily" as const, plantIds: PLANTS.map((p) => p.id), format: "pdf" as const },
  { name: "Weekly Performance & PR Review", type: "weekly" as const, plantIds: PLANTS.map((p) => p.id), format: "excel" as const },
  { name: "Monthly Compliance Report", type: "monthly" as const, plantIds: [PLANTS[0]!.id], format: "pdf" as const },
];

async function ensureScheduledReports() {
  const existing = await db.select().from(reportsTable).limit(1);
  if (existing.length > 0) return;
  await db.insert(reportsTable).values(
    SCHEDULED_REPORT_SEED.map((r) => ({
      id: randomUUID(),
      orgId: "org-1", // TODO(task-7): replace with req.user.orgId once auth is wired
      name: r.name,
      type: r.type,
      format: r.format,
      plantIds: r.plantIds,
      status: "scheduled",
      requestedBy: null,
      completedAt: null,
      downloadUrl: null,
    })),
  );
}

router.get("/reports", async (_req, res) => {
  await ensureScheduledReports();
  const rows = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt));
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

router.post("/reports/generate", async (req, res) => {
  const body = GenerateReportBody.parse(req.body);
  const now = new Date();
  const [created] = await db
    .insert(reportsTable)
    .values({
      id: randomUUID(),
      orgId: "org-1", // TODO(task-7): replace with req.user.orgId once auth is wired
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
