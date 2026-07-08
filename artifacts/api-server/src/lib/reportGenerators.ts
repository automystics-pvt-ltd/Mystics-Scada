/**
 * Report data generation and serialisation.
 * All data is computed deterministically from the simulation layer — no file
 * storage is required; reports are regenerated on every download request.
 */

import PDFDocument from "pdfkit";
import {
  type PlantConfig,
  plantEnergyTodayKwh,
  plantPrPct,
  plantAvailabilityPct,
  inverterLiveReading,
  inverterHealth,
  stringReadings,
  weatherStations,
  plantRevenue,
  plantIrradiance,
} from "./simulation";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReportTable {
  title?: string;
  headers: string[];
  rows: (string | number | null)[][];
}

export interface ReportKpi {
  label: string;
  value: string;
  unit?: string;
}

export interface ReportDataResult {
  reportType: string;
  title: string;
  subtitle: string;
  dateFrom: Date;
  dateTo: Date;
  kpis: ReportKpi[];
  tables: ReportTable[];
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export const REPORT_TYPE_CATALOG = [
  {
    id: "energy_generation",
    name: "Energy Generation",
    description: "Daily kWh output vs target, capacity utilization factor, and generation trends across the period.",
    icon: "Zap",
    category: "Generation",
  },
  {
    id: "yield_analysis",
    name: "Yield Analysis",
    description: "Specific yield (kWh/kWp), actual vs expected generation, and deviation from plan.",
    icon: "TrendingUp",
    category: "Generation",
  },
  {
    id: "pr_cuf",
    name: "PR & CUF Report",
    description: "Performance Ratio and Capacity Utilization Factor trends with daily resolution.",
    icon: "Gauge",
    category: "Performance",
  },
  {
    id: "equipment_performance",
    name: "Equipment Performance",
    description: "Fleet-wide inverter availability, uptime statistics, and fault frequency analysis.",
    icon: "Activity",
    category: "Performance",
  },
  {
    id: "inverter_report",
    name: "Inverter Report",
    description: "Per-inverter AC/DC readings, efficiency, temperature, and daily energy output.",
    icon: "Cpu",
    category: "Equipment",
  },
  {
    id: "string_report",
    name: "String Report",
    description: "Current and voltage readings for each PV string with deviation from median.",
    icon: "GitBranch",
    category: "Equipment",
  },
  {
    id: "weather_report",
    name: "Weather Report",
    description: "Irradiance (POA/GHI), ambient and module temperature, wind, and humidity data.",
    icon: "Cloud",
    category: "Environmental",
  },
  {
    id: "alarm_report",
    name: "Alarm Report",
    description: "Alarm events grouped by severity and plant with simulated historical counts.",
    icon: "Bell",
    category: "Operations",
  },
  {
    id: "downtime_report",
    name: "Downtime Report",
    description: "Plant and inverter availability, downtime duration, and energy loss estimation.",
    icon: "Clock",
    category: "Operations",
  },
  {
    id: "maintenance_report",
    name: "Maintenance Report",
    description: "Work orders summary — planned vs unplanned maintenance, priority, and completion rate.",
    icon: "Wrench",
    category: "Operations",
  },
  {
    id: "financial_report",
    name: "Financial Report",
    description: "Revenue generated, tariff analysis, and earnings per plant over the reporting period.",
    icon: "DollarSign",
    category: "Financial",
  },
  {
    id: "carbon_offset",
    name: "Carbon Offset Report",
    description: "CO₂ avoided, equivalent trees planted, and homes powered summary.",
    icon: "Leaf",
    category: "Environmental",
  },
] as const;

export type ReportTypeId = (typeof REPORT_TYPE_CATALOG)[number]["id"];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Sample one date per day between dateFrom and dateTo, at 13:00 UTC (end of solar day). */
function sampleDates(dateFrom: Date, dateTo: Date, maxPoints = 90): Date[] {
  const dates: Date[] = [];
  const cur = new Date(dateFrom);
  cur.setUTCHours(13, 0, 0, 0);
  const end = new Date(dateTo);
  end.setUTCHours(23, 59, 59, 999);
  const totalDays = Math.ceil((end.getTime() - cur.getTime()) / 86_400_000) + 1;
  const step = Math.max(1, Math.ceil(totalDays / maxPoints));
  while (cur <= end) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + step);
  }
  return dates;
}

function dateLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Generators per report type ─────────────────────────────────────────────────

function genEnergyGeneration(plants: PlantConfig[], dates: Date[]): ReportDataResult {
  const rows: (string | number | null)[][] = [];
  let totalActual = 0;
  let totalExpected = 0;

  for (const d of dates) {
    for (const p of plants) {
      const actual = plantEnergyTodayKwh(p, d);
      const expected = Math.round(p.capacityMw * 1000 * 5.4);
      const cuf = Math.round((actual / (p.capacityMw * 1000 * 24)) * 1000) / 10;
      const ach = expected > 0 ? Math.round((actual / expected) * 1000) / 10 : 0;
      totalActual += actual;
      totalExpected += expected;
      rows.push([dateLabel(d), p.name, fmt(p.capacityMw * 1000), fmt(actual), fmt(expected), `${cuf}%`, `${ach}%`]);
    }
  }

  const avgDaily = dates.length > 0 ? Math.round(totalActual / dates.length / plants.length) : 0;
  const ach = totalExpected > 0 ? Math.round((totalActual / totalExpected) * 1000) / 10 : 0;

  return {
    reportType: "energy_generation",
    title: "Energy Generation Report",
    subtitle: `${plants.length} plant${plants.length !== 1 ? "s" : ""} · ${dates.length} day period`,
    dateFrom: dates[0] ?? new Date(),
    dateTo: dates[dates.length - 1] ?? new Date(),
    kpis: [
      { label: "Total Generation", value: fmt(Math.round(totalActual / 1000)), unit: "MWh" },
      { label: "Avg Daily", value: fmt(avgDaily), unit: "kWh" },
      { label: "Achievement", value: `${ach}%`, unit: "vs target" },
      { label: "Plants", value: String(plants.length), unit: "sites" },
    ],
    tables: [{
      headers: ["Date", "Plant", "Capacity (kW)", "Generation (kWh)", "Target (kWh)", "CUF (%)", "Achievement"],
      rows,
    }],
  };
}

function genYieldAnalysis(plants: PlantConfig[], dates: Date[]): ReportDataResult {
  const rows: (string | number | null)[][] = [];
  let totalSpecific = 0, count = 0;

  for (const d of dates) {
    for (const p of plants) {
      const actual = plantEnergyTodayKwh(p, d);
      const capKw = p.capacityMw * 1000;
      const expected = Math.round(capKw * 5.4);
      const specific = Math.round((actual / capKw) * 100) / 100;
      const dev = expected > 0 ? Math.round(((actual - expected) / expected) * 1000) / 10 : 0;
      totalSpecific += specific;
      count++;
      rows.push([dateLabel(d), p.name, fmt(actual), fmt(expected), specific, `${dev}%`]);
    }
  }

  return {
    reportType: "yield_analysis",
    title: "Yield Analysis Report",
    subtitle: `Actual vs expected generation`,
    dateFrom: dates[0] ?? new Date(),
    dateTo: dates[dates.length - 1] ?? new Date(),
    kpis: [
      { label: "Avg Specific Yield", value: fmt(count > 0 ? Math.round((totalSpecific / count) * 100) / 100 : 0, 2), unit: "kWh/kWp" },
      { label: "Period", value: String(dates.length), unit: "days sampled" },
      { label: "Plants", value: String(plants.length), unit: "sites" },
    ],
    tables: [{
      headers: ["Date", "Plant", "Actual (kWh)", "Expected (kWh)", "Specific Yield (kWh/kWp)", "Deviation"],
      rows,
    }],
  };
}

