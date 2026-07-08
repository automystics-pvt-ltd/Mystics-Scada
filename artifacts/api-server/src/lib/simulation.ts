// Deterministic, time-seeded simulation of a solar plant fleet's live
// telemetry. No persistence is needed here: every value is derived purely
// from (entity id, current time), so repeated calls within the same
// second are stable and the whole fleet "streams" convincingly without a
// database or background workers.

export type HealthState = "normal" | "warning" | "fault" | "offline";
export type InverterStatus = "running" | "standby" | "fault" | "comm_lost";
export type TrackerType = "fixed_tilt" | "single_axis_tracker";

export interface PlantConfig {
  id: string;
  name: string;
  location: string;
  timezoneOffsetHours: number; // offset from UTC for local solar noon calc
  capacityMw: number;
  trackerType: TrackerType;
  commissionedYear: number;
  inverterCount: number;
  inverterRatingKw: number;
  stringsPerInverter: number;
  weatherStationCount: number;
  cloudinessSeed: number; // 0-1, baseline cloudiness for the region
}

export const PLANTS: PlantConfig[] = [
  {
    id: "plant-thar",
    name: "Thar Desert Solar Farm",
    location: "Jaisalmer, Rajasthan",
    timezoneOffsetHours: 5.5,
    capacityMw: 100,
    trackerType: "single_axis_tracker",
    commissionedYear: 2021,
    inverterCount: 20,
    inverterRatingKw: 3300,
    stringsPerInverter: 20,
    weatherStationCount: 3,
    cloudinessSeed: 0.08,
  },
  {
    id: "plant-sundarbans",
    name: "Sundarbans Solar Park",
    location: "South 24 Parganas, West Bengal",
    timezoneOffsetHours: 5.5,
    capacityMw: 50,
    trackerType: "fixed_tilt",
    commissionedYear: 2019,
    inverterCount: 10,
    inverterRatingKw: 3300,
    stringsPerInverter: 16,
    weatherStationCount: 2,
    cloudinessSeed: 0.32,
  },
  {
    id: "plant-deccan",
    name: "Deccan Plateau Array",
    location: "Pavagada, Karnataka",
    timezoneOffsetHours: 5.5,
    capacityMw: 30,
    trackerType: "fixed_tilt",
    commissionedYear: 2020,
    inverterCount: 6,
    inverterRatingKw: 3300,
    stringsPerInverter: 14,
    weatherStationCount: 2,
    cloudinessSeed: 0.15,
  },
  {
    id: "plant-coastal",
    name: "Coastal Ridge Plant",
    location: "Tuticorin, Tamil Nadu",
    timezoneOffsetHours: 5.5,
    capacityMw: 40,
    trackerType: "single_axis_tracker",
    commissionedYear: 2022,
    inverterCount: 8,
    inverterRatingKw: 3300,
    stringsPerInverter: 18,
    weatherStationCount: 2,
    cloudinessSeed: 0.22,
  },
];

export function getPlant(plantId: string): PlantConfig | undefined {
  return PLANTS.find((p) => p.id === plantId);
}

export function getPlantByInverterId(inverterId: string): PlantConfig | undefined {
  const plantId = inverterId.split("-inv-")[0];
  return getPlant(plantId ?? "");
}

export function inverterIndex(inverterId: string): number {
  const suffix = inverterId.split("-inv-")[1];
  return suffix ? Number.parseInt(suffix, 10) : 0;
}

export function inverterId(plantId: string, idx: number): string {
  return `${plantId}-inv-${idx}`;
}

