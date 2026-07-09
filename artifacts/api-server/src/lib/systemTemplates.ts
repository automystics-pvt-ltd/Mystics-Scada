/**
 * System device template library.
 *
 * These templates are seeded once (idempotent) and are visible to all orgs
 * (org_id = null). Operators can clone them into org-private templates.
 */

import type { FieldDef } from "./drivers/types.js";

interface SystemTemplate {
  id: string;      // stable UUID for idempotent seed
  manufacturer: string;
  model: string;
  protocol: string;
  fieldMap: FieldDef[];
  defaultPollIntervalS: number;
  firmwareVersionParam?: string;
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  // ── Huawei SUN2000 ────────────────────────────────────────────────────────
  {
    id: "tmpl-huawei-sun2000",
    manufacturer: "Huawei",
    model: "SUN2000 Series",
    protocol: "modbus_tcp",
    defaultPollIntervalS: 30,
    fieldMap: [
      { key: "acPowerKw",      label: "AC Power",           unit: "kW",  address: 32080, length: 2, dataType: "INT32",   multiplier: 0.001 },
      { key: "acVoltageV",     label: "AC Voltage L1",      unit: "V",   address: 32069, length: 1, dataType: "UINT16",  multiplier: 0.1 },
      { key: "acCurrentA",     label: "AC Current",         unit: "A",   address: 32072, length: 2, dataType: "INT32",   multiplier: 0.001 },
      { key: "dcVoltageV",     label: "DC Voltage",         unit: "V",   address: 32064, length: 1, dataType: "UINT16",  multiplier: 0.1 },
      { key: "dcCurrentA",     label: "DC Current",         unit: "A",   address: 32065, length: 2, dataType: "INT32",   multiplier: 0.001 },
      { key: "dailyYieldKwh",  label: "Daily Yield",        unit: "kWh", address: 32114, length: 2, dataType: "UINT32",  multiplier: 0.01 },
      { key: "totalYieldKwh",  label: "Total Yield",        unit: "kWh", address: 32106, length: 2, dataType: "UINT32",  multiplier: 1 },
      { key: "deviceTempC",    label: "Internal Temp",      unit: "°C",  address: 32087, length: 1, dataType: "INT16",   multiplier: 0.1 },
      { key: "efficiencyPct",  label: "Efficiency",         unit: "%",   address: 32086, length: 1, dataType: "UINT16",  multiplier: 0.01 },
      { key: "statusWord",     label: "Status Word",        unit: "",    address: 32089, length: 1, dataType: "UINT16",  multiplier: 1 },
    ],
  },

  // ── Sungrow SG Series ──────────────────────────────────────────────────────
  {
    id: "tmpl-sungrow-sg",
    manufacturer: "Sungrow",
    model: "SG Series",
    protocol: "modbus_tcp",
    defaultPollIntervalS: 30,
    fieldMap: [
      { key: "acPowerKw",      label: "Active Power",       unit: "kW",  address: 13010, length: 2, dataType: "INT32",   multiplier: 0.1 },
      { key: "dcVoltageV",     label: "DC Voltage MPPT1",   unit: "V",   address: 5011,  length: 1, dataType: "UINT16",  multiplier: 0.1 },
      { key: "dcCurrentA",     label: "DC Current MPPT1",   unit: "A",   address: 5012,  length: 1, dataType: "UINT16",  multiplier: 0.1 },
      { key: "acVoltageV",     label: "AC Voltage AB",      unit: "V",   address: 13014, length: 1, dataType: "UINT16",  multiplier: 0.1 },
      { key: "dailyYieldKwh",  label: "Daily Yield",        unit: "kWh", address: 13001, length: 2, dataType: "UINT32",  multiplier: 0.1 },
      { key: "totalYieldKwh",  label: "Total Yield",        unit: "kWh", address: 13003, length: 2, dataType: "UINT32",  multiplier: 1 },
      { key: "deviceTempC",    label: "Heat Sink Temp",     unit: "°C",  address: 5008,  length: 1, dataType: "INT16",   multiplier: 0.1 },
      { key: "powerFactor",    label: "Power Factor",       unit: "",    address: 13022, length: 1, dataType: "INT16",   multiplier: 0.001 },
      { key: "runningState",   label: "Running State",      unit: "",    address: 13000, length: 1, dataType: "UINT16",  multiplier: 1 },
    ],
  },

