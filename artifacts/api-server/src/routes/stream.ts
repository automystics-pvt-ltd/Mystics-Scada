/**
 * Server-Sent Events (SSE) stream for live IoT telemetry.
 * Pushes a telemetry snapshot every 3 s to every connected client.
 *
 * GET /stream/telemetry          — fleet-wide payload (org-scoped)
 * GET /stream/telemetry/:plantId — plant-specific payload (inverter level)
 *
 * Both streams respect active fault-injection overrides so that power, health,
 * availability, and per-inverter status reflect injected faults in real time —
 * not just the SLD endpoint.
 *
 * Org scoping is captured at connection time from `req.user` so a client
 * cannot see another org's plants mid-stream.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import {
  getOrgPlants,
  plantLivePowerKw,
  plantEnergyTodayKwh,
  plantPrPct,
  plantHealth,
  plantIrradiance,
  plantAvailabilityPct,
  inverterLiveReading,
  inverterHealth,
  inverterId,
} from "../lib/domain";
import { getFaultedInverterIds, isPlantDisconnected } from "../lib/faultInjection";
import { resolveOrgId } from "../lib/orgScope";
import { registerOrgNotificationClient } from "../lib/notificationRegistry";

const router: IRouter = Router();

/** How often (ms) to push a telemetry frame. */
const PUSH_INTERVAL_MS = 3_000;
/** How often (ms) to send an SSE keepalive comment (prevents proxy timeout). */
const KEEPALIVE_INTERVAL_MS = 20_000;

function sseHeaders(res: Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();
}

function sendEvent(res: Response, eventName: string, data: unknown) {
  res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sendKeepalive(res: Response) {
  res.write(": keepalive\n\n");
}

/* ── Fleet-wide stream ────────────────────────────────────────────────── */

router.get("/stream/telemetry", (req: Request, res: Response) => {
  // Capture org scope at connection time — cannot be changed mid-stream
  const orgId = resolveOrgId(req);
  sseHeaders(res);

  function pushFleet() {
    const now = new Date();
    let totalPowerKw = 0;
    let totalEnergyKwh = 0;
    let totalCapacityMw = 0;

    const orgPlants = getOrgPlants(orgId);

    const plants = orgPlants.map((plant) => {
      // Fetch fault overrides for this plant so the stream reflects injected
      // faults in power, health, availability, and offline-inverter counts.
      const overrides = {
        faultedInverterIds: getFaultedInverterIds(plant.id),
        plantDisconnect: isPlantDisconnected(plant.id),
      };

      const powerKw    = plantLivePowerKw(plant, now, overrides);
      const energyKwh  = plantEnergyTodayKwh(plant, now, overrides);
      const pr         = plantPrPct(plant, now);
      const health     = plantHealth(plant, now, overrides);
      const irradiance = plantIrradiance(plant, now);
      const availability = plantAvailabilityPct(plant, now, overrides);

      let offlineCount = 0;
      for (let i = 0; i < plant.inverterCount; i++) {
        const invId = inverterId(plant.id, i);
        const forcedOffline =
          overrides.plantDisconnect ||
          overrides.faultedInverterIds.has(invId);
        if (forcedOffline) {
          offlineCount++;
          continue;
        }
        const { status } = inverterHealth(plant, i, now);
        if (status === "fault" || status === "comm_lost") offlineCount++;
      }

      totalPowerKw    += powerKw;
      totalEnergyKwh  += energyKwh;
      totalCapacityMw += plant.capacityMw;

      return {
        id: plant.id,
        powerKw:          Math.round(powerKw * 10) / 10,
        energyKwh:        Math.round(energyKwh),
        pr:               Math.round(pr * 10) / 10,
        availabilityPct:  Math.round(availability * 10) / 10,
        health,
        irradianceWm2:    Math.round(irradiance),
        offlineInverters: offlineCount,
      };
    });

    sendEvent(res, "telemetry", {
      timestamp:      now.toISOString(),
      fleet: {
        totalPowerMw:   Math.round((totalPowerKw / 1000) * 100) / 100,
        totalEnergyMwh: Math.round((totalEnergyKwh / 1000) * 10) / 10,
        avgPr:          plants.length > 0
          ? Math.round(plants.reduce((s, p) => s + p.pr, 0) / plants.length * 10) / 10
          : 0,
        totalCapacityMw,
      },
      plants,
    });
  }

  // Send immediately, then on an interval
  pushFleet();
  const pushTimer      = setInterval(pushFleet,     PUSH_INTERVAL_MS);
  const keepaliveTimer = setInterval(() => sendKeepalive(res), KEEPALIVE_INTERVAL_MS);

  // Register for real-time notification push (org-scoped)
  const unregisterNotif = orgId
    ? registerOrgNotificationClient(orgId, (data) => sendEvent(res, "notification", data))
    : null;

  req.on("close", () => {
    clearInterval(pushTimer);
    clearInterval(keepaliveTimer);
    unregisterNotif?.();
  });
});

/* ── Plant-specific stream (inverter-level) ───────────────────────────── */

router.get("/stream/telemetry/:plantId", (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  // Verify the plant belongs to the caller's org
  const plant = getOrgPlants(orgId).find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }

  sseHeaders(res);

  function pushPlant() {
    const now = new Date();

    const overrides = {
      faultedInverterIds: getFaultedInverterIds(plant!.id),
      plantDisconnect: isPlantDisconnected(plant!.id),
    };

    const inverters = Array.from({ length: plant!.inverterCount }, (_, i) => {
      const invId = inverterId(plant!.id, i);
      const forcedOffline =
        overrides.plantDisconnect ||
        overrides.faultedInverterIds.has(invId);

      if (forcedOffline) {
        return {
          index:         i,
          status:        "comm_lost" as const,
          acPowerKw:     0,
          dcPowerKw:     0,
          acVoltageV:    0,
          acCurrentA:    0,
          efficiencyPct: 0,
          temperatureC:  0,
        };
      }

      const { status } = inverterHealth(plant!, i, now);
      const reading    = inverterLiveReading(plant!, i, now);
      return {
        index:         i,
        status,
        acPowerKw:     Math.round(reading.acPowerKw * 10) / 10,
        dcPowerKw:     Math.round(reading.dcPowerKw * 10) / 10,
        acVoltageV:    Math.round(reading.acVoltageV * 10) / 10,
        acCurrentA:    Math.round(reading.acCurrentA * 10) / 10,
        efficiencyPct: reading.efficiencyPct,
        temperatureC:  reading.temperatureC,
      };
    });

    sendEvent(res, "plant_telemetry", {
      timestamp:     now.toISOString(),
      plantId:       plant!.id,
      powerKw:       Math.round(plantLivePowerKw(plant!, now, overrides) * 10) / 10,
      energyKwh:     Math.round(plantEnergyTodayKwh(plant!, now, overrides)),
      pr:            Math.round(plantPrPct(plant!, now) * 10) / 10,
      irradianceWm2: Math.round(plantIrradiance(plant!, now)),
      health:        plantHealth(plant!, now, overrides),
      inverters,
    });
  }

  pushPlant();
  const pushTimer      = setInterval(pushPlant,      PUSH_INTERVAL_MS);
  const keepaliveTimer = setInterval(() => sendKeepalive(res), KEEPALIVE_INTERVAL_MS);

  req.on("close", () => {
    clearInterval(pushTimer);
    clearInterval(keepaliveTimer);
  });
});

export default router;
