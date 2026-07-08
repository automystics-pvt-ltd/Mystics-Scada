// Rule-based AI insights engine.
// Runs entirely in-memory over simulation data — no external LLM required.

import type { PlantConfig } from "./simulation";
import {
  getOrgPlants,
  inverterId,
  inverterHealth,
  inverterLiveReading,
  stringReadings,
  plantIrradiance,
  plantLivePowerKw,
  plantAvailabilityPct,
  inverterTrend,
} from "./simulation";

export type InsightType =
  | "underperforming_inverter"
  | "string_deviation"
  | "irradiance_gap"
  | "health_decline"
  | "temperature_trend";

export type InsightSeverity = "critical" | "warning" | "info";

export interface SparkPoint {
  label: string;
  value: number;
  ref?: number;
}

export interface InsightSparkline {
  type: "line" | "bar" | "area";
  metric: string;
  unit: string;
  points: SparkPoint[];
}

export interface Insight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  plantId: string;
  plantName: string;
  deviceId?: string;
  deviceName?: string;
  title: string;
  explanation: string;
  recommendedAction: string;
  energyImpactKwhPerDay: number;
  confidencePct: number;
  sparkline: InsightSparkline;
  detectedAt: string; // ISO string
}

/** Stable day-scoped ID — dismissed insights stay dismissed until midnight. */
function makeId(type: string, plantId: string, deviceId: string | undefined, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  return `${type}__${plantId}__${deviceId ?? "plant"}__${day}`;
}

// ── Rule 1: Underperforming Inverter ─────────────────────────────────────────
// Detects inverters whose conversion efficiency has fallen >2.5 % below the
// fleet median during active generation hours.

function runUnderperformingInverterRule(plant: PlantConfig, now: Date): Insight[] {
  const irradiance = plantIrradiance(plant, now);
  if (irradiance < 250) return [];

  const running: { idx: number; efficiency: number; acPowerKw: number }[] = [];
  for (let i = 0; i < plant.inverterCount; i++) {
    const { status } = inverterHealth(plant, i, now);
    if (status !== "running") continue;
    const r = inverterLiveReading(plant, i, now);
    if (r.acPowerKw < 10) continue;
    running.push({ idx: i, efficiency: r.efficiencyPct, acPowerKw: r.acPowerKw });
  }
  if (running.length < 3) return [];

  const sortedEff = [...running].sort((a, b) => a.efficiency - b.efficiency);
  const medianEff = sortedEff[Math.floor(sortedEff.length / 2)]!.efficiency;
  const sortedPwr = [...running].sort((a, b) => a.acPowerKw - b.acPowerKw);
  const medianPwr = sortedPwr[Math.floor(sortedPwr.length / 2)]!.acPowerKw;

  const underperformers = running
    .map(inv => ({ ...inv, delta: medianEff - inv.efficiency }))
    .filter(inv => inv.delta > 2.5)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 2);

  return underperformers.map(inv => {
    const severity: InsightSeverity = inv.delta > 4.5 ? "critical" : "warning";
    const energyImpact = Math.max(0, Math.round((medianPwr - inv.acPowerKw) * 6));

    // Hourly efficiency sparkline vs fleet median (last 12 h)
    const trend = inverterTrend(plant, inv.idx, "day", now);
    const sparkPoints: SparkPoint[] = trend
      .filter((_, i) => i % 4 === 0)
      .slice(-12)
      .map(p => ({
        label: `${p.timestamp.getUTCHours()}h`,
        value: Math.round(p.efficiencyPct * 10) / 10,
        ref: Math.round(medianEff * 10) / 10,
      }));

    const invName = `Inverter ${inv.idx + 1}`;
    return {
      id: makeId("underperforming_inverter", plant.id, inverterId(plant.id, inv.idx), now),
      type: "underperforming_inverter" as InsightType,
      severity,
      plantId: plant.id,
      plantName: plant.name,
      deviceId: inverterId(plant.id, inv.idx),
      deviceName: invName,
      title: `${invName} efficiency ${inv.delta.toFixed(1)}% below fleet median`,
      explanation: `${invName} is converting at ${inv.efficiency.toFixed(1)}% while the fleet median is ${medianEff.toFixed(1)}%. A sustained gap above 2.5% typically points to degraded DC-side connections, localised soiling, or early-stage IGBT stress. Left unaddressed, this costs approximately ${energyImpact.toLocaleString()} kWh per day.`,
      recommendedAction: `Inspect DC string terminals and junction boxes feeding ${invName}. Use the String Diagnostics page to identify deviant strings. If strings look normal, schedule a thermographic scan and review IGBT gate-drive diagnostics.`,
      energyImpactKwhPerDay: energyImpact,
      confidencePct: Math.min(95, Math.round(78 + inv.delta * 3)),
      sparkline: { type: "line", metric: "Efficiency", unit: "%", points: sparkPoints },
      detectedAt: now.toISOString(),
    };
  });
}