  // ── Fronius Primo / Symo (HTTP Solar API v1) ──────────────────────────────
  {
    id: "tmpl-fronius-symo",
    manufacturer: "Fronius",
    model: "Symo / Primo",
    protocol: "http",
    defaultPollIntervalS: 60,
    fieldMap: [
      { key: "acPowerKw",      label: "AC Power",           unit: "kW",  jsonPath: "$.Body.Data.PAC.Value",           multiplier: 0.001 },
      { key: "dailyYieldKwh",  label: "Day Energy",         unit: "kWh", jsonPath: "$.Body.Data.DAY_ENERGY.Value",    multiplier: 0.001 },
      { key: "totalYieldKwh",  label: "Total Energy",       unit: "kWh", jsonPath: "$.Body.Data.TOTAL_ENERGY.Value",  multiplier: 0.001 },
      { key: "acVoltageV",     label: "AC Voltage",         unit: "V",   jsonPath: "$.Body.Data.UAC.Value",           multiplier: 1 },
      { key: "acCurrentA",     label: "AC Current",         unit: "A",   jsonPath: "$.Body.Data.IAC.Value",           multiplier: 1 },
      { key: "dcVoltageV",     label: "DC Voltage",         unit: "V",   jsonPath: "$.Body.Data.UDC.Value",           multiplier: 1 },
      { key: "dcCurrentA",     label: "DC Current",         unit: "A",   jsonPath: "$.Body.Data.IDC.Value",           multiplier: 1 },
      { key: "deviceTempC",    label: "Inverter Temp",      unit: "°C",  jsonPath: "$.Body.Data.TMP.Value",           multiplier: 1 },
    ],
  },

  // ── Growatt SPH / MID (Modbus TCP) ────────────────────────────────────────
  {
    id: "tmpl-growatt-sph",
    manufacturer: "Growatt",
    model: "SPH / MID Series",
    protocol: "modbus_tcp",
    defaultPollIntervalS: 30,
    fieldMap: [
      { key: "statusWord",     label: "Inverter Status",    unit: "",    address: 0,    length: 1, dataType: "UINT16", multiplier: 1 },
      { key: "acPowerKw",      label: "Output Power",       unit: "kW",  address: 35,   length: 2, dataType: "UINT32", multiplier: 0.1 },
      { key: "acVoltageV",     label: "Grid Voltage",       unit: "V",   address: 38,   length: 1, dataType: "UINT16", multiplier: 0.1 },
      { key: "acCurrentA",     label: "Grid Current",       unit: "A",   address: 40,   length: 1, dataType: "UINT16", multiplier: 0.1 },
      { key: "dcVoltageV",     label: "PV1 Voltage",        unit: "V",   address: 3,    length: 1, dataType: "UINT16", multiplier: 0.1 },
      { key: "dcCurrentA",     label: "PV1 Current",        unit: "A",   address: 4,    length: 1, dataType: "UINT16", multiplier: 0.1 },
      { key: "dailyYieldKwh",  label: "Today Generation",   unit: "kWh", address: 53,   length: 2, dataType: "UINT32", multiplier: 0.1 },
      { key: "totalYieldKwh",  label: "Total Generation",   unit: "kWh", address: 55,   length: 2, dataType: "UINT32", multiplier: 0.1 },
      { key: "deviceTempC",    label: "Inverter Temp",      unit: "°C",  address: 93,   length: 1, dataType: "INT16",  multiplier: 0.1 },
    ],
  },

  // ── ABB TRIO / UNO (Modbus TCP) ───────────────────────────────────────────
  {
    id: "tmpl-abb-trio",
    manufacturer: "ABB",
    model: "TRIO / UNO",
    protocol: "modbus_tcp",
    defaultPollIntervalS: 30,
    fieldMap: [
      { key: "acPowerKw",      label: "Grid Power",         unit: "kW",  address: 40083, length: 2, dataType: "FLOAT32", multiplier: 0.001 },
      { key: "acVoltageV",     label: "Grid Voltage L1",    unit: "V",   address: 40079, length: 2, dataType: "FLOAT32", multiplier: 1 },
      { key: "acCurrentA",     label: "Grid Current L1",    unit: "A",   address: 40071, length: 2, dataType: "FLOAT32", multiplier: 1 },
      { key: "dcVoltageV",     label: "DC Voltage",         unit: "V",   address: 40101, length: 2, dataType: "FLOAT32", multiplier: 1 },
      { key: "dailyYieldKwh",  label: "Daily Yield",        unit: "kWh", address: 40108, length: 2, dataType: "FLOAT32", multiplier: 1 },
      { key: "totalYieldKwh",  label: "Total Yield",        unit: "kWh", address: 40094, length: 2, dataType: "FLOAT32", multiplier: 1 },
      { key: "deviceTempC",    label: "Internal Temp",      unit: "°C",  address: 40115, length: 2, dataType: "FLOAT32", multiplier: 1 },
    ],
  },

