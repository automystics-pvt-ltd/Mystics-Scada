import { Router, type IRouter } from "express";
import {
  ListPlantsResponse,
  GetPlantResponse,
  GetPlantSldResponse,
  ListInvertersResponse,
  ListWeatherStationsResponse,
  GetPlantYieldResponse,
  GetPlantYieldQueryParams,
  GetPlantPerformanceResponse,
  GetPlantRevenueResponse,
} from "@workspace/api-zod";
import {
  getOrgPlants,
  plantSummary,
  plantDetail,
  sldFor,
  inverterSummary,
  weatherStationsFor,
  yieldSeries,
  performanceData,
  revenueData,
} from "../lib/domain";
import { combinerStrings } from "../lib/combinerStrings";
import { calcCombinerCount } from "../lib/combinerUtils";
import { activeAlertCountsByPlant } from "../lib/alertCounts";
import { resolveOrgId, orgCondition } from "../lib/orgScope";
import { db, devicesTable, plantsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { deviceStatus, addPlant } from "../lib/simulation";

const router: IRouter = Router();

// ── POST /plants — create a new plant (wizard) ──────────────────────────────
router.post("/plants", async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) {
    res.status(403).json({ error: "forbidden", message: "No organisation in session." });
    return;
  }

  const body = req.body as {
    name?: unknown; location?: unknown; capacityMw?: unknown;
    trackerType?: unknown; timezoneOffsetHours?: unknown; commissionedYear?: unknown;
  };

  if (typeof body.name !== "string" || !body.name.trim()) {
    res.status(400).json({ error: "invalid_body", message: "Plant name is required." });
    return;
  }

  const capacityMw          = Number(body.capacityMw)          || 10;
  const timezoneOffsetHours = Number(body.timezoneOffsetHours) || 5.5;
  const commissionedYear    = Number(body.commissionedYear)     || new Date().getFullYear();
  const trackerType         = (typeof body.trackerType === "string" && body.trackerType) ? body.trackerType : "fixed_tilt";
  const location            = typeof body.location === "string" ? body.location.trim() : "";

  // Derive inverter count and rating from capacity
  const inverterCount   = Math.max(1, Math.round(capacityMw * 0.4));
  const inverterRatingKw = Math.round((capacityMw * 1000) / inverterCount);

  // First add to in-memory simulation (gets a stable ID)
  const plant = addPlant(orgId, {
    name: body.name.trim(),
    location,
    capacityMw,
    trackerType: trackerType as "fixed_tilt" | "single_axis_tracker",
    timezoneOffsetHours,
    commissionedYear,
    inverterCount,
    inverterRatingKw,
    stringsPerInverter: 12,
    weatherStationCount: Math.max(1, Math.round(capacityMw / 20)),
    cloudinessSeed: 0.2,
  });

  // Persist to DB so it survives restarts
  await db.insert(plantsTable).values({
    id: plant.id,
    orgId,
    name: plant.name,
    location: plant.location,
    capacityMw: plant.capacityMw,
    timezoneOffsetHours: plant.timezoneOffsetHours,
    trackerType: plant.trackerType,
    commissionedYear: plant.commissionedYear,
    inverterCount: plant.inverterCount,
    inverterRatingKw: plant.inverterRatingKw,
    stringsPerInverter: plant.stringsPerInverter,
    weatherStationCount: plant.weatherStationCount,
    cloudinessSeed: plant.cloudinessSeed,
  }).onConflictDoNothing();

  res.status(201).json({ id: plant.id, name: plant.name, location: plant.location });
});

router.get("/plants", async (req, res) => {
  const orgId = resolveOrgId(req);
  const now = new Date();
  const alertCounts = await activeAlertCountsByPlant(orgId);
  const plants = getOrgPlants(orgId);
  const data = ListPlantsResponse.parse(plants.map((plant) => plantSummary(plant, now, alertCounts)));
  res.json(data);
});

router.get("/plants/:plantId", async (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const now = new Date();
  const alertCounts = await activeAlertCountsByPlant(orgId);
  const data = GetPlantResponse.parse(plantDetail(plant, now, alertCounts));
  res.json(data);
});

router.get("/plants/:plantId/sld", (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const data = GetPlantSldResponse.parse(sldFor(plant, new Date()));
  res.json(data);
});