// ---- deterministic hash / pseudo-random helpers ----

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Deterministic pseudo-random in [0,1) seeded by a string + integer bucket. */
function seededRandom(seed: string, bucket: number): number {
  const h = hashString(`${seed}:${bucket}`);
  const x = Math.sin(h * 12.9898 + bucket * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth slowly-varying noise in [-1, 1] built from a few octaves of sine. */
function smoothNoise(seed: string, timeMs: number, periodMs: number): number {
  const phase = hashString(seed) * Math.PI * 2;
  const t = timeMs / periodMs;
  return (
    Math.sin(t * Math.PI * 2 + phase) * 0.6 +
    Math.sin(t * Math.PI * 2 * 2.7 + phase * 1.3) * 0.3 +
    Math.sin(t * Math.PI * 2 * 5.1 + phase * 0.7) * 0.1
  );
}

/** Solar irradiance shape factor in [0,1] for a given local hour (decimal). */
function solarCurve(localHour: number): number {
  const sunrise = 6;
  const sunset = 18.3;
  if (localHour <= sunrise || localHour >= sunset) return 0;
  const t = (localHour - sunrise) / (sunset - sunrise);
  return Math.sin(t * Math.PI) ** 1.3;
}

export function localHour(plant: PlantConfig, date: Date): number {
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return (utcHours + plant.timezoneOffsetHours + 24) % 24;
}

/** Clear-sky irradiance (W/m^2) plus cloud attenuation for a plant at time `now`. */
export function plantIrradiance(plant: PlantConfig, now: Date): number {
  const hour = localHour(plant, now);
  const clearSky = solarCurve(hour) * 1000;
  const cloudNoise = smoothNoise(`${plant.id}:cloud`, now.getTime(), 1000 * 60 * 18);
  const cloudFactor = 1 - plant.cloudinessSeed * (0.5 + 0.5 * (cloudNoise + 1) / 2);
  return Math.max(0, clearSky * cloudFactor);
}

export function plantAmbientTempC(plant: PlantConfig, now: Date): number {
  const hour = localHour(plant, now);
  const base = 24 + 10 * solarCurve(hour);
  const drift = smoothNoise(`${plant.id}:temp`, now.getTime(), 1000 * 60 * 40) * 2;
  return base + drift;
}

export interface InverterHealth {
  status: InverterStatus;
  health: HealthState;
}

/** Deterministic-ish per-inverter fault state: mostly running, rare fault/comm_lost. */
export function inverterHealth(plant: PlantConfig, idx: number, now: Date): InverterHealth {
  const id = inverterId(plant.id, idx);
  const bucket = Math.floor(now.getTime() / (1000 * 60 * 5)); // changes every 5 min
  const roll = seededRandom(id, bucket);
  const irradiance = plantIrradiance(plant, now);

  if (irradiance < 5) {
    return { status: "standby", health: "normal" };
  }
  if (roll > 0.985) {
    return { status: "fault", health: "fault" };
  }
  if (roll > 0.965) {
    return { status: "comm_lost", health: "offline" };
  }
  if (roll > 0.9) {
    return { status: "running", health: "warning" };
  }
  return { status: "running", health: "normal" };
}

export interface InverterLiveReading {
  acPowerKw: number;
  dcPowerKw: number;
  acVoltageV: number;
  dcVoltageV: number;
  acCurrentA: number;
  frequencyHz: number;
  temperatureC: number;
  efficiencyPct: number;
  energyTodayKwh: number;
  energyLifetimeMwh: number;
}

export function inverterLiveReading(plant: PlantConfig, idx: number, now: Date): InverterLiveReading {
  const id = inverterId(plant.id, idx);
  const irradiance = plantIrradiance(plant, now);
  const { status } = inverterHealth(plant, idx, now);
  const irradianceFactor = Math.min(1, irradiance / 950);
  const unitJitter = 0.92 + seededRandom(id, Math.floor(now.getTime() / 60000)) * 0.16;

  const isProducing = status === "running" && irradiance > 5;
  const dcPowerKw = isProducing ? plant.inverterRatingKw * irradianceFactor * unitJitter * 1.03 : 0;
  const efficiencyPct = isProducing ? 96.5 + seededRandom(`${id}:eff`, Math.floor(now.getTime() / 60000)) * 2 : 0;
  const acPowerKw = isProducing ? dcPowerKw * (efficiencyPct / 100) : 0;
  const tempC = plantAmbientTempC(plant, now) + (isProducing ? 18 * irradianceFactor : 2);

  const hour = localHour(plant, now);
  const dayFractionElapsed = Math.max(0, Math.min(1, (hour - 6) / 12.3));
  const energyTodayKwh = isProducing || hour > 6
    ? plant.inverterRatingKw * 5.4 * dayFractionElapsed * (1 - plant.cloudinessSeed * 0.4)
    : 0;
  const energyLifetimeMwh =
    (plant.inverterRatingKw * 5.1 * 365 * (2026 - plant.commissionedYear + dayFractionElapsed / 365)) / 1000;

  return {
    acPowerKw: Math.round(acPowerKw * 10) / 10,
    dcPowerKw: Math.round(dcPowerKw * 10) / 10,
    acVoltageV: isProducing ? 315 + seededRandom(`${id}:v`, Math.floor(now.getTime() / 30000)) * 10 : 0,
    dcVoltageV: isProducing ? 620 + seededRandom(`${id}:dcv`, Math.floor(now.getTime() / 30000)) * 40 : 0,
    acCurrentA: isProducing ? (acPowerKw * 1000) / (3 * 315 * 0.98) : 0,
    frequencyHz: isProducing ? 49.95 + seededRandom(`${id}:hz`, Math.floor(now.getTime() / 30000)) * 0.1 : 0,
    temperatureC: Math.round(tempC * 10) / 10,
    efficiencyPct: Math.round(efficiencyPct * 10) / 10,
    energyTodayKwh: Math.round(energyTodayKwh),
    energyLifetimeMwh: Math.round(energyLifetimeMwh * 10) / 10,
  };
}

export interface StringLiveReading {
  stringId: string;
  label: string;
  currentA: number;
  voltageV: number;
  status: HealthState;
  deviationPct: number;
}

export function stringReadings(plant: PlantConfig, idx: number, now: Date): StringLiveReading[] {
  const invId = inverterId(plant.id, idx);
  const reading = inverterLiveReading(plant, idx, now);
  const baseCurrent = reading.dcPowerKw > 0 ? (reading.dcPowerKw * 1000) / plant.stringsPerInverter / 620 : 0;

  const readings: StringLiveReading[] = [];
  for (let s = 0; s < plant.stringsPerInverter; s++) {
    const stringId = `${invId}-str-${s}`;
    const bucket = Math.floor(now.getTime() / 60000);
    const jitter = 1 + (seededRandom(stringId, bucket) - 0.5) * 0.12;
    const isDegraded = seededRandom(`${stringId}:fault`, Math.floor(now.getTime() / 300000)) > 0.94;
    const currentA = baseCurrent * jitter * (isDegraded ? 0.55 : 1);
    readings.push({
      stringId,
      label: `String ${s + 1}`,
      currentA: Math.round(currentA * 100) / 100,
      voltageV: Math.round((615 + seededRandom(`${stringId}:v`, bucket) * 20) * 10) / 10,
      status: isDegraded ? "warning" : "normal",
      deviationPct: 0,
    });
  }

  const median = [...readings].map((r) => r.currentA).sort((a, b) => a - b)[Math.floor(readings.length / 2)] ?? 0;
  for (const r of readings) {
    r.deviationPct = median > 0 ? Math.round(((r.currentA - median) / median) * 1000) / 10 : 0;
    if (Math.abs(r.deviationPct) > 15 && r.status === "normal") {
      r.status = "warning";
    }
  }
  return readings;
}

export interface WeatherLiveReading {
  id: string;
  name: string;
  poaIrradianceWm2: number;
  ghiIrradianceWm2: number;
  ambientTempC: number;
  moduleTempC: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  humidityPct: number;
  rainfallMm: number;
}

export function weatherStations(plant: PlantConfig, now: Date): WeatherLiveReading[] {
  const stations: WeatherLiveReading[] = [];
  for (let i = 0; i < plant.weatherStationCount; i++) {
    const id = `${plant.id}-wx-${i}`;
    const irradiance = plantIrradiance(plant, now);
    const bucket = Math.floor(now.getTime() / 30000);
    stations.push({
      id,
      name: `Weather Station ${i + 1}`,
      poaIrradianceWm2: Math.round(irradiance * (1.02 + seededRandom(`${id}:poa`, bucket) * 0.03)),
      ghiIrradianceWm2: Math.round(irradiance * (0.94 + seededRandom(`${id}:ghi`, bucket) * 0.03)),
      ambientTempC: Math.round(plantAmbientTempC(plant, now) * 10) / 10,
      moduleTempC: Math.round((plantAmbientTempC(plant, now) + irradiance * 0.022) * 10) / 10,
      windSpeedMs: Math.round((2 + seededRandom(`${id}:wind`, bucket) * 5) * 10) / 10,
      windDirectionDeg: Math.round(seededRandom(`${id}:dir`, Math.floor(now.getTime() / 600000)) * 360),
      humidityPct: Math.round(35 + seededRandom(`${id}:hum`, bucket) * 40),
      rainfallMm: seededRandom(`${id}:rain`, Math.floor(now.getTime() / 3600000)) > 0.92
        ? Math.round(seededRandom(`${id}:rainamt`, bucket) * 8 * 10) / 10
        : 0,
    });
  }
  return stations;
}

export function plantHealth(plant: PlantConfig, now: Date): HealthState {
  let worst: HealthState = "normal";
  const rank: Record<HealthState, number> = { normal: 0, warning: 1, fault: 2, offline: 3 };
  for (let i = 0; i < plant.inverterCount; i++) {
    const { health } = inverterHealth(plant, i, now);
    if (rank[health] > rank[worst]) worst = health;
  }
  return worst;
}

export function plantLivePowerKw(plant: PlantConfig, now: Date): number {
  let total = 0;
  for (let i = 0; i < plant.inverterCount; i++) {
    total += inverterLiveReading(plant, i, now).acPowerKw;
  }
  return Math.round(total);
}

export function plantEnergyTodayKwh(plant: PlantConfig, now: Date): number {
  let total = 0;
  for (let i = 0; i < plant.inverterCount; i++) {
    total += inverterLiveReading(plant, i, now).energyTodayKwh;
  }
  return Math.round(total);
}

export function plantPrPct(plant: PlantConfig, now: Date): number {
  const bucket = Math.floor(now.getTime() / 60000);
  return Math.round((78 + seededRandom(`${plant.id}:pr`, bucket) * 8 - plant.cloudinessSeed * 5) * 10) / 10;
}

export function plantAvailabilityPct(plant: PlantConfig, now: Date): number {
  let running = 0;
  for (let i = 0; i < plant.inverterCount; i++) {
    const { status } = inverterHealth(plant, i, now);
    if (status !== "comm_lost" && status !== "fault") running++;
  }
  return Math.round((running / plant.inverterCount) * 1000) / 10;
}

export interface TrendPoint {
  timestamp: Date;
  acPowerKw: number;
  dcPowerKw: number;
  temperatureC: number;
  efficiencyPct: number;
}

export function inverterTrend(plant: PlantConfig, idx: number, range: "hour" | "day" | "week" | "month", now: Date): TrendPoint[] {
  const spec = {
    hour: { points: 60, stepMs: 60 * 1000 },
    day: { points: 96, stepMs: 15 * 60 * 1000 },
    week: { points: 7 * 24, stepMs: 60 * 60 * 1000 },
    month: { points: 30, stepMs: 24 * 60 * 60 * 1000 },
  }[range];

  const points: TrendPoint[] = [];
  for (let i = spec.points - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * spec.stepMs);
    const reading = inverterLiveReading(plant, idx, t);
    points.push({
      timestamp: t,
      acPowerKw: reading.acPowerKw,
      dcPowerKw: reading.dcPowerKw,
      temperatureC: reading.temperatureC,
      efficiencyPct: reading.efficiencyPct,
    });
  }
  return points;
}

export interface YieldPoint {
  date: string;
  actualKwh: number;
  expectedKwh: number;
  specificYieldKwhPerKwp: number;
}

export function plantYieldSeries(plant: PlantConfig, period: "daily" | "weekly" | "monthly" | "yearly", now: Date): YieldPoint[] {
  const spec = {
    daily: { points: 14, stepDays: 1, label: (d: Date) => d.toISOString().slice(0, 10) },
    weekly: { points: 12, stepDays: 7, label: (d: Date) => `Week of ${d.toISOString().slice(0, 10)}` },
    monthly: { points: 12, stepDays: 30, label: (d: Date) => d.toISOString().slice(0, 7) },
    yearly: { points: 5, stepDays: 365, label: (d: Date) => `${d.getUTCFullYear()}` },
  }[period];

  const capacityKw = plant.capacityMw * 1000;
  const points: YieldPoint[] = [];
  for (let i = spec.points - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * spec.stepDays * 24 * 60 * 60 * 1000);
    const bucket = Math.floor(d.getTime() / (24 * 60 * 60 * 1000));
    const seasonFactor = 0.85 + 0.3 * Math.max(0, Math.sin((d.getUTCMonth() / 12) * Math.PI * 2 + 1.2));
    const dayFactor = 0.75 + seededRandom(`${plant.id}:yield`, bucket) * 0.4 - plant.cloudinessSeed * 0.3;
    const expectedKwh = capacityKw * 5.2 * spec.stepDays * seasonFactor;
    const actualKwh = expectedKwh * Math.max(0.4, Math.min(1.05, dayFactor));
    points.push({
      date: spec.label(d),
      actualKwh: Math.round(actualKwh),
      expectedKwh: Math.round(expectedKwh),
      specificYieldKwhPerKwp: Math.round((actualKwh / capacityKw) * 100) / 100,
    });
  }
  return points;
}

