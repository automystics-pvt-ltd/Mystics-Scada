import { Router, type IRouter } from "express";
import { GetPortfolioSummaryResponse } from "@workspace/api-zod";
import { getOrgPlants, plantSummary } from "../lib/domain";
import { activeAlertCountsByPlant } from "../lib/alertCounts";
import { resolveOrgId } from "../lib/orgScope";

const router: IRouter = Router();

router.get("/portfolio/summary", async (req, res) => {
  const orgId = resolveOrgId(req);
  const now = new Date();
  const alertCounts = await activeAlertCountsByPlant(orgId);
  const orgPlants = getOrgPlants(orgId);
  const plants = orgPlants.map((plant) => plantSummary(plant, now, alertCounts));

  const totalCapacityMw = orgPlants.reduce((sum, p) => sum + p.capacityMw, 0);
  const totalCurrentPowerMw = plants.reduce((sum, p) => sum + p.currentPowerKw, 0) / 1000;
  const totalGenerationTodayMwh = plants.reduce((sum, p) => sum + p.todayEnergyKwh, 0) / 1000;
  const avgPr = plants.length > 0 ? plants.reduce((sum, p) => sum + p.pr, 0) / plants.length : 0;
  const avgAvailabilityPct = plants.length > 0
    ? plants.reduce((sum, p) => sum + p.availabilityPct, 0) / plants.length
    : 0;
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
    totalPlants: orgPlants.length,
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