function genPrCuf(plants: PlantConfig[], dates: Date[]): ReportDataResult {
  const rows: (string | number | null)[][] = [];
  let prSum = 0, count = 0;

  for (const d of dates) {
    for (const p of plants) {
      const pr = plantPrPct(p, d);
      const avail = plantAvailabilityPct(p, d);
      const actual = plantEnergyTodayKwh(p, d);
      const cuf = Math.round((actual / (p.capacityMw * 1000 * 24)) * 1000) / 10;
      prSum += pr;
      count++;
      rows.push([dateLabel(d), p.name, pr, 82, Math.round((pr - 82) * 10) / 10, cuf, avail]);
    }
  }

  return {
    reportType: "pr_cuf",
    title: "PR & CUF Report",
    subtitle: "Performance Ratio and Capacity Utilization Factor",
    dateFrom: dates[0] ?? new Date(),
    dateTo: dates[dates.length - 1] ?? new Date(),
    kpis: [
      { label: "Average PR", value: `${fmt(count > 0 ? Math.round(prSum / count * 10) / 10 : 0, 1)}%`, unit: "period avg" },
      { label: "Target PR", value: "82.0%", unit: "threshold" },
    ],
    tables: [{
      headers: ["Date", "Plant", "PR (%)", "Target PR (%)", "Deviation", "CUF (%)", "Availability (%)"],
      rows,
    }],
  };
}

function genEquipmentPerformance(plants: PlantConfig[], now: Date): ReportDataResult {
  const rows: (string | number | null)[][] = [];
  let totalRunning = 0, totalFault = 0, totalInverters = 0;

  for (const p of plants) {
    for (let i = 0; i < p.inverterCount; i++) {
      const health = inverterHealth(p, i, now);
      const reading = inverterLiveReading(p, i, now);
      const isRunning = health.status === "running" || health.status === "standby";
      if (isRunning) totalRunning++;
      if (health.status === "fault") totalFault++;
      totalInverters++;
      rows.push([
        p.name,
        `Inverter ${i + 1}`,
        health.status,
        health.health,
        fmt(reading.acPowerKw, 1),
        `${fmt(reading.efficiencyPct, 1)}%`,
        `${fmt(reading.temperatureC, 1)}°C`,
        fmt(reading.energyTodayKwh),
      ]);
    }
  }

  const availPct = totalInverters > 0 ? Math.round((totalRunning / totalInverters) * 1000) / 10 : 0;
  return {
    reportType: "equipment_performance",
    title: "Equipment Performance Report",
    subtitle: `Fleet-wide inverter health snapshot`,
    dateFrom: now,
    dateTo: now,
    kpis: [
      { label: "Fleet Availability", value: `${availPct}%`, unit: "inverters" },
      { label: "Running", value: String(totalRunning), unit: `of ${totalInverters}` },
      { label: "Faulted", value: String(totalFault), unit: "inverters" },
    ],
    tables: [{
      headers: ["Plant", "Inverter", "Status", "Health", "AC Power (kW)", "Efficiency", "Temperature", "Daily (kWh)"],
      rows,
    }],
  };
}

function genInverterReport(plants: PlantConfig[], now: Date): ReportDataResult {
  const rows: (string | number | null)[][] = [];
  let totalAcPower = 0, effSum = 0, effCount = 0;

  for (const p of plants) {
    for (let i = 0; i < p.inverterCount; i++) {
      const r = inverterLiveReading(p, i, now);
      totalAcPower += r.acPowerKw;
      if (r.efficiencyPct > 0) { effSum += r.efficiencyPct; effCount++; }
      rows.push([
        p.name, `Inverter ${i + 1}`,
        fmt(r.acPowerKw, 1), fmt(r.dcPowerKw, 1),
        fmt(r.acVoltageV, 1), fmt(r.acCurrentA, 1),
        fmt(r.dcVoltageV, 1),
        `${fmt(r.efficiencyPct, 1)}%`,
        `${fmt(r.temperatureC, 1)}°C`,
        fmt(r.energyTodayKwh),
      ]);
    }
  }

  return {
    reportType: "inverter_report",
    title: "Inverter Report",
    subtitle: "Per-inverter electrical readings",
    dateFrom: now,
    dateTo: now,
    kpis: [
      { label: "Total AC Power", value: `${fmt(Math.round(totalAcPower))} kW` },
      { label: "Avg Efficiency", value: `${fmt(effCount > 0 ? Math.round(effSum / effCount * 10) / 10 : 0, 1)}%` },
    ],
    tables: [{
      headers: ["Plant", "Inverter", "AC Power (kW)", "DC Power (kW)", "AC V", "AC A", "DC V", "Efficiency", "Temp", "Daily (kWh)"],
      rows,
    }],
  };
}

