// Adapts the raw simulation primitives (lib/simulation.ts) into the exact
// response shapes defined by the OpenAPI spec / generated zod schemas.

import {
  PLANTS,
  PLANT_ORG_MAP,
  getOrgPlants,
  type PlantConfig,
  type SldOverrides,
  type InverterStatus,
  inverterId,
  inverterIndex,
  getPlantByInverterId,
  plantIrradiance,
  plantAmbientTempC,
  plantHealth,
  plantLivePowerKw,
  plantEnergyTodayKwh,
  plantPrPct,
  plantAvailabilityPct,
  inverterHealth,
  inverterLiveReading,
  stringReadings as rawStringReadings,
  weatherStations as rawWeatherStations,
  inverterTrend as rawInverterTrend,
  plantYieldSeries as rawYieldSeries,
  plantPerformance as rawPerformance,
  plantRevenue as rawRevenue,
  plantSld as rawSld,
} from "./simulation";
import { getFaultedInverterIds, isPlantDisconnected } from "./faultInjection";

/** Build the fault-injection overrides for a given plant. */
function buildOverrides(plantId: string): SldOverrides {
  return {
    faultedInverterIds: getFaultedInverterIds(plantId),
    plantDisconnect: isPlantDisconnected(plantId),
  };
}

const PLANT_COORDS: Record<string, { lat: number; lng: number; region: string }> = {
  "plant-thar": { lat: 26.9157, lng: 70.9083, region: "Rajasthan" },
  "plant-sundarbans": { lat: 21.9497, lng: 88.4337, region: "West Bengal" },
  "plant-deccan": { lat: 14.0997, lng: 77.2802, region: "Karnataka" },
  "plant-coastal": { lat: 8.7642, lng: 78.1348, region: "Tamil Nadu" },
};

function alertCountsForPlant(plantId: string, alertCounts: Map<string, { critical: number; major: number; minor: number; informational: number }>) {
  return alertCounts.get(plantId) ?? { critical: 0, major: 0, minor: 0, informational: 0 };
}

export function plantSummary(
  plant: PlantConfig,
  now: Date,
  alertCounts: Map<string, { critical: number; major: number; minor: number; informational: number }>,
) {
  const coords = PLANT_COORDS[plant.id] ?? { lat: 0, lng: 0, region: plant.location };
  const overrides = buildOverrides(plant.id);
  const simulatedFaultActive =
    overrides.plantDisconnect || (overrides.faultedInverterIds?.size ?? 0) > 0;
  return {
    id: plant.id,
    name: plant.name,
    region: coords.region,
    lat: coords.lat,
    lng: coords.lng,
    capacityKw: plant.capacityMw * 1000,
    currentPowerKw: plantLivePowerKw(plant, now, overrides),
    todayEnergyKwh: plantEnergyTodayKwh(plant, now, overrides),
    pr: plantPrPct(plant, now),
    availabilityPct: plantAvailabilityPct(plant, now, overrides),
    healthStatus: plantHealth(plant, now, overrides),
    alertCounts: alertCountsForPlant(plant.id, alertCounts),
    simulatedFaultActive,
  };
}

export function plantDetail(
  plant: PlantConfig,
  now: Date,
  alertCounts: Map<string, { critical: number; major: number; minor: number; informational: number }>,
) {
  const summary = plantSummary(plant, now, alertCounts);
  const overrides = buildOverrides(plant.id);
  const irradiance = plantIrradiance(plant, now);
  let offlineCount = 0;
  for (let i = 0; i < plant.inverterCount; i++) {
    const id = inverterId(plant.id, i);
    const forcedOffline =
      overrides.plantDisconnect ||
      (overrides.faultedInverterIds?.has(id) ?? false);
    if (forcedOffline) {
      offlineCount++;
      continue;
    }
    const { status } = inverterHealth(plant, i, now);
    if (status === "comm_lost" || status === "fault") offlineCount++;
  }
  return {
    ...summary,
    todayTargetKwh: Math.round(plant.capacityMw * 1000 * 5.4),
    irradiancePoaWm2: Math.round(irradiance),
    irradianceGhiWm2: Math.round(irradiance * 0.95),
    ambientTempC: Math.round(plantAmbientTempC(plant, now) * 10) / 10,
    moduleTempC: Math.round((plantAmbientTempC(plant, now) + irradiance * 0.022) * 10) / 10,
    inverterCount: plant.inverterCount,
    offlineInverterCount: offlineCount,
    lastUpdated: now,
  };
}