// ── Rule 2: String Current Deviation ─────────────────────────────────────────
// Fires when ≥ 2 strings on the same inverter are >15% below their siblings.

function runStringDeviationRule(plant: PlantConfig, now: Date): Insight[] {
  const irradiance = plantIrradiance(plant, now);
  if (irradiance < 200) return [];

  const insights: Insight[] = [];
  let inverterCount = 0;

  for (let i = 0; i < plant.inverterCount && inverterCount < 3; i++) {
    const { status } = inverterHealth(plant, i, now);
    if (status !== "running") continue;
    const r = inverterLiveReading(plant, i, now);
    if (r.acPowerKw < 10) continue;

    const strings = stringReadings(plant, i, now);
    const deviant = strings.filter(s => s.deviationPct < -15);
    if (deviant.length < 2) continue;

    inverterCount++;
    const worstDev = Math.abs(Math.min(...deviant.map(s => s.deviationPct)));
    const severity: InsightSeverity = worstDev > 30 ? "critical" : "warning";

    const medianCurrent = strings[Math.floor(strings.length / 2)]?.currentA ?? 0;
    const lostCurrent = deviant.reduce((sum, s) => sum + Math.max(0, medianCurrent - s.currentA), 0);
    const energyImpact = Math.round(lostCurrent * 620 / 1000 * 6);

    const sparkPoints: SparkPoint[] = strings.map((s, si) => ({
      label: `S${si + 1}`,
      value: Math.round(s.currentA * 100) / 100,
      ref: Math.round(medianCurrent * 100) / 100,
    }));

    const invName = `Inverter ${i + 1}`;
    insights.push({
      id: makeId("string_deviation", plant.id, inverterId(plant.id, i), now),
      type: "string_deviation",
      severity,
      plantId: plant.id,
      plantName: plant.name,
      deviceId: inverterId(plant.id, i),
      deviceName: invName,
      title: `${deviant.length} strings deviating >15% on ${invName}`,
      explanation: `${deviant.length} of ${strings.length} strings feeding ${invName} are producing more than 15% below the median current of ${medianCurrent.toFixed(2)} A. The worst string is at ${worstDev.toFixed(1)}% deviation. Common causes include partial shading, soiling, bypass diode failure, or loose connections on the affected strings.`,
      recommendedAction: `Check fuse continuity in the combiner box for ${invName}, inspect for soiling or shading at module level, and verify bypass diodes. Use the String Diagnostics page to track trends before and after cleaning.`,
      energyImpactKwhPerDay: energyImpact,
      confidencePct: Math.min(93, Math.round(72 + deviant.length * 4)),
      sparkline: { type: "bar", metric: "String Current", unit: "A", points: sparkPoints },
      detectedAt: now.toISOString(),
    });
  }

  return insights;
}

// ── Rule 3: Irradiance-Adjusted Generation Gap ───────────────────────────────
// Compares actual plant output against the irradiance-adjusted expectation.