router.get("/plants/:plantId/inverters", (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const now = new Date();
  const inverters = Array.from({ length: plant.inverterCount }, (_, i) => inverterSummary(plant, i, now));
  const data = ListInvertersResponse.parse(inverters);
  res.json(data);
});

router.get("/plants/:plantId/weather-stations", (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const data = ListWeatherStationsResponse.parse(weatherStationsFor(plant, new Date()));
  res.json(data);
});

router.get("/plants/:plantId/yield", (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const { period } = GetPlantYieldQueryParams.parse(req.query);
  const data = GetPlantYieldResponse.parse(yieldSeries(plant, period, new Date()));
  res.json(data);
});

router.get("/plants/:plantId/performance", (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const data = GetPlantPerformanceResponse.parse(performanceData(plant, new Date()));
  res.json(data);
});

router.get("/plants/:plantId/revenue", (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const data = GetPlantRevenueResponse.parse(revenueData(plant, new Date()));
  res.json(data);
});

/**
 * GET /plants/:plantId/combiners/:combinerId/strings
 *
 * Returns all strings across every inverter feeding the given combiner box,
 * grouped by inverter. This is what the SLD combiner-node popover links to.
 */
router.get("/plants/:plantId/combiners/:combinerId/strings", (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }

  const combinerId = req.params["combinerId"] ?? "";

  // Enforce exact format: <plantId>-comb-<non-negative integer>
  const expectedPrefix = `${plant.id}-comb-`;
  if (!combinerId.startsWith(expectedPrefix)) {
    res.status(404).json({ error: "not_found", message: "Combiner not found for this plant" });
    return;
  }

  const suffix = combinerId.slice(expectedPrefix.length);
  const combinerIndex = Number.parseInt(suffix, 10);
  const combinerCount = calcCombinerCount(plant.inverterCount);

  if (
    Number.isNaN(combinerIndex) ||
    String(combinerIndex) !== suffix ||   // rejects "0x1", "1.5", trailing chars
    combinerIndex < 0 ||
    combinerIndex >= combinerCount
  ) {
    res.status(404).json({ error: "not_found", message: "Combiner index out of range" });
    return;
  }

  const data = combinerStrings(plant, combinerId, new Date());
  res.json(data);
});

/**
 * GET /plants/:plantId/device-health
 *
 * Aggregate device health for the plant-level Device Health summary card:
 * online/offline/degraded counts, average health score, and a 24h sparkline
 * of the plant-wide online-device ratio.
 */
router.get("/plants/:plantId/device-health", async (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }

  const now = new Date();
  const oc = orgCondition(devicesTable.orgId, orgId);
  const devices = await db
    .select()
    .from(devicesTable)
    .where(oc ? and(eq(devicesTable.plantId, plant.id), oc) : eq(devicesTable.plantId, plant.id));

  let online = 0, offline = 0, degraded = 0, error = 0;
  let scoreSum = 0, scoreCount = 0;
  const perDevice = devices.map((d) => {
    // Every device has a live driver managing devices.status (connect/error
    // events plus the offline-detection job), so it is always authoritative.
    const status = d.status;
    if (status === "online") online++;
    else if (status === "offline") offline++;
    else if (status === "error") error++;
    else degraded++;

    const score = d.healthScore ?? (status === "online" ? 95 : status === "error" ? 40 : status === "offline" ? 0 : 60);
    scoreSum += score;
    scoreCount++;

    return { id: d.id, name: d.name, status, healthScore: score };
  });

  const worstDevices = [...perDevice].sort((a, b) => a.healthScore - b.healthScore).slice(0, 5);

  // 24h sparkline: fraction of devices online, sampled hourly using each
  // device's deterministic simulated status (real per-hour history isn't
  // retained at the plant level, so this reflects the same demo pattern
  // used elsewhere for offline devices).
  const sparkline = Array.from({ length: 24 }, (_, i) => {
    const t = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
    const onlineAtT = devices.filter((d) => deviceStatus(d.id, t).status === "online").length;
    return {
      timestamp: t.toISOString(),
      onlinePct: devices.length > 0 ? Math.round((onlineAtT / devices.length) * 100) : 100,
    };
  });

  res.json({
    plantId: plant.id,
    totalDevices: devices.length,
    online,
    offline,
    degraded,
    error,
    avgHealthScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    worstDevices,
    sparkline,
  });
});

export default router;