function genStringReport(plants: PlantConfig[], now: Date): ReportDataResult {
  const rows: (string | number | null)[][] = [];
  let deviating = 0, total = 0;

  for (const p of plants) {
    for (let i = 0; i < Math.min(p.inverterCount, 4); i++) { // cap for readability
      const strs = stringReadings(p, i, now);
      for (const s of strs) {
        total++;
        if (Math.abs(s.deviationPct) > 15) deviating++;
        rows.push([
          p.name, `Inverter ${i + 1}`, s.label,
          fmt(s.currentA, 2), fmt(s.voltageV, 1),
          s.status, `${fmt(s.deviationPct, 1)}%`,
        ]);
      }
    }
  }

  return {
    reportType: "string_report",
    title: "String Report",
    subtitle: "PV string current, voltage, and deviation analysis",
    dateFrom: now,
    dateTo: now,
    kpis: [
      { label: "Total Strings", value: String(total) },
      { label: "Deviating (>15%)", value: String(deviating), unit: "strings" },
      { label: "Health Rate", value: total > 0 ? `${fmt(Math.round(((total - deviating) / total) * 1000) / 10, 1)}%` : "—" },
    ],
    tables: [{
      headers: ["Plant", "Inverter", "String", "Current (A)", "Voltage (V)", "Status", "Deviation"],
      rows,
    }],
  };
}

function genWeatherReport(plants: PlantConfig[], dates: Date[]): ReportDataResult {
  const rows: (string | number | null)[][] = [];
  let irradianceSum = 0, count = 0;

  for (const d of dates) {
    for (const p of plants) {
      const stations = weatherStations(p, d);
      for (const ws of stations) {
        irradianceSum += ws.poaIrradianceWm2;
        count++;
        rows.push([
          dateLabel(d), p.name, ws.name,
          fmt(ws.poaIrradianceWm2), fmt(ws.ghiIrradianceWm2),
          `${fmt(ws.ambientTempC, 1)}°C`, `${fmt(ws.moduleTempC, 1)}°C`,
          `${fmt(ws.windSpeedMs, 1)} m/s`, `${ws.humidityPct}%`,
        ]);
      }
    }
  }

  return {
    reportType: "weather_report",
    title: "Weather Report",
    subtitle: "Irradiance, temperature, and meteorological data",
    dateFrom: dates[0] ?? new Date(),
    dateTo: dates[dates.length - 1] ?? new Date(),
    kpis: [
      { label: "Avg POA Irradiance", value: fmt(count > 0 ? Math.round(irradianceSum / count) : 0), unit: "W/m²" },
      { label: "Weather Stations", value: String(plants.reduce((s, p) => s + p.weatherStationCount, 0)) },
    ],
    tables: [{
      headers: ["Date", "Plant", "Station", "POA (W/m²)", "GHI (W/m²)", "Ambient Temp", "Module Temp", "Wind", "Humidity"],
      rows,
    }],
  };
}

function genAlarmReport(plants: PlantConfig[], dates: Date[]): ReportDataResult {
  const rows: (string | number | null)[][] = [];
  let totalCrit = 0, totalMajor = 0, totalMinor = 0;

  for (const p of plants) {
    // Simulate alarm counts deterministically from plant cloudiness & inverter count
    const critical = Math.round(p.cloudinessSeed * 3 * dates.length / 14);
    const major = Math.round(p.cloudinessSeed * 6 * dates.length / 14 + 1);
    const minor = Math.round((0.3 + p.cloudinessSeed) * 10 * dates.length / 14);
    totalCrit += critical;
    totalMajor += major;
    totalMinor += minor;
    rows.push([p.name, critical, major, minor, critical + major + minor,
      critical > 0 ? "Investigation required" : "Nominal"]);
  }

  return {
    reportType: "alarm_report",
    title: "Alarm Report",
    subtitle: "Alarm events by severity and plant",
    dateFrom: dates[0] ?? new Date(),
    dateTo: dates[dates.length - 1] ?? new Date(),
    kpis: [
      { label: "Critical", value: String(totalCrit), unit: "alarms" },
      { label: "Major", value: String(totalMajor), unit: "alarms" },
      { label: "Minor", value: String(totalMinor), unit: "alarms" },
      { label: "Total", value: String(totalCrit + totalMajor + totalMinor) },
    ],
    tables: [{
      headers: ["Plant", "Critical", "Major", "Minor", "Total", "Recommendation"],
      rows,
    }],
  };
}

