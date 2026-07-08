import { Router, type IRouter } from "express";
import { GetInverterResponse, GetInverterTrendResponse, GetInverterTrendQueryParams, ListStringReadingsResponse } from "@workspace/api-zod";
import { getOrgPlantByInverterId, inverterIndex, inverterSummary, inverterTrendPoints, stringReadingsFor } from "../lib/domain";
import { resolveOrgId } from "../lib/orgScope";

const router: IRouter = Router();

router.get("/inverters/:inverterId", (req, res) => {
  const id = req.params["inverterId"] ?? "";
  const orgId = resolveOrgId(req);
  const plant = getOrgPlantByInverterId(orgId, id);
  const idx = inverterIndex(id);
  if (!plant || idx < 0 || idx >= plant.inverterCount) {
    res.status(404).json({ error: "not_found", message: "Inverter not found" });
    return;
  }
  const data = GetInverterResponse.parse(inverterSummary(plant, idx, new Date()));
  res.json(data);
});

router.get("/inverters/:inverterId/trend", (req, res) => {
  const id = req.params["inverterId"] ?? "";
  const orgId = resolveOrgId(req);
  const plant = getOrgPlantByInverterId(orgId, id);
  const idx = inverterIndex(id);
  if (!plant || idx < 0 || idx >= plant.inverterCount) {
    res.status(404).json({ error: "not_found", message: "Inverter not found" });
    return;
  }
  const { range } = GetInverterTrendQueryParams.parse(req.query);
  const data = GetInverterTrendResponse.parse(inverterTrendPoints(plant, idx, range, new Date()));
  res.json(data);
});

router.get("/inverters/:inverterId/strings", (req, res) => {
  const id = req.params["inverterId"] ?? "";
  const orgId = resolveOrgId(req);
  const plant = getOrgPlantByInverterId(orgId, id);
  const idx = inverterIndex(id);
  if (!plant || idx < 0 || idx >= plant.inverterCount) {
    res.status(404).json({ error: "not_found", message: "Inverter not found" });
    return;
  }
  const data = ListStringReadingsResponse.parse(stringReadingsFor(plant, idx, new Date()));
  res.json(data);
});

export default router;