function runIrradianceGapRule(plant: PlantConfig, now: Date): Insight[] {
  const irradiance = plantIrradiance(plant, now);
  if (irradiance < 300) return [];

  const expectedKw = (irradiance / 1000) * plant.capacityMw * 1000 * 0.78;
  const actualKw = plantLivePowerKw(plant, now);
  const gapPct = expectedKw > 0 ? ((expectedKw - actualKw) / expectedKw) * 100 : 0;
  if (gapPct < 22) return [];

  const severity: InsightSeverity = gapPct > 38 ? "critical" : "warning";
  const energyImpact = Math.round((expectedKw - actualKw) * 6);

  // Expected vs actual every 30 min over last 6 h
  const sparkPoints: SparkPoint[] = [];
  for (let h = 11; h >= 0; h--) {
    const t = new Date(now.getTime() - h * 30 * 60 * 1000);
    const irr = plantIrradiance(plant, t);
    const exp = Math.round((irr / 1000) * plant.capacityMw * 1000 * 0.78);
    const act = plantLivePowerKw(plant, t);
    sparkPoints.push({
      label: `${t.getUTCHours()}:${String(t.getUTCMinutes()).padStart(2, "0")}`,
      value: act,
      ref: exp,
    });
  }

  return [{
    id: makeId("irradiance_gap", plant.id, undefined, now),
    type: "irradiance_gap",
    severity,
    plantId: plant.id,
    plantName: plant.name,
    title: `Generation ${gapPct.toFixed(0)}% below irradiance-adjusted target`,
    explanation: `Given current irradiance of ${irradiance.toFixed(0)} W/m² and ${plant.capacityMw} MWp installed, expected output is ~${(expectedKw / 1000).toFixed(1)} MW. Actual is ${(actualKw / 1000).toFixed(1)} MW — a ${gapPct.toFixed(1)}% gap that exceeds the 22% alert threshold. This cannot be explained by cloud attenuation alone and suggests systematic underperformance.`,
    recommendedAction: `Check the inverter list for offline or faulted units. Compare DC input voltage across combiners for systematic string issues. Verify the plant is not grid-curtailed and confirm tracker alignment if applicable.`,
    energyImpactKwhPerDay: energyImpact,
    confidencePct: Math.min(92, Math.round(65 + gapPct * 0.7)),
    sparkline: { type: "area", metric: "Power", unit: "kW", points: sparkPoints },
    detectedAt: now.toISOString(),
  }];
}

// ── Rule 4: Equipment Health Score Decline ───────────────────────────────────
// Detects plants where availability has trended down >3 % over 7 days.

function runHealthDeclineRule(plant: PlantConfig, now: Date): Insight[] {
  const daily: { label: string; value: number }[] = [];
  for (let d = 6; d >= 0; d--) {
    const t = new Date(now.getTime() - d * 24 * 3600 * 1000);
    const noon = new Date(t);
    noon.setUTCHours(7, 0, 0, 0); // ≈ solar noon IST
    const avail = plantAvailabilityPct(plant, noon);
    daily.push({ label: t.toISOString().slice(5, 10), value: avail });
  }

  const first3 = (daily[0]!.value + daily[1]!.value + daily[2]!.value) / 3;
  const last3 = (daily[4]!.value + daily[5]!.value + daily[6]!.value) / 3;
  const decline = first3 - last3;
  if (decline < 3) return [];

  const severity: InsightSeverity = decline > 7 ? "critical" : "warning";
  const energyImpact = Math.round((decline / 100) * plant.capacityMw * 1000 * 6);

  const sparkPoints: SparkPoint[] = daily.map(d => ({
    label: d.label,
    value: Math.round(d.value * 10) / 10,
    ref: 95,
  }));

  return [{
    id: makeId("health_decline", plant.id, undefined, now),
    type: "health_decline",
    severity,
    plantId: plant.id,
    plantName: plant.name,
    title: `Plant availability declined ${decline.toFixed(1)}% over 7 days`,
    explanation: `Average inverter availability at ${plant.name} has fallen from ${first3.toFixed(1)}% (3 days ago) to ${last3.toFixed(1)}% today — a ${decline.toFixed(1)} pp decline. A consistent downward trend indicates inverters are faulting more frequently or remaining offline longer, possibly due to worsening DC-side conditions, a recurring grid event, or communication infrastructure issues.`,
    recommendedAction: `Review the inverter fault log for recurrent faults over the past week. Check SCADA gateway health and inverter communication channels. If multiple inverters share the same DC feeder, inspect common components — fuses, SPD units, and DC isolators — for thermal stress.`,
    energyImpactKwhPerDay: energyImpact,
    confidencePct: Math.min(90, Math.round(68 + decline * 2.5)),
    sparkline: { type: "line", metric: "Availability", unit: "%", points: sparkPoints },
    detectedAt: now.toISOString(),
  }];
}