export interface PerformanceSnapshot {
  prTrend: { date: string; prPct: number; targetPct: number }[];
  availabilityPct: number;
  gridAvailabilityPct: number;
  lossBreakdown: { category: string; lossPct: number }[];
}

export function plantPerformance(plant: PlantConfig, now: Date): PerformanceSnapshot {
  const prTrend = [] as { date: string; prPct: number; targetPct: number }[];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const bucket = Math.floor(d.getTime() / (24 * 60 * 60 * 1000));
    const pr = 78 + seededRandom(`${plant.id}:prtrend`, bucket) * 10 - plant.cloudinessSeed * 6;
    prTrend.push({ date: d.toISOString().slice(0, 10), prPct: Math.round(pr * 10) / 10, targetPct: 82 });
  }

  return {
    prTrend,
    availabilityPct: plantAvailabilityPct(plant, now),
    gridAvailabilityPct: Math.round((99.2 - plant.cloudinessSeed * 1.5) * 10) / 10,
    lossBreakdown: [
      { category: "Soiling", lossPct: Math.round((1.5 + plant.cloudinessSeed * 2) * 10) / 10 },
      { category: "Shading", lossPct: 0.8 },
      { category: "Temperature", lossPct: 3.2 },
      { category: "Downtime", lossPct: Math.round((100 - plantAvailabilityPct(plant, now)) * 10) / 10 },
      { category: "Curtailment", lossPct: 0.6 },
      { category: "Inverter Clipping", lossPct: 1.1 },
    ],
  };
}

