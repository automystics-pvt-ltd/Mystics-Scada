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
import { resolveOrgId } from "../lib/orgScope";

const router: IRouter = Router();

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

export default router;
