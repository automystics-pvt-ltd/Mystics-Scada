import { Router, type IRouter } from "express";
import { GetPortfolioSummaryResponse } from "@workspace/api-zod";
import { PLANTS, plantSummary } from "../lib/domain";
import { activeAlertCountsByPlant } from "../lib/alertCounts";

const router: IRouter = Router();

router.get("/portfolio/summary", async (_req, res) => {
  const now = new Date();
  const alertCounts = await activeAlertCountsByPlant();
  const plants = PLANTS.map((plant) => plantSummary(plant, now, alertCounts));

  const totalCapacityMw = PLANTS.reduce((sum, p) => sum + p.capacityMw, 0);
  const totalCurrentPowerMw = plants.reduce((sum, p) => sum + p.currentPowerKw, 0) / 1000;
  const totalGenerationTodayMwh = plants.reduce((sum, p) => sum + p.todayEnergyKwh, 0) / 1000;
  const avgPr = plants.reduce((sum, p) => sum + p.pr, 0) / plants.length;
  const avgAvailabilityPct = plants.reduce((sum, p) => sum + p.availabilityPct, 0) / plants.length;
  const fleetAlertCounts = plants.reduce(
    (acc, p) => ({
      critical: acc.critical + p.alertCounts.critical,
      major: acc.major + p.alertCounts.major,
      minor: acc.minor + p.alertCounts.minor,
      informational: acc.informational + p.alertCounts.informational,
    }),
    { critical: 0, major: 0, minor: 0, informational: 0 },
  );

  const data = GetPortfolioSummaryResponse.parse({
    totalPlants: PLANTS.length,
    totalCapacityMw,
    totalCurrentPowerMw: Math.round(totalCurrentPowerMw * 100) / 100,
    totalGenerationTodayMwh: Math.round(totalGenerationTodayMwh * 100) / 100,
    avgPr: Math.round(avgPr * 10) / 10,
    avgAvailabilityPct: Math.round(avgAvailabilityPct * 10) / 10,
    alertCounts: fleetAlertCounts,
    plants,
  });
  res.json(data);
});

export default router;