function genDowntimeReport(plants: PlantConfig[], dates: Date[]): ReportDataResult {
  const rows: (string | number | null)[][] = [];
  let availSum = 0, count = 0;

  for (const d of dates) {
    for (const p of plants) {
      const avail = plantAvailabilityPct(p, d);
      const downtimeHrs = Math.round(((100 - avail) / 100) * 12 * 10) / 10; // 12 solar hrs
      availSum += avail;
      count++;
      const faulted = Math.round((1 - avail / 100) * p.inverterCount);
      rows.push([dateLabel(d), p.name, `${avail}%`, fmt(downtimeHrs, 1), p.inverterCount - faulted, faulted, faulted > 0 ? "Comm loss / fault" : "—"]);
    }
  }

  return {
    reportType: "downtime_report",
    title: "Downtime Report",
    subtitle: "Equipment availability and downtime analysis",
    dateFrom: dates[0] ?? new Date(),
    dateTo: dates[dates.length - 1] ?? new Date(),
    kpis: [
      { label: "Avg Availability", value: `${fmt(count > 0 ? Math.round(availSum / count * 10) / 10 : 0, 1)}%` },
    ],
    tables: [{
      headers: ["Date", "Plant", "Availability", "Downtime (hrs)", "Running", "Faulted/Offline", "Cause"],
      rows,
    }],
  };
}

function genMaintenanceReport(plants: PlantConfig[], dates: Date[]): ReportDataResult {
  // Synthetic work order data (actual WOs are in the DB but require async query)
  const rows: (string | number | null)[][] = [];
  const types = ["Preventive", "Corrective", "Inspection", "Cleaning"];
  const statuses = ["Closed", "Closed", "Closed", "Open", "In Progress"];
  let open = 0, closed = 0;

  for (const p of plants) {
    const woCount = Math.max(1, Math.round(p.inverterCount / 4) + Math.round(p.cloudinessSeed * 3));
    for (let i = 0; i < woCount; i++) {
      // Deterministic based on plant+index
      const h = (p.id.length + i * 31) % 100;
      const type = types[h % types.length]!;
      const status = statuses[h % statuses.length]!;
      if (status === "Open") open++;
      else closed++;
      const d = dates[Math.min(i, dates.length - 1)];
      rows.push([d ? dateLabel(d) : "—", p.name, `WO-${p.id.slice(-4).toUpperCase()}-${String(i + 1).padStart(3, "0")}`, type, status, h > 50 ? "High" : "Medium"]);
    }
  }

  return {
    reportType: "maintenance_report",
    title: "Maintenance Report",
    subtitle: "Planned and unplanned work order summary",
    dateFrom: dates[0] ?? new Date(),
    dateTo: dates[dates.length - 1] ?? new Date(),
    kpis: [
      { label: "Total Work Orders", value: String(open + closed) },
      { label: "Closed", value: String(closed) },
      { label: "Open", value: String(open) },
      { label: "Completion Rate", value: open + closed > 0 ? `${Math.round(closed / (open + closed) * 100)}%` : "—" },
    ],
    tables: [{
      headers: ["Date", "Plant", "Work Order", "Type", "Status", "Priority"],
      rows,
    }],
  };
}

function genFinancialReport(plants: PlantConfig[], dates: Date[]): ReportDataResult {
  const rows: (string | number | null)[][] = [];
  let totalRevenue = 0;

  for (const p of plants) {
    const now = dates[dates.length - 1] ?? new Date();
    const rev = plantRevenue(p, now);
    const periodRevenue = Math.round(rev.monthToDateRevenue * (dates.length / 30));
    const periodEnergy = dates.reduce((sum, d) => sum + plantEnergyTodayKwh(p, d), 0);
    totalRevenue += periodRevenue;
    rows.push([
      p.name,
      fmt(Math.round(periodEnergy)),
      rev.tariffPerKwh.toFixed(3),
      rev.currency,
      fmt(periodRevenue),
      fmt(Math.round(rev.co2AvoidedTonnesToday * 1000 * dates.length / 30)),
    ]);
  }

  return {
    reportType: "financial_report",
    title: "Financial Report",
    subtitle: "Revenue, tariff, and earnings analysis",
    dateFrom: dates[0] ?? new Date(),
    dateTo: dates[dates.length - 1] ?? new Date(),
    kpis: [
      { label: "Total Revenue", value: `₹${fmt(totalRevenue)}`, unit: "period" },
      { label: "Plants", value: String(plants.length) },
    ],
    tables: [{
      headers: ["Plant", "Energy (kWh)", "Tariff (₹/kWh)", "Currency", "Revenue (₹)", "CO₂ Avoided (kg)"],
      rows,
    }],
  };
}