export function inverterSummary(plant: PlantConfig, idx: number, now: Date) {
  const id = inverterId(plant.id, idx);

  // Apply fault-injection overrides so this endpoint agrees with the SLD and
  // plant overview — a forced-offline inverter must show comm_lost here too.
  const overrides = buildOverrides(plant.id);
  const forcedOffline: boolean =
    (overrides.plantDisconnect ?? false) ||
    (overrides.faultedInverterIds?.has(id) ?? false);

  const status: InverterStatus = forcedOffline
    ? "comm_lost"
    : inverterHealth(plant, idx, now).status;

  const reading = forcedOffline ? null : inverterLiveReading(plant, idx, now);

  return {
    id,
    plantId: plant.id,
    name: `Inverter ${idx + 1}`,
    status,
    acPowerKw:         reading?.acPowerKw        ?? 0,
    dcPowerKw:         reading?.dcPowerKw        ?? 0,
    acVoltageV:        Math.round((reading?.acVoltageV  ?? 0) * 10) / 10,
    acCurrentA:        Math.round((reading?.acCurrentA  ?? 0) * 10) / 10,
    dcVoltageV:        Math.round((reading?.dcVoltageV  ?? 0) * 10) / 10,
    dcCurrentA:        reading && reading.dcVoltageV > 0
                         ? Math.round(((reading.dcPowerKw * 1000) / reading.dcVoltageV) * 10) / 10
                         : 0,
    frequencyHz:       Math.round((reading?.frequencyHz  ?? 0) * 100) / 100,
    efficiencyPct:     reading?.efficiencyPct    ?? 0,
    temperatureC:      reading?.temperatureC     ?? 0,
    powerFactor:       (reading?.acPowerKw ?? 0) > 0 ? 0.98 : 0,
    dailyEnergyKwh:    reading?.energyTodayKwh   ?? 0,
    monthlyEnergyKwh:  Math.round((reading?.energyTodayKwh   ?? 0) * 22),
    lifetimeEnergyMwh: reading?.energyLifetimeMwh ?? 0,
    lastUpdated:       now,
  };
}

export function inverterTrendPoints(plant: PlantConfig, idx: number, range: "hour" | "day" | "week" | "month", now: Date) {
  return rawInverterTrend(plant, idx, range, now).map((p) => ({
    timestamp: p.timestamp,
    acPowerKw: p.acPowerKw,
    dcPowerKw: p.dcPowerKw,
    efficiencyPct: p.efficiencyPct,
    temperatureC: p.temperatureC,
  }));
}

export function stringReadingsFor(plant: PlantConfig, idx: number, now: Date) {
  const invId = inverterId(plant.id, idx);
  const readings = rawStringReadings(plant, idx, now);
  const currents = readings.map((r) => r.currentA).sort((a, b) => a - b);
  const median = currents[Math.floor(currents.length / 2)] ?? 0;
  return readings.map((r) => ({
    id: r.stringId,
    inverterId: invId,
    label: r.label,
    currentA: r.currentA,
    voltageV: r.voltageV,
    status: r.currentA > 0.01 ? ("on" as const) : ("off" as const),
    medianCurrentA: Math.round(median * 100) / 100,
    deviationPct: r.deviationPct,
    isDeviating: Math.abs(r.deviationPct) > 15,
  }));
}

export function weatherStationsFor(plant: PlantConfig, now: Date) {
  return rawWeatherStations(plant, now).map((w, i) => ({
    id: w.id,
    plantId: plant.id,
    name: w.name,
    zone: `Zone ${String.fromCharCode(65 + i)}`,
    poaWm2: w.poaIrradianceWm2,
    ghiWm2: w.ghiIrradianceWm2,
    ambientTempC: w.ambientTempC,
    moduleTempC: w.moduleTempC,
    windSpeedMs: w.windSpeedMs,
    windDirectionDeg: w.windDirectionDeg,
    humidityPct: w.humidityPct,
    rainfallMm: w.rainfallMm,
    lastUpdated: now,
  }));
}

export function yieldSeries(plant: PlantConfig, period: "daily" | "weekly" | "monthly" | "yearly", now: Date) {
  const points = rawYieldSeries(plant, period, now);
  const totalActual = points.reduce((sum, p) => sum + p.actualKwh, 0);
  const capacityKw = plant.capacityMw * 1000;
  return {
    period,
    specificYieldKwhPerKwp: Math.round((totalActual / capacityKw) * 100) / 100,
    points: points.map((p) => ({
      label: p.date,
      actualKwh: p.actualKwh,
      expectedKwh: p.expectedKwh,
      deviationPct: p.expectedKwh > 0 ? Math.round(((p.actualKwh - p.expectedKwh) / p.expectedKwh) * 1000) / 10 : 0,
    })),
  };
}