  // ── Solis S5 / S6 (Modbus TCP) ────────────────────────────────────────────
  {
    id: "tmpl-solis-s5",
    manufacturer: "Solis",
    model: "S5 / S6 Series",
    protocol: "modbus_tcp",
    defaultPollIntervalS: 30,
    fieldMap: [
      { key: "acPowerKw",      label: "Active Power",       unit: "kW",  address: 33057, length: 2, dataType: "INT32",  multiplier: 0.1 },
      { key: "acVoltageV",     label: "AC Voltage",         unit: "V",   address: 33073, length: 1, dataType: "UINT16", multiplier: 0.1 },
      { key: "acCurrentA",     label: "AC Current",         unit: "A",   address: 33076, length: 1, dataType: "UINT16", multiplier: 0.1 },
      { key: "dcVoltageV",     label: "DC Voltage 1",       unit: "V",   address: 33049, length: 1, dataType: "UINT16", multiplier: 0.1 },
      { key: "dcCurrentA",     label: "DC Current 1",       unit: "A",   address: 33050, length: 1, dataType: "UINT16", multiplier: 0.1 },
      { key: "dailyYieldKwh",  label: "Today Generation",   unit: "kWh", address: 33035, length: 2, dataType: "UINT32", multiplier: 0.1 },
      { key: "totalYieldKwh",  label: "Total Generation",   unit: "kWh", address: 33029, length: 2, dataType: "UINT32", multiplier: 1 },
      { key: "deviceTempC",    label: "Inverter Temp",      unit: "°C",  address: 33093, length: 1, dataType: "INT16",  multiplier: 0.1 },
    ],
  },

  // ── Delta M Series (Modbus TCP) ───────────────────────────────────────────
  {
    id: "tmpl-delta-m",
    manufacturer: "Delta",
    model: "M Series",
    protocol: "modbus_tcp",
    defaultPollIntervalS: 30,
    fieldMap: [
      { key: "acPowerKw",      label: "AC Output Power",    unit: "kW",  address: 4120, length: 2, dataType: "INT32",  multiplier: 0.001 },
      { key: "acVoltageV",     label: "AC Voltage",         unit: "V",   address: 4103, length: 1, dataType: "UINT16", multiplier: 0.1 },
      { key: "dcVoltageV",     label: "DC Input Voltage",   unit: "V",   address: 4100, length: 1, dataType: "UINT16", multiplier: 0.1 },
      { key: "dailyYieldKwh",  label: "Day Energy",         unit: "kWh", address: 4110, length: 2, dataType: "UINT32", multiplier: 0.01 },
      { key: "totalYieldKwh",  label: "Total Energy",       unit: "kWh", address: 4112, length: 2, dataType: "UINT32", multiplier: 0.1 },
      { key: "deviceTempC",    label: "Cabinet Temp",       unit: "°C",  address: 4130, length: 1, dataType: "INT16",  multiplier: 0.1 },
    ],
  },

  // ── Generic MQTT Inverter ─────────────────────────────────────────────────
  {
    id: "tmpl-generic-mqtt",
    manufacturer: "Generic",
    model: "MQTT Inverter",
    protocol: "mqtt",
    defaultPollIntervalS: 10,
    fieldMap: [
      { key: "acPowerKw",      label: "AC Power",           unit: "kW",  jsonPath: "$.acPower" },
      { key: "acVoltageV",     label: "AC Voltage",         unit: "V",   jsonPath: "$.acVoltage" },
      { key: "acCurrentA",     label: "AC Current",         unit: "A",   jsonPath: "$.acCurrent" },
      { key: "dcVoltageV",     label: "DC Voltage",         unit: "V",   jsonPath: "$.dcVoltage" },
      { key: "dailyYieldKwh",  label: "Daily Yield",        unit: "kWh", jsonPath: "$.dailyYield" },
      { key: "totalYieldKwh",  label: "Total Yield",        unit: "kWh", jsonPath: "$.totalYield" },
      { key: "deviceTempC",    label: "Temperature",        unit: "°C",  jsonPath: "$.temperature" },
      { key: "statusWord",     label: "Status",             unit: "",    jsonPath: "$.status" },
    ],
  },

