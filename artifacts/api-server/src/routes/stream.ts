/**
 * Server-Sent Events (SSE) stream for live IoT telemetry.
 * Pushes a telemetry snapshot every 3 s to every connected client.
 *
 * GET /stream/telemetry          — fleet-wide payload
 * GET /stream/telemetry/:plantId — plant-specific payload (inverter level)
 */

import { Router, type IRouter, type Request, type Response } from "express";
import {
  PLANTS,
  plantLivePowerKw,
  plantEnergyTodayKwh,
  plantPrPct,
  plantHealth,
  plantIrradiance,
  plantAvailabilityPct,
  inverterLiveReading,
  inverterHealth,
} from "../lib/simulation";

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
  sseHeaders(res);

  function pushFleet() {
    const now = new Date();
    let totalPowerKw = 0;
    let totalEnergyKwh = 0;
    let totalCapacityMw = 0;

    const plants = PLANTS.map((plant) => {
      const powerKw   = plantLivePowerKw(plant, now);
      const energyKwh = plantEnergyTodayKwh(plant, now);
      const pr        = plantPrPct(plant, now);
      const health    = plantHealth(plant, now);
      const irradiance = plantIrradiance(plant, now);
      const availability = plantAvailabilityPct(plant, now);

      let offlineCount = 0;
      for (let i = 0; i < plant.inverterCount; i++) {
        const { status } = inverterHealth(plant, i, now);
        if (status === "fault" || status === "comm_lost") offlineCount++;
      }

      totalPowerKw   += powerKw;
      totalEnergyKwh += energyKwh;
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
  const pushTimer     = setInterval(pushFleet,     PUSH_INTERVAL_MS);
  const keepaliveTimer = setInterval(() => sendKeepalive(res), KEEPALIVE_INTERVAL_MS);

  req.on("close", () => {
    clearInterval(pushTimer);
    clearInterval(keepaliveTimer);
  });
});

/* ── Plant-specific stream (inverter-level) ───────────────────────────── */

router.get("/stream/telemetry/:plantId", (req: Request, res: Response) => {
  const plant = PLANTS.find((p) => p.id === req.params["plantId"]);
  if (!plant) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }

  sseHeaders(res);

  function pushPlant() {
    const now = new Date();

    const inverters = Array.from({ length: plant!.inverterCount }, (_, i) => {
      const { status } = inverterHealth(plant!, i, now);
      const reading    = inverterLiveReading(plant!, i, now);
      return {
        index:      i,
        status,
        acPowerKw:  Math.round(reading.acPowerKw * 10) / 10,
        dcPowerKw:  Math.round(reading.dcPowerKw * 10) / 10,
        acVoltageV: Math.round(reading.acVoltageV * 10) / 10,
        acCurrentA: Math.round(reading.acCurrentA * 10) / 10,
        efficiencyPct: reading.efficiencyPct,
        temperatureC:  reading.temperatureC,
      };
    });

    sendEvent(res, "plant_telemetry", {
      timestamp: now.toISOString(),
      plantId:   plant!.id,
      powerKw:   Math.round(plantLivePowerKw(plant!, now) * 10) / 10,
      energyKwh: Math.round(plantEnergyTodayKwh(plant!, now)),
      pr:        Math.round(plantPrPct(plant!, now) * 10) / 10,
      irradianceWm2: Math.round(plantIrradiance(plant!, now)),
      health:    plantHealth(plant!, now),
      inverters,
    });
  }

  pushPlant();
  const pushTimer     = setInterval(pushPlant,      PUSH_INTERVAL_MS);
  const keepaliveTimer = setInterval(() => sendKeepalive(res), KEEPALIVE_INTERVAL_MS);

  req.on("close", () => {
    clearInterval(pushTimer);
    clearInterval(keepaliveTimer);
  });
});

export default router;
