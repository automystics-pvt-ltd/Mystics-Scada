import { Router, type IRouter } from "express";
import {
  injectFault,
  attachAlertToFault,
  clearFault,
  clearAllFaults,
  getActiveFaults,
} from "../lib/faultInjection";
import { createFaultAlert, resolveFaultAlert } from "../lib/faultAlerts";
import { getOrgPlants } from "../lib/domain";
import { PLANT_ORG_MAP } from "../lib/simulation";
import { resolveOrgId } from "../lib/orgScope";
import { requirePermission } from "../middleware/requirePermission";
import { writeAuditLog } from "../lib/auditLog";

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
router.post(
  "/plants/:plantId/fault-inject",
  requirePermission("plant.manage"),
  async (req, res) => {
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

    // Resolve the org ID — fall back to PLANT_ORG_MAP for super-admin context
    const effectiveOrgId = orgId ?? PLANT_ORG_MAP[plant.id];
    if (!effectiveOrgId) {
      res.status(400).json({ error: "org_required", message: "Cannot determine org for this plant" });
      return;
    }

    const durationMs = parsed.durationSeconds * 1000;

    if (parsed.target === "inverter") {
      if (!parsed.inverterId.startsWith(`${plant.id}-inv-`)) {
        res.status(400).json({ error: "invalid_inverter", message: "Inverter does not belong to this plant" });
        return;
      }
      const fault = await injectFault(
        effectiveOrgId,
        plant.id,
        { kind: "inverter", inverterId: parsed.inverterId },
        durationMs,
      );

      // Await alert creation then persist alertId before responding, so that
      // any subsequent manual-clear DELETE always has the alertId available.
      const alertId = await createFaultAlert(fault, plant.name);
      await attachAlertToFault(fault.key, alertId);
      setTimeout(
        () => void resolveFaultAlert(alertId, effectiveOrgId, fault.label, "expired"),
        durationMs + 200,
      );

      writeAuditLog({
        orgId: effectiveOrgId,
        userId: req.user!.id,
        action: "fault_inject.create",
        resourceType: "fault_simulation",
        resourceId: fault.key,
        metadata: {
          plantId: plant.id,
          target: parsed.target,
          inverterId: parsed.inverterId,
          durationSeconds: parsed.durationSeconds,
          label: fault.label,
          alertId,
        },
      });

      res.status(201).json({
        key: fault.key,
        label: fault.label,
        expiresAt: new Date(fault.expiresAt).toISOString(),
        remainingMs: Math.max(0, fault.expiresAt - Date.now()),
      });
      return;
    }

    // target === "plant"
    const fault = await injectFault(effectiveOrgId, plant.id, { kind: "plant" }, durationMs);

    const alertId = await createFaultAlert(fault, plant.name);
    await attachAlertToFault(fault.key, alertId);
    setTimeout(
      () => void resolveFaultAlert(alertId, effectiveOrgId, fault.label, "expired"),
      durationMs + 200,
    );

    writeAuditLog({
      orgId: effectiveOrgId,
      userId: req.user!.id,
      action: "fault_inject.create",
      resourceType: "fault_simulation",
      resourceId: fault.key,
      metadata: {
        plantId: plant.id,
        target: "plant",
        durationSeconds: parsed.durationSeconds,
        label: fault.label,
        alertId,
      },
    });

    res.status(201).json({
      key: fault.key,
      label: fault.label,
      expiresAt: new Date(fault.expiresAt).toISOString(),
      remainingMs: Math.max(0, fault.expiresAt - Date.now()),
    });
  },
);

// DELETE /api/plants/:plantId/fault-inject — clear all active faults for plant
router.delete(
  "/plants/:plantId/fault-inject",
  requirePermission("plant.manage"),
  async (req, res) => {
    const orgId = resolveOrgId(req);
    const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
    if (!plant) {
      res.status(404).json({ error: "not_found", message: "Plant not found" });
      return;
    }
    const cleared = await clearAllFaults(plant.id);
    for (const fault of cleared) {
      if (fault.alertId) {
        void resolveFaultAlert(fault.alertId, fault.orgId, fault.label, "manual");
      }
    }
    // Derive effective org from the first cleared fault (all faults share the same orgId)
    // or fall back to the plant's known org so super-admin clears are attributed correctly.
    const clearAllEffectiveOrgId = cleared[0]?.orgId ?? PLANT_ORG_MAP[plant.id] ?? "";
    writeAuditLog({
      orgId: clearAllEffectiveOrgId,
      userId: req.user!.id,
      action: "fault_inject.clear_all",
      resourceType: "fault_simulation",
      resourceId: plant.id,
      metadata: {
        plantId: plant.id,
        clearedCount: cleared.length,
        clearedKeys: cleared.map((f) => f.key),
      },
    });
    res.status(204).end();
  },
);

// DELETE /api/plants/:plantId/fault-inject/by/:suffix — clear a specific fault
// The full fault key is "<plantId>:<suffix>" — the route carries only the
// suffix (either "plant" or an inverter ID like "plant-thar-inv-3").
router.delete(
  "/plants/:plantId/fault-inject/by/:suffix",
  requirePermission("plant.manage"),
  async (req, res) => {
    const orgId = resolveOrgId(req);
    const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
    if (!plant) {
      res.status(404).json({ error: "not_found", message: "Plant not found" });
      return;
    }
    const key = `${plant.id}:${req.params["suffix"]}`;
    const cleared = await clearFault(key);
    if (cleared?.alertId) {
      void resolveFaultAlert(cleared.alertId, cleared.orgId, cleared.label, "manual");
    }
    const clearOneEffectiveOrgId = cleared?.orgId ?? PLANT_ORG_MAP[plant.id] ?? "";
    writeAuditLog({
      orgId: clearOneEffectiveOrgId,
      userId: req.user!.id,
      action: "fault_inject.clear_one",
      resourceType: "fault_simulation",
      resourceId: key,
      metadata: {
        plantId: plant.id,
        faultKey: key,
        label: cleared?.label ?? null,
        alertId: cleared?.alertId ?? null,
      },
    });
    res.status(204).end();
  },
);

export default router;