  // ── Generic HTTP REST Inverter ────────────────────────────────────────────
  {
    id: "tmpl-generic-http",
    manufacturer: "Generic",
    model: "HTTP REST Device",
    protocol: "http",
    defaultPollIntervalS: 60,
    fieldMap: [
      { key: "acPowerKw",      label: "AC Power",           unit: "kW",  jsonPath: "$.acPower" },
      { key: "acVoltageV",     label: "AC Voltage",         unit: "V",   jsonPath: "$.acVoltage" },
      { key: "dailyYieldKwh",  label: "Daily Yield",        unit: "kWh", jsonPath: "$.dailyYield" },
      { key: "totalYieldKwh",  label: "Total Yield",        unit: "kWh", jsonPath: "$.totalYield" },
      { key: "deviceTempC",    label: "Temperature",        unit: "°C",  jsonPath: "$.temperature" },
    ],
  },

  // ── Generic Modbus TCP ────────────────────────────────────────────────────
  {
    id: "tmpl-generic-modbus",
    manufacturer: "Generic",
    model: "Modbus TCP Device",
    protocol: "modbus_tcp",
    defaultPollIntervalS: 30,
    fieldMap: [],  // user fills in register map via the template editor
  },

  // ── Generic WebSocket ─────────────────────────────────────────────────────
  {
    id: "tmpl-generic-ws",
    manufacturer: "Generic",
    model: "WebSocket Stream",
    protocol: "websocket",
    defaultPollIntervalS: 10,
    fieldMap: [
      { key: "acPowerKw",      label: "AC Power",           unit: "kW",  jsonPath: "$.acPower" },
      { key: "acVoltageV",     label: "AC Voltage",         unit: "V",   jsonPath: "$.acVoltage" },
      { key: "dailyYieldKwh",  label: "Daily Yield",        unit: "kWh", jsonPath: "$.dailyYield" },
    ],
  },

  // ── Teltonika RUT (MQTT gateway) ──────────────────────────────────────────
  {
    id: "tmpl-teltonika-rut",
    manufacturer: "Teltonika",
    model: "RUT Series Gateway",
    protocol: "mqtt",
    defaultPollIntervalS: 10,
    fieldMap: [
      { key: "signalStrength",  label: "Signal Strength",   unit: "dBm",  jsonPath: "$.signal.dbm" },
      { key: "networkType",     label: "Network Type",      unit: "",     jsonPath: "$.network.type" },
      { key: "cpuLoad",         label: "CPU Load",          unit: "%",    jsonPath: "$.system.cpu" },
      { key: "memUsedPct",      label: "Memory Used",       unit: "%",    jsonPath: "$.system.memory_percent" },
      { key: "uptimeS",         label: "Uptime",            unit: "s",    jsonPath: "$.system.uptime" },
    ],
  },

  // ── Schneider Electric Conext (Modbus TCP) ────────────────────────────────
  {
    id: "tmpl-schneider-conext",
    manufacturer: "Schneider Electric",
    model: "Conext Series",
    protocol: "modbus_tcp",
    defaultPollIntervalS: 30,
    fieldMap: [
      { key: "acPowerKw",      label: "Output Power",       unit: "kW",  address: 64, length: 2, dataType: "INT32",  multiplier: 0.001 },
      { key: "acVoltageV",     label: "AC Voltage",         unit: "V",   address: 68, length: 2, dataType: "INT32",  multiplier: 0.01 },
      { key: "acCurrentA",     label: "AC Current",         unit: "A",   address: 72, length: 2, dataType: "INT32",  multiplier: 0.01 },
      { key: "dcVoltageV",     label: "PV Voltage",         unit: "V",   address: 80, length: 2, dataType: "INT32",  multiplier: 0.01 },
      { key: "dailyYieldKwh",  label: "Energy Today",       unit: "kWh", address: 90, length: 2, dataType: "UINT32", multiplier: 0.01 },
      { key: "deviceTempC",    label: "Inverter Temp",      unit: "°C",  address: 96, length: 2, dataType: "INT32",  multiplier: 0.01 },
    ],
  },
];
