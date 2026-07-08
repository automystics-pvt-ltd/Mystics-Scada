import { Router } from "express";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, usersTable, workOrdersTable } from "@workspace/db";
import { generateInsights, insightsSummary } from "../lib/insightsEngine";
import { getOrgPlants } from "../lib/simulation";
import { resolveOrgId } from "../lib/orgScope";
import { requirePermission } from "../middleware/requirePermission";
import type { UserPreferences } from "../lib/userPreferences";

const router = Router();

// ── GET /insights ─────────────────────────────────────────────────────────────
// Returns the AI-generated insight feed, filtered by dismissed IDs for the
// current user. Accepts optional ?plantId= query param.

router.get("/insights", async (req, res) => {
  const orgId = resolveOrgId(req);
  const plantId = typeof req.query["plantId"] === "string" ? req.query["plantId"] : undefined;
  const now = new Date();

  const [userRow] = await db
    .select({ userPreferences: usersTable.userPreferences })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id))
    .limit(1);

  const prefs = (userRow?.userPreferences ?? {}) as UserPreferences;
  const dismissed = new Set(prefs.dismissedInsights ?? []);

  const insights = generateInsights(orgId, now, plantId).filter(i => !dismissed.has(i.id));
  res.json(insights);
});

// ── GET /insights/summary ─────────────────────────────────────────────────────
// Lightweight severity counts for the portfolio widget.

router.get("/insights/summary", async (req, res) => {
  const orgId = resolveOrgId(req);
  const now = new Date();
  const summary = insightsSummary(orgId, now);
  res.json(summary);
});

// ── POST /org/insights/:id/dismiss ────────────────────────────────────────────
// Stores a dismissal in the current user's preferences.

router.post("/org/insights/:id/dismiss", async (req, res) => {
  const insightId = req.params["id"];
  if (!insightId) { res.status(400).json({ error: "missing_id" }); return; }

  const [userRow] = await db
    .select({ userPreferences: usersTable.userPreferences })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id))
    .limit(1);

  const prefs = (userRow?.userPreferences ?? {}) as UserPreferences;
  const dismissed = [...new Set([...(prefs.dismissedInsights ?? []), insightId])];

  await db
    .update(usersTable)
    .set({ userPreferences: { ...prefs, dismissedInsights: dismissed } })
    .where(eq(usersTable.id, req.user!.id));

  res.json({ ok: true, dismissedCount: dismissed.length });
});

// ── DELETE /org/insights/:id/dismiss ─────────────────────────────────────────
// Restores a previously dismissed insight.

router.delete("/org/insights/:id/dismiss", async (req, res) => {
  const insightId = req.params["id"];
  if (!insightId) { res.status(400).json({ error: "missing_id" }); return; }

  const [userRow] = await db
    .select({ userPreferences: usersTable.userPreferences })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id))
    .limit(1);

  const prefs = (userRow?.userPreferences ?? {}) as UserPreferences;
  const dismissed = (prefs.dismissedInsights ?? []).filter(id => id !== insightId);

  await db
    .update(usersTable)
    .set({ userPreferences: { ...prefs, dismissedInsights: dismissed } })
    .where(eq(usersTable.id, req.user!.id));

  res.json({ ok: true });
});

// ── POST /org/insights/:id/work-order ────────────────────────────────────────
// Creates a work order pre-filled from the insight's context.

const WorkOrderBody = z.object({
  plantId: z.string(),
  plantName: z.string(),
  deviceName: z.string().optional(),
  title: z.string(),
  explanation: z.string(),
  recommendedAction: z.string(),
  severity: z.enum(["critical", "warning", "info"]),
});

router.post(
  "/org/insights/:id/work-order",
  requirePermission("maintenance.manage"),
  async (req, res) => {
    const orgId = req.user!.orgId;
    if (!orgId) { res.status(400).json({ error: "org_required" }); return; }

    const body = WorkOrderBody.parse(req.body);

    // Validate plantId belongs to the caller's org — derive canonical plant name
    // server-side rather than trusting the client-supplied text.
    const orgPlants = getOrgPlants(orgId);
    const plant = orgPlants.find(p => p.id === body.plantId);
    if (!plant) {
      res.status(404).json({ error: "plant_not_found", message: "Plant not found in your organisation" });
      return;
    }

    const equipment = body.deviceName ?? plant.name;
    const priorityMap = { critical: "high", warning: "medium", info: "low" } as const;

    const [created] = await db.insert(workOrdersTable).values({
      id: randomUUID(),
      orgId,
      plantId: plant.id,
      plantName: plant.name, // canonical server-side name
      equipment,
      faultDescription: `[AI Insight] ${body.title}\n\n${body.explanation}\n\nRecommended Action: ${body.recommendedAction}`,
      priority: priorityMap[body.severity],
      status: "open",
    }).returning();

    res.status(201).json(created);
  },
);

export default router;
