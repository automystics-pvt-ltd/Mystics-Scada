import { Router, type IRouter } from "express";
import {
  injectFault,
  clearFault,
  clearAllFaults,
  getActiveFaults,
} from "../lib/faultInjection";
import { getOrgPlants } from "../lib/domain";
import { resolveOrgId } from "../lib/orgScope";
import { requirePermission } from "../middleware/requirePermission";

const router: IRouter = Router();

function parseInjectBody(body: unknown):
  | { ok: true; target: "plant"; durationSeconds: number }
  | { ok: true; target: "inverter"; inverterId: string; durationSeconds: number }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const target = b["target"];
  const durationSeconds = b["durationSeconds"];
  if (typeof durationSeconds !== "number" || !Number.isInteger(durationSeconds) || durationSeconds < 5 || durationSeconds > 300) {
    return { ok: false, message: "durationSeconds must be an integer between 5 and 300" };
  }
  if (target === "plant") return { ok: true, target: "plant", durationSeconds };
  if (target === "inverter") {
    const inverterId = b["inverterId"];
    if (typeof inverterId !== "string" || inverterId.length === 0) {
      return { ok: false, message: "inverterId is required for inverter faults" };
    }
    return { ok: true, target: "inverter", inverterId, durationSeconds };
  }
  return { ok: false, message: "target must be 'plant' or 'inverter'" };
}

// GET /api/plants/:plantId/fault-inject — list active injected faults
router.get("/plants/:plantId/fault-inject", (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const faults = getActiveFaults(plant.id);
  res.json({
    plantId: plant.id,
    faults: faults.map((f) => ({
      key: f.key,
      label: f.label,
      target: f.target,
      injectedAt: new Date(f.injectedAt).toISOString(),
      expiresAt: new Date(f.expiresAt).toISOString(),
      remainingMs: Math.max(0, f.expiresAt - Date.now()),
    })),
  });
});

// POST /api/plants/:plantId/fault-inject — inject a new fault
router.post("/plants/:plantId/fault-inject", requirePermission("plant.manage"), (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }

  const parsed = parseInjectBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: "invalid_body", message: parsed.message });
    return;
  }

  const durationMs = parsed.durationSeconds * 1000;

  if (parsed.target === "inverter") {
    if (!parsed.inverterId.startsWith(`${plant.id}-inv-`)) {
      res.status(400).json({ error: "invalid_inverter", message: "Inverter does not belong to this plant" });
      return;
    }
    const fault = injectFault(plant.id, { kind: "inverter", inverterId: parsed.inverterId }, durationMs);
    res.status(201).json({
      key: fault.key,
      label: fault.label,
      expiresAt: new Date(fault.expiresAt).toISOString(),
      remainingMs: Math.max(0, fault.expiresAt - Date.now()),
    });
    return;
  }

  // target === "plant"
  const fault = injectFault(plant.id, { kind: "plant" }, durationMs);
  res.status(201).json({
    key: fault.key,
    label: fault.label,
    expiresAt: new Date(fault.expiresAt).toISOString(),
    remainingMs: Math.max(0, fault.expiresAt - Date.now()),
  });
});

// DELETE /api/plants/:plantId/fault-inject — clear all active faults for plant
router.delete("/plants/:plantId/fault-inject", requirePermission("plant.manage"), (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  clearAllFaults(plant.id);
  res.status(204).end();
});

// DELETE /api/plants/:plantId/fault-inject/by/:suffix — clear a specific fault
// The full fault key is "<plantId>:<suffix>" — the route carries only the
// suffix (either "plant" or an inverter ID like "plant-thar-inv-3").
router.delete("/plants/:plantId/fault-inject/by/:suffix", requirePermission("plant.manage"), (req, res) => {
  const orgId = resolveOrgId(req);
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }
  const key = `${plant.id}:${req.params["suffix"]}`;
  clearFault(key);
  res.status(204).end();
});

export default router;