export interface RevenueSnapshot {
  currency: string;
  todayRevenue: number;
  monthToDateRevenue: number;
  yearToDateRevenue: number;
  co2AvoidedTonnesToday: number;
  co2AvoidedTonnesLifetime: number;
  tariffPerKwh: number;
}

export function plantRevenue(plant: PlantConfig, now: Date): RevenueSnapshot {
  const tariffPerKwh = 3.4;
  const todayKwh = plantEnergyTodayKwh(plant, now);
  const capacityKw = plant.capacityMw * 1000;
  const monthDays = now.getUTCDate();
  const yearDays = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / (24 * 60 * 60 * 1000)) + 1;

  return {
    currency: "INR",
    todayRevenue: Math.round(todayKwh * tariffPerKwh),
    monthToDateRevenue: Math.round(capacityKw * 4.8 * monthDays * tariffPerKwh * (1 - plant.cloudinessSeed * 0.3)),
    yearToDateRevenue: Math.round(capacityKw * 4.6 * yearDays * tariffPerKwh * (1 - plant.cloudinessSeed * 0.3)),
    co2AvoidedTonnesToday: Math.round(todayKwh * 0.00082 * 100) / 100,
    co2AvoidedTonnesLifetime: Math.round(capacityKw * 5 * 365 * (2026 - plant.commissionedYear) * 0.00082),
    tariffPerKwh,
  };
}

