// Adapts the raw simulation primitives (lib/simulation.ts) into the exact
// response shapes defined by the OpenAPI spec / generated zod schemas.

import {
  PLANTS,
  type PlantConfig,
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
  return {
    id: plant.id,
    name: plant.name,
    region: coords.region,
    lat: coords.lat,
    lng: coords.lng,
    capacityKw: plant.capacityMw * 1000,
    currentPowerKw: plantLivePowerKw(plant, now),
    todayEnergyKwh: plantEnergyTodayKwh(plant, now),
    pr: plantPrPct(plant, now),
    availabilityPct: plantAvailabilityPct(plant, now),
    healthStatus: plantHealth(plant, now),
    alertCounts: alertCountsForPlant(plant.id, alertCounts),
  };
}

export function plantDetail(
  plant: PlantConfig,
  now: Date,
  alertCounts: Map<string, { critical: number; major: number; minor: number; informational: number }>,
) {
  const summary = plantSummary(plant, now, alertCounts);
  const irradiance = plantIrradiance(plant, now);
  let offlineCount = 0;
  for (let i = 0; i < plant.inverterCount; i++) {
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
  const { status } = inverterHealth(plant, idx, now);
  const reading = inverterLiveReading(plant, idx, now);
  return {
    id,
    plantId: plant.id,
    name: `Inverter ${idx + 1}`,
    status,
    acPowerKw: reading.acPowerKw,
    dcPowerKw: reading.dcPowerKw,
    acVoltageV: Math.round(reading.acVoltageV * 10) / 10,
    acCurrentA: Math.round(reading.acCurrentA * 10) / 10,
    dcVoltageV: Math.round(reading.dcVoltageV * 10) / 10,
    dcCurrentA: reading.dcVoltageV > 0 ? Math.round(((reading.dcPowerKw * 1000) / reading.dcVoltageV) * 10) / 10 : 0,
    frequencyHz: Math.round(reading.frequencyHz * 100) / 100,
    efficiencyPct: reading.efficiencyPct,
    temperatureC: reading.temperatureC,
    powerFactor: reading.acPowerKw > 0 ? 0.98 : 0,
    dailyEnergyKwh: reading.energyTodayKwh,
    monthlyEnergyKwh: Math.round(reading.energyTodayKwh * 22),
    lifetimeEnergyMwh: reading.energyLifetimeMwh,
    lastUpdated: now,
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
  const nodes = rawSld(plant, now);
  return {
    plantId: plant.id,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      status: n.status,
      parentId: n.parentId ?? null,
      powerKw: n.powerKw ?? null,
      voltageV: null,
    })),
  };
}

export { PLANTS, getPlantByInverterId, inverterIndex, inverterId };