// ── Rule 5: Predictive Maintenance — Temperature Rising Trend ────────────────
// Fires when an inverter's temperature exceeds 62°C and is rising at ≥ 0.3°C
// per minute, suggesting cooling system degradation.

function runTemperatureTrendRule(plant: PlantConfig, now: Date): Insight[] {
  const irradiance = plantIrradiance(plant, now);
  if (irradiance < 200) return [];

  const hot: { idx: number; currentTemp: number; slope: number; sparkPoints: SparkPoint[] }[] = [];

  for (let i = 0; i < plant.inverterCount; i++) {
    const { status } = inverterHealth(plant, i, now);
    if (status !== "running") continue;
    const r = inverterLiveReading(plant, i, now);
    if (r.temperatureC < 62) continue;

    const trend = inverterTrend(plant, i, "hour", now);
    const sampled = trend.filter((_, ti) => ti % 5 === 0); // every 5 min
    if (sampled.length < 4) continue;

    const last4 = sampled.slice(-4);
    const slope = (last4[3]!.temperatureC - last4[0]!.temperatureC) / 3;
    if (slope < 0.3) continue;

    const sparkPoints: SparkPoint[] = sampled.map(p => ({
      label: `${p.timestamp.getUTCHours()}:${String(p.timestamp.getUTCMinutes()).padStart(2, "0")}`,
      value: Math.round(p.temperatureC * 10) / 10,
      ref: 65,
    }));

    hot.push({ idx: i, currentTemp: r.temperatureC, slope, sparkPoints });
  }

  return hot
    .sort((a, b) => b.slope - a.slope)
    .slice(0, 2)
    .map(h => {
      const severity: InsightSeverity = h.currentTemp > 72 ? "critical" : "warning";
      const ratePerHour = (h.slope * 12).toFixed(1);
      const invName = `Inverter ${h.idx + 1}`;

      return {
        id: makeId("temperature_trend", plant.id, inverterId(plant.id, h.idx), now),
        type: "temperature_trend" as InsightType,
        severity,
        plantId: plant.id,
        plantName: plant.name,
        deviceId: inverterId(plant.id, h.idx),
        deviceName: invName,
        title: `${invName} temperature rising — ${h.currentTemp.toFixed(1)}°C`,
        explanation: `${invName} internal temperature is ${h.currentTemp.toFixed(1)}°C and rising at ~${ratePerHour}°C/hr. Temperatures above 70°C accelerate IGBT degradation and may trigger thermal de-rating, reducing AC output. Sustained operation above 80°C risks sudden shutdown and permanent damage.`,
        recommendedAction: `Inspect the inverter cooling system: check air filters for blockage, verify fans spin at rated RPM, and confirm ambient temperature in the inverter enclosure is within spec. If active cooling is fitted, check coolant levels and pump operation.`,
        energyImpactKwhPerDay: Math.max(0, Math.round((h.currentTemp - 65) * 0.5 * plant.inverterRatingKw * 6 / 1000)),
        confidencePct: Math.min(91, Math.round(72 + (h.currentTemp - 62) * 2.5)),
        sparkline: { type: "line", metric: "Temperature", unit: "°C", points: h.sparkPoints },
        detectedAt: now.toISOString(),
      };
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateInsights(
  orgId: string | null,
  now: Date,
  plantIdFilter?: string,
): Insight[] {
  let plants = getOrgPlants(orgId);
  if (plantIdFilter) plants = plants.filter(p => p.id === plantIdFilter);

  const all: Insight[] = [];
  for (const plant of plants) {
    all.push(...runUnderperformingInverterRule(plant, now));
    all.push(...runStringDeviationRule(plant, now));
    all.push(...runIrradianceGapRule(plant, now));
    all.push(...runHealthDeclineRule(plant, now));
    all.push(...runTemperatureTrendRule(plant, now));
  }

  const rank = { critical: 0, warning: 1, info: 2 };
  return all.sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return b.energyImpactKwhPerDay - a.energyImpactKwhPerDay;
  });
}

/** Summary counts — used by portfolio widget. */
export function insightsSummary(orgId: string | null, now: Date) {
  const all = generateInsights(orgId, now);
  return {
    total: all.length,
    critical: all.filter(i => i.severity === "critical").length,
    warning: all.filter(i => i.severity === "warning").length,
    info: all.filter(i => i.severity === "info").length,
  };
}