export interface SldNode {
  id: string;
  label: string;
  type: "panel_array" | "combiner" | "inverter" | "transformer" | "switchyard" | "grid";
  status: HealthState;
  powerKw?: number;
  voltageV?: number;
  currentA?: number;
  breakerState?: "closed" | "open";
  parentId?: string;
  /** Number of strings in a fault/warning state. Only set for combiner nodes. */
  stringFaultCount?: number;
}

export interface SldEdge {
  id: string;
  fromId: string;
  toId: string;
  powerKw: number;
  energized: boolean;
}

export interface SldTopology {
  nodes: SldNode[];
  edges: SldEdge[];
}

// Three-phase current for a given active power and line voltage.
function threePhaseCurrentA(powerKw: number, voltageV: number): number {
  if (voltageV <= 0) return 0;
  return (powerKw * 1000) / (Math.sqrt(3) * voltageV);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function plantSld(plant: PlantConfig, now: Date): SldTopology {
  const nodes: SldNode[] = [];
  const edges: SldEdge[] = [];

  const gridVoltageV = plant.capacityMw >= 50 ? 132_000 : 33_000;
  // Worst-case inverter health drives node status/coloring, but the grid
  // interconnection breaker should only trip when the entire plant is
  // disconnected (every inverter offline) — a single faulted/offline
  // inverter must not falsely show the whole plant tripped off the grid.
  const plantHealthStatus = plantHealth(plant, now);
  const plantWarningOrWorse = plantHealthStatus !== "normal";

  const arrayId = `${plant.id}-array`;
  nodes.push({ id: arrayId, label: "PV Array", type: "panel_array", status: "normal" });

  const combinerCount = Math.max(2, Math.ceil(plant.inverterCount / 4));
  const combinerPowerKw = new Array<number>(combinerCount).fill(0);
  const combinerStringFaults = new Array<number>(combinerCount).fill(0);

  const inverterReadings = Array.from({ length: plant.inverterCount }, (_, i) => ({
    health: inverterHealth(plant, i, now).health,
    reading: inverterLiveReading(plant, i, now),
  }));

  inverterReadings.forEach(({ reading }, i) => {
    combinerPowerKw[i % combinerCount] += reading.dcPowerKw;
  });

  // Tally string faults per combiner (strings with status !== "normal")
  for (let i = 0; i < plant.inverterCount; i++) {
    const strings = stringReadings(plant, i, now);
    const faults = strings.filter((s) => s.status !== "normal").length;
    combinerStringFaults[i % combinerCount] += faults;
  }

  for (let c = 0; c < combinerCount; c++) {
    const combId = `${plant.id}-comb-${c}`;
    const powerKw = round1(combinerPowerKw[c]);
    const dcBusVoltageV = 630;
    nodes.push({
      id: combId,
      label: `Combiner Box ${c + 1}`,
      type: "combiner",
      status: "normal",
      powerKw,
      voltageV: dcBusVoltageV,
      currentA: powerKw > 0 ? round1((powerKw * 1000) / dcBusVoltageV) : 0,
      parentId: arrayId,
      stringFaultCount: combinerStringFaults[c],
    });
    edges.push({
      id: `${arrayId}->${combId}`,
      fromId: arrayId,
      toId: combId,
      powerKw,
      energized: powerKw > 0,
    });
  }

  let transformerInputKw = 0;
  const xfmrId = `${plant.id}-xfmr`;

  inverterReadings.forEach(({ health, reading }, i) => {
    const invId = inverterId(plant.id, i);
    const combId = `${plant.id}-comb-${i % combinerCount}`;
    const powerKw = reading.acPowerKw;
    transformerInputKw += powerKw;
    nodes.push({
      id: invId,
      label: `Inverter ${i + 1}`,
      type: "inverter",
      status: health,
      powerKw,
      voltageV: reading.acVoltageV > 0 ? round1(reading.acVoltageV) : undefined,
      currentA: reading.acVoltageV > 0 ? round1(threePhaseCurrentA(powerKw, reading.acVoltageV)) : 0,
      parentId: combId,
    });
    edges.push({
      id: `${combId}->${invId}`,
      fromId: combId,
      toId: invId,
      powerKw: round1(powerKw),
      energized: powerKw > 0,
    });
    edges.push({
      id: `${invId}->${xfmrId}`,
      fromId: invId,
      toId: xfmrId,
      powerKw: round1(powerKw),
      energized: powerKw > 0,
    });
  });

  const totalPowerKw = round1(plantLivePowerKw(plant, now));
  const xfmrCurrentA = round1(threePhaseCurrentA(totalPowerKw, gridVoltageV));

  // The grid breaker only trips when every inverter is disconnected — a
  // single faulted/offline inverter should not falsely show the whole plant
  // tripped off the grid, since the rest of the plant may still be exporting.
  const allInvertersOffline = plant.inverterCount > 0 && inverterReadings.every(({ health }) => health === "offline");
  const gridBreakerOpen = allInvertersOffline;

  nodes.push({
    id: xfmrId,
    label: "Step-up Transformer",
    type: "transformer",
    status: gridBreakerOpen ? "offline" : plantWarningOrWorse ? "warning" : "normal",
    powerKw: totalPowerKw,
    voltageV: gridVoltageV,
    currentA: xfmrCurrentA,
  });

  const switchyardId = `${plant.id}-switchyard`;
  nodes.push({
    id: switchyardId,
    label: "Switchyard",
    type: "switchyard",
    status: gridBreakerOpen ? "offline" : plantWarningOrWorse ? "warning" : "normal",
    powerKw: totalPowerKw,
    voltageV: gridVoltageV,
    currentA: xfmrCurrentA,
    breakerState: gridBreakerOpen ? "open" : "closed",
    parentId: xfmrId,
  });
  edges.push({
    id: `${xfmrId}->${switchyardId}`,
    fromId: xfmrId,
    toId: switchyardId,
    powerKw: totalPowerKw,
    energized: !gridBreakerOpen && totalPowerKw > 0,
  });

  const gridId = `${plant.id}-grid`;
  nodes.push({
    id: gridId,
    label: "Grid Interconnection",
    type: "grid",
    status: gridBreakerOpen ? "offline" : "normal",
    powerKw: totalPowerKw,
    voltageV: gridVoltageV,
    currentA: xfmrCurrentA,
    breakerState: gridBreakerOpen ? "open" : "closed",
    parentId: switchyardId,
  });
  edges.push({
    id: `${switchyardId}->${gridId}`,
    fromId: switchyardId,
    toId: gridId,
    powerKw: totalPowerKw,
    energized: !gridBreakerOpen && totalPowerKw > 0,
  });

  return { nodes, edges };
}