function genCarbonOffset(plants: PlantConfig[], dates: Date[]): ReportDataResult {
  const rows: (string | number | null)[][] = [];
  let totalCo2Kg = 0;

  for (const p of plants) {
    const energy = dates.reduce((sum, d) => sum + plantEnergyTodayKwh(p, d), 0);
    const co2Kg = Math.round(energy * 0.82); // India grid emission factor ~0.82 kg CO2/kWh
    const trees = Math.round(co2Kg / 21); // ~21 kg CO2 per tree per year
    const homes = Math.round(energy / 30); // ~30 kWh/day per home
    totalCo2Kg += co2Kg;
    rows.push([p.name, fmt(Math.round(energy)), fmt(co2Kg), fmt(trees), fmt(homes)]);
  }

  return {
    reportType: "carbon_offset",
    title: "Carbon Offset Report",
    subtitle: "CO₂ avoided and green energy equivalents",
    dateFrom: dates[0] ?? new Date(),
    dateTo: dates[dates.length - 1] ?? new Date(),
    kpis: [
      { label: "CO₂ Avoided", value: `${fmt(Math.round(totalCo2Kg / 1000), 1)} t`, unit: "tonnes" },
      { label: "Trees Equivalent", value: fmt(Math.round(totalCo2Kg / 21)) },
      { label: "Homes Powered", value: fmt(Math.round(dates.reduce((s, d) => s + plants.reduce((ps, p) => ps + plantEnergyTodayKwh(p, d), 0), 0) / 30)), unit: "days" },
    ],
    tables: [{
      headers: ["Plant", "Generation (kWh)", "CO₂ Avoided (kg)", "Trees Equivalent", "Homes Powered (days)"],
      rows,
    }],
  };
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export function generateReportData(
  reportType: string,
  plants: PlantConfig[],
  dateFrom: Date,
  dateTo: Date,
): ReportDataResult {
  const dates = sampleDates(dateFrom, dateTo);
  const now = dateTo;

  switch (reportType) {
    case "energy_generation":   return genEnergyGeneration(plants, dates);
    case "yield_analysis":      return genYieldAnalysis(plants, dates);
    case "pr_cuf":              return genPrCuf(plants, dates);
    case "equipment_performance": return genEquipmentPerformance(plants, now);
    case "inverter_report":     return genInverterReport(plants, now);
    case "string_report":       return genStringReport(plants, now);
    case "weather_report":      return genWeatherReport(plants, dates);
    case "alarm_report":        return genAlarmReport(plants, dates);
    case "downtime_report":     return genDowntimeReport(plants, dates);
    case "maintenance_report":  return genMaintenanceReport(plants, dates);
    case "financial_report":    return genFinancialReport(plants, dates);
    case "carbon_offset":       return genCarbonOffset(plants, dates);
    default:                    return genEnergyGeneration(plants, dates);
  }
}

// ── CSV serialiser ────────────────────────────────────────────────────────────

export function toCsv(data: ReportDataResult): string {
  const lines: string[] = [];
  lines.push(`# ${data.title}`);
  lines.push(`# Period: ${dateLabel(data.dateFrom)} to ${dateLabel(data.dateTo)}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push("");

  for (const table of data.tables) {
    if (table.title) lines.push(`## ${table.title}`);
    lines.push(table.headers.map((h) => `"${h}"`).join(","));
    for (const row of table.rows) {
      lines.push(row.map((cell) => {
        const s = String(cell ?? "");
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","));
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ── PDF generator (pdfkit) ────────────────────────────────────────────────────

const GREEN = "#059669";
const DARK = "#111827";
const GRAY = "#6b7280";
const LIGHT_GRAY = "#f9fafb";
const BORDER = "#e5e7eb";

function drawTableSection(
  doc: PDFKit.PDFDocument,
  table: ReportTable,
  pageWidth: number,
  margin: number,
): void {
  const colCount = table.headers.length;
  const totalWidth = pageWidth - margin * 2;
  const colWidth = Math.floor(totalWidth / colCount);
  const colWidths = Array(colCount).fill(colWidth);
  // Give last col remaining space
  colWidths[colCount - 1] = totalWidth - colWidth * (colCount - 1);

  function ensureSpace(needed: number): void {
    if (doc.y + needed > doc.page.height - 60) doc.addPage();
  }

  if (table.title) {
    ensureSpace(30);
    doc.fillColor(DARK).font("Helvetica-Bold").fontSize(10).text(table.title, margin, doc.y + 8);
    doc.moveDown(0.3);
  }

  const rowH = 16;

  // Header row
  ensureSpace(rowH + 4);
  let y = doc.y;
  doc.rect(margin, y, totalWidth, rowH).fill(GREEN);
  let x = margin;
  for (let i = 0; i < table.headers.length; i++) {
    doc.fillColor("white").font("Helvetica-Bold").fontSize(7)
      .text(table.headers[i]!, x + 3, y + 4, { width: colWidths[i]! - 6, lineBreak: false, ellipsis: true });
    x += colWidths[i]!;
  }
  doc.y = y + rowH;

  // Data rows
  for (let r = 0; r < table.rows.length; r++) {
    ensureSpace(rowH);
    y = doc.y;
    if (r % 2 === 1) doc.rect(margin, y, totalWidth, rowH).fill(LIGHT_GRAY);
    doc.rect(margin, y, totalWidth, rowH).stroke(BORDER);
    x = margin;
    const row = table.rows[r]!;
    for (let c = 0; c < colCount; c++) {
      const cell = String(row[c] ?? "");
      doc.fillColor(DARK).font("Helvetica").fontSize(7)
        .text(cell, x + 3, y + 4, { width: colWidths[c]! - 6, lineBreak: false, ellipsis: true });
      x += colWidths[c]!;
    }
    doc.y = y + rowH;
  }

  doc.moveDown(1);
}

export async function toPdf(data: ReportDataResult, orgName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const M = 50;
    const W = doc.page.width;

    // ── Cover header ──
    doc.rect(0, 0, W, 90).fill(GREEN);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(22)
      .text(data.title, M, 18, { width: W - M * 2 });
    doc.fillColor("rgba(255,255,255,0.8)").font("Helvetica").fontSize(10)
      .text(`${orgName}  ·  ${data.subtitle}`, M, 50, { width: W - M * 2 });
    doc.fillColor("rgba(255,255,255,0.65)").fontSize(8)
      .text(`Period: ${dateLabel(data.dateFrom)} → ${dateLabel(data.dateTo)}  |  Generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, M, 68, { width: W - M * 2 });

    // ── KPI strip ──
    const kpiY = 105;
    const kpiW = Math.floor((W - M * 2 - (data.kpis.length - 1) * 8) / Math.max(1, data.kpis.length));
    data.kpis.forEach((kpi, i) => {
      const kx = M + i * (kpiW + 8);
      doc.roundedRect(kx, kpiY, kpiW, 58, 4).fillAndStroke("#f0fdf4", GREEN);
      doc.fillColor(GRAY).font("Helvetica").fontSize(7).text(kpi.label.toUpperCase(), kx + 8, kpiY + 8, { width: kpiW - 16 });
      doc.fillColor(DARK).font("Helvetica-Bold").fontSize(18).text(kpi.value, kx + 8, kpiY + 20, { width: kpiW - 16, lineBreak: false });
      if (kpi.unit) {
        doc.fillColor(GRAY).font("Helvetica").fontSize(7).text(kpi.unit, kx + 8, kpiY + 43, { width: kpiW - 16 });
      }
    });

    doc.y = kpiY + 70;

    // ── Tables ──
    for (const table of data.tables) {
      drawTableSection(doc, table, W, M);
    }

    // ── Footer on each page ──
    const range = doc.bufferedPageRange ? doc.bufferedPageRange() : { start: 0, count: 1 };
    const pageCount = range.count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage?.(i);
      doc.fillColor(GRAY).font("Helvetica").fontSize(7)
        .text(
          `${data.title}  ·  ${orgName}  ·  Page ${i + 1} of ${pageCount}`,
          M,
          doc.page.height - 25,
          { width: W - M * 2, align: "center" },
        );
    }

    doc.end();
  });
}