export function performanceData(plant: PlantConfig, now: Date) {
  const perf = rawPerformance(plant, now);
  const byCategory = (cat: string) => perf.lossBreakdown.find((l) => l.category === cat)?.lossPct ?? 0;
  return {
    prTrend: perf.prTrend.map((p) => ({ label: p.date, pr: p.prPct, targetPr: p.targetPct })),
    availabilityPct: perf.availabilityPct,
    gridAvailabilityPct: perf.gridAvailabilityPct,
    lossBreakdown: {
      soilingPct: byCategory("Soiling"),
      shadingPct: byCategory("Shading"),
      temperaturePct: byCategory("Temperature"),
      downtimePct: byCategory("Downtime"),
      curtailmentPct: byCategory("Curtailment"),
    },
  };
}

export function revenueData(plant: PlantConfig, now: Date) {
  const rev = rawRevenue(plant, now);
  return {
    currency: rev.currency,
    tariffPerKwh: rev.tariffPerKwh,
    todayRevenue: rev.todayRevenue,
    monthRevenue: rev.monthToDateRevenue,
    lifetimeRevenue: rev.yearToDateRevenue,
    co2AvoidedKgToday: Math.round(rev.co2AvoidedTonnesToday * 1000),
    co2AvoidedKgLifetime: Math.round(rev.co2AvoidedTonnesLifetime * 1000),
  };
}

export function sldFor(plant: PlantConfig, now: Date) {
  const overrides = {
    faultedInverterIds: getFaultedInverterIds(plant.id),
    plantDisconnect: isPlantDisconnected(plant.id),
  };
  const { nodes, edges } = rawSld(plant, now, overrides);

  // First inverter feeding each combiner box, used to link combiner nodes to
  // that inverter's string diagnostics page (there is no standalone
  // combiner-level page).
  const firstInverterByCombiner = new Map<string, string>();
  for (const n of nodes) {
    if (n.type === "inverter" && n.parentId && !firstInverterByCombiner.has(n.parentId)) {
      firstInverterByCombiner.set(n.parentId, n.id);
    }
  }

  /** A node's status is simulated when its current fault is operator-injected. */
  const isNodeSimulated = (nodeId: string, nodeType: string): boolean => {
    if (overrides.plantDisconnect) {
      // Full plant disconnect forces the main electrical path offline
      return (
        nodeType === "inverter" ||
        nodeType === "transformer" ||
        nodeType === "switchyard" ||
        nodeType === "grid"
      );
    }
    return nodeType === "inverter" && overrides.faultedInverterIds.has(nodeId);
  };

  return {
    plantId: plant.id,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      status: n.status,
      parentId: n.parentId ?? null,
      powerKw: n.powerKw ?? null,
      voltageV: n.voltageV ?? null,
      currentA: n.currentA ?? null,
      breakerState: n.breakerState ?? null,
      stringFaultCount: n.stringFaultCount ?? null,
      simulated: isNodeSimulated(n.id, n.type),
      detailPath:
        n.type === "inverter"
          ? `/plants/${plant.id}/inverters/${n.id}`
          : n.type === "combiner"
            ? `/plants/${plant.id}/combiners/${n.id}/strings`
            : null,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      fromId: e.fromId,
      toId: e.toId,
      powerKw: e.powerKw,
      energized: e.energized,
    })),
  };
}

/**
 * Returns the plant that owns the given inverter ID, but only if that plant
 * belongs to the specified org. Returns undefined if the plant exists but
 * belongs to a different org (prevents cross-tenant inverter lookups).
 */
export function getOrgPlantByInverterId(
  orgId: string | null,
  invId: string,
): PlantConfig | undefined {
  const plant = getPlantByInverterId(invId);
  if (!plant) return undefined;
  if (orgId !== null && PLANT_ORG_MAP[plant.id] !== orgId) return undefined;
  return plant;
}

export {
  PLANTS,
  PLANT_ORG_MAP,
  getOrgPlants,
  getPlantByInverterId,
  inverterIndex,
  inverterId,
  // Raw simulation primitives re-exported for stream.ts (which needs per-inverter access)
  plantLivePowerKw,
  plantEnergyTodayKwh,
  plantPrPct,
  plantHealth,
  plantIrradiance,
  plantAvailabilityPct,
  inverterHealth,
  inverterLiveReading,
};
