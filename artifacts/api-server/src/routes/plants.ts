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
  PLANTS,
  plantSummary,
  plantDetail,
  sldFor,
  inverterSummary,
  weatherStationsFor,
  yieldSeries,
  performanceData,
  revenueData,
} from "../lib/domain";
import { activeAlertCountsByPlant } from "../lib/alertCounts";

const router: IRouter = Router();

router.get("/plants", async (_req, res) => {
  const now = new Date();
  const alertCounts = await activeAlertCountsByPlant();
  const data = ListPlantsResponse.parse(PLANTS.map((plant) => plantSummary(plant, now, alertCounts)));
  res.json(data);
});

router.get("/plants/:plantId", async (req, res) => {
  const plant = PLANTS.find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const now = new Date();
  const alertCounts = await activeAlertCountsByPlant();
  const data = GetPlantResponse.parse(plantDetail(plant, now, alertCounts));
  res.json(data);
});

router.get("/plants/:plantId/sld", (req, res) => {
  const plant = PLANTS.find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const data = GetPlantSldResponse.parse(sldFor(plant, new Date()));
  res.json(data);
});

router.get("/plants/:plantId/inverters", (req, res) => {
  const plant = PLANTS.find((p) => p.id === req.params["plantId"]);
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
  const plant = PLANTS.find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const data = ListWeatherStationsResponse.parse(weatherStationsFor(plant, new Date()));
  res.json(data);
});

router.get("/plants/:plantId/yield", (req, res) => {
  const plant = PLANTS.find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const { period } = GetPlantYieldQueryParams.parse(req.query);
  const data = GetPlantYieldResponse.parse(yieldSeries(plant, period, new Date()));
  res.json(data);
});

router.get("/plants/:plantId/performance", (req, res) => {
  const plant = PLANTS.find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const data = GetPlantPerformanceResponse.parse(performanceData(plant, new Date()));
  res.json(data);
});

router.get("/plants/:plantId/revenue", (req, res) => {
  const plant = PLANTS.find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const data = GetPlantRevenueResponse.parse(revenueData(plant, new Date()));
  res.json(data);
});

export default router;
