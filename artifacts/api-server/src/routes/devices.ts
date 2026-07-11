import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  devicesTable,
  deviceReadingsTable,
  deviceCommLogsTable,
  deviceTemplatesTable,
  firmwareVersionHistoryTable,
} from "@workspace/db";
import { resolveOrgId, orgCondition } from "../lib/orgScope.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { getOrgPlants } from "../lib/domain.js";
import {
  deviceStatus,
  deviceLogs,
  deviceConnectivityTimeline,
} from "../lib/simulation.js";
import { driverRegistry } from "../lib/drivers/registry.js";
import { assertNotSsrfTarget, SsrfBlockedError } from "../lib/drivers/ssrf.js";
import { encryptCredential, decryptCredential } from "../lib/credentialCrypto.js";
import type { DriverConfig, FieldDef } from "../lib/drivers/types.js";

// ── CSV parser (RFC 4180 — handles quoted fields with embedded commas/newlines) ─

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  /** Parse a single CSV value token, stripping surrounding quotes and unescaping "". */
  function parseField(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).replace(/""/g, '"');
    }
    return trimmed;
  }

  /** Tokenise a CSV line respecting RFC 4180 quoting; returns field strings. */
  function tokeniseLine(line: string): string[] {
    const fields: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }    // escaped quote
          else inQuotes = false;
        } else { cur += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ",") { fields.push(cur); cur = ""; }
        else { cur += ch; }
      }
    }
    fields.push(cur);
    return fields;
  }

  // Normalise line endings, then split — but handle quoted newlines by re-joining
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Re-assemble lines that contain quoted newlines
  const rawLines: string[] = [];
  let buf = "";
  let inQ = false;
  for (let i = 0; i < normalised.length; i++) {
    const ch = normalised[i]!;
    if (ch === '"') { inQ = !inQ; buf += ch; }
    else if (ch === "\n" && !inQ) { rawLines.push(buf); buf = ""; }
    else { buf += ch; }
  }
  if (buf) rawLines.push(buf);

  const nonEmpty = rawLines.filter((l) => l.trim());
  if (nonEmpty.length < 2) return { headers: [], rows: [] };

  const headers = tokeniseLine(nonEmpty[0]!).map(parseField);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const cols = tokeniseLine(nonEmpty[i]!).map(parseField);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] ?? ""; });
    rows.push(row);
  }
  return { headers, rows };
}

const router: IRouter = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const DEVICE_TYPES = [
  "RTU", "PLC", "data_logger", "smart_meter", "inverter",
  "weather_station", "tracker_controller", "sensor", "gateway",
] as const;

const PROTOCOLS = ["modbus", "modbus_rtu", "mqtt", "http", "opcua", "websocket", "bacnet"] as const;

const HTTP_AUTH_METHODS = ["none", "bearer", "api_key", "basic"] as const;

const SERIAL_PARITY = ["none", "even", "odd"] as const;

const OPCUA_SECURITY_MODES = ["None", "Sign", "SignAndEncrypt"] as const;

/** Cross-field validation: ensure auth value/header are present for methods that need them. */
function validateHttpAuth(data: { httpAuthMethod?: string; httpAuthValue?: string; httpApiKeyHeader?: string }, ctx: z.RefinementCtx) {
  const m = data.httpAuthMethod;
  if (!m || m === "none") return;
  if ((m === "bearer" || m === "basic") && !data.httpAuthValue?.trim()) {
    ctx.addIssue({ code: "custom", path: ["httpAuthValue"], message: `httpAuthValue is required for auth method '${m}'` });
  }
  if (m === "api_key") {
    if (!data.httpAuthValue?.trim()) ctx.addIssue({ code: "custom", path: ["httpAuthValue"], message: "httpAuthValue (key) is required for api_key auth" });
    if (!data.httpApiKeyHeader?.trim()) ctx.addIssue({ code: "custom", path: ["httpApiKeyHeader"], message: "httpApiKeyHeader is required for api_key auth" });
  }
}

const RegisterDeviceBody = z.object({
  name:               z.string().min(1).max(120),
  type:               z.enum(DEVICE_TYPES),
  protocol:           z.enum(PROTOCOLS),
  plantId:            z.string().min(1),
  templateId:         z.string().optional(),
  ipAddress:          z.string().optional(),
  port:               z.number().int().min(1).max(65535).optional(),
  modbusUnitId:       z.number().int().min(1).max(247).optional(),
  brokerUrl:          z.string().optional(),
  topic:              z.string().optional(),
  url:                z.string().optional(),
  pollingIntervalSec: z.number().int().min(5).max(3600).default(30),
  // HTTP auth
  httpAuthMethod:    z.enum(HTTP_AUTH_METHODS).optional(),
  httpAuthValue:     z.string().max(2048).optional(),
  httpApiKeyHeader:  z.string().max(120).optional(),
  // Modbus RTU / RS485 (serial transport)
  serialPort:        z.string().max(255).optional(),
  baudRate:          z.number().int().min(300).max(921600).optional(),
  parity:            z.enum(SERIAL_PARITY).optional(),
  dataBits:          z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8)]).optional(),
  stopBits:          z.union([z.literal(1), z.literal(2)]).optional(),
  // OPC-UA
  opcuaSecurityMode: z.enum(OPCUA_SECURITY_MODES).optional(),
  opcuaUsername:     z.string().max(255).optional(),
  opcuaPassword:     z.string().max(2048).optional(),
  // BACnet/IP
  bacnetDeviceInstance: z.number().int().min(0).max(4194302).optional(),
}).superRefine(validateHttpAuth);

// Body accepted by the pre-flight test (no device ID needed; value used once, never persisted)
const PreflightBody = z.object({
  protocol:         z.enum(PROTOCOLS),
  url:              z.string().optional(),
  brokerUrl:        z.string().optional(),
  topic:            z.string().optional(),
  ipAddress:        z.string().optional(),
  port:             z.number().int().min(1).max(65535).optional(),
  modbusUnitId:     z.number().int().min(1).max(247).optional(),
  httpAuthMethod:   z.enum(HTTP_AUTH_METHODS).optional(),
  httpAuthValue:    z.string().max(2048).optional(),
  httpApiKeyHeader: z.string().max(120).optional(),
  serialPort:       z.string().max(255).optional(),
  baudRate:         z.number().int().min(300).max(921600).optional(),
  parity:           z.enum(SERIAL_PARITY).optional(),
  dataBits:         z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8)]).optional(),
  stopBits:         z.union([z.literal(1), z.literal(2)]).optional(),
  opcuaSecurityMode: z.enum(OPCUA_SECURITY_MODES).optional(),
  opcuaUsername:     z.string().max(255).optional(),
  opcuaPassword:     z.string().max(2048).optional(),
  bacnetDeviceInstance: z.number().int().min(0).max(4194302).optional(),
}).superRefine(validateHttpAuth);

const UpdateDeviceBody = z.object({
  name:               z.string().min(1).max(120).optional(),
  templateId:         z.string().nullable().optional(),
  ipAddress:          z.string().optional(),
  port:               z.number().int().min(1).max(65535).optional(),
  modbusUnitId:       z.number().int().min(1).max(247).optional(),
  brokerUrl:          z.string().optional(),
  topic:              z.string().optional(),
  url:                z.string().optional(),
  pollingIntervalSec: z.number().int().min(5).max(3600).optional(),
  // HTTP auth — pass httpAuthValue: "" to clear credentials
  httpAuthMethod:    z.enum(HTTP_AUTH_METHODS).optional(),
  httpAuthValue:     z.string().max(2048).optional(),
  httpApiKeyHeader:  z.string().max(120).optional(),
  // Modbus RTU / RS485 (serial transport)
  serialPort:        z.string().max(255).optional(),
  baudRate:          z.number().int().min(300).max(921600).optional(),
  parity:            z.enum(SERIAL_PARITY).optional(),
  dataBits:          z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8)]).optional(),
  stopBits:          z.union([z.literal(1), z.literal(2)]).optional(),
  // OPC-UA — pass opcuaPassword: "" to clear credentials
  opcuaSecurityMode: z.enum(OPCUA_SECURITY_MODES).optional(),
  opcuaUsername:     z.string().max(255).optional(),
  opcuaPassword:     z.string().max(2048).optional(),
  // BACnet/IP
  bacnetDeviceInstance: z.number().int().min(0).max(4194302).optional(),
}).superRefine(validateHttpAuth);

// ── Types ─────────────────────────────────────────────────────────────────────

type DeviceRow = typeof devicesTable.$inferSelect;
type DeviceConfig = {
  ipAddress?: string;
  port?: number;
  modbusUnitId?: number;
  brokerUrl?: string;
  topic?: string;
  url?: string;
  pollingIntervalSec?: number;
  // HTTP auth (stored in config JSONB)
  httpAuthMethod?: "none" | "bearer" | "api_key" | "basic";
  httpAuthValue?: string;
  httpApiKeyHeader?: string;
  // Modbus RTU / RS485 (serial transport)
  serialPort?: string;
  baudRate?: number;
  parity?: "none" | "even" | "odd";
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  // OPC-UA
  opcuaSecurityMode?: "None" | "Sign" | "SignAndEncrypt";
  opcuaUsername?: string;
  opcuaPassword?: string;
  // BACnet/IP
  bacnetDeviceInstance?: number;
  pendingDeploy?: boolean;
};

function parseConfig(raw: unknown): DeviceConfig {
  if (!raw || typeof raw !== "object") return {};
  return raw as DeviceConfig;
}

function toDeviceResponse(row: DeviceRow, now: Date) {
  const sim = deviceStatus(row.id, now);
  const cfg = parseConfig(row.config);
  // Every registered device has a live driver instance managing its
  // `devices.status` column (connect/error/disconnect events, plus the
  // offline-detection background job) — so DB status is always authoritative.
  // Only cosmetic fields without a live equivalent (signal strength, and
  // lastSeenAt/firmwareVersion when no real reading has ever landed) fall
  // back to the deterministic simulation, purely for demo polish.
  const status = row.status as string;
  const lastSeenAt = row.lastSeenAt ? row.lastSeenAt.toISOString() : sim.lastSeenAt;
  const firmwareVersion = row.firmwareVersion ?? sim.firmwareVersion;

  return {
    id: row.id,
    orgId: row.orgId,
    plantId: row.plantId,
    name: row.name,
    type: row.type,
    protocol: row.protocol,
    templateId: row.templateId ?? null,
    status,
    signalStrengthPct: sim.signalStrengthPct,
    lastSeenAt,
    firmwareVersion,
    // dataSource: "live" when we have a real lastSeenAt within 3x polling interval
    dataSource: row.lastSeenAt ? "live" : "simulated",
    config: {
      ipAddress:          cfg.ipAddress ?? null,
      port:               cfg.port ?? null,
      modbusUnitId:       cfg.modbusUnitId ?? null,
      brokerUrl:          cfg.brokerUrl ?? null,
      topic:              cfg.topic ?? null,
      url:                cfg.url ?? null,
      pollingIntervalSec: cfg.pollingIntervalSec ?? 30,
      // Auth metadata (method + header name) is safe to expose; value is never returned
      httpAuthMethod:     cfg.httpAuthMethod ?? null,
      httpApiKeyHeader:   cfg.httpApiKeyHeader ?? null,
      httpAuthConfigured: !!(cfg.httpAuthMethod && cfg.httpAuthMethod !== "none" && cfg.httpAuthValue),
      // Modbus RTU / RS485
      serialPort:         cfg.serialPort ?? null,
      baudRate:           cfg.baudRate ?? null,
      parity:             cfg.parity ?? null,
      dataBits:           cfg.dataBits ?? null,
      stopBits:           cfg.stopBits ?? null,
      // OPC-UA — password value is never returned, only whether one is set
      opcuaSecurityMode:  cfg.opcuaSecurityMode ?? null,
      opcuaUsername:      cfg.opcuaUsername ?? null,
      opcuaPasswordConfigured: !!cfg.opcuaPassword,
      // BACnet/IP
      bacnetDeviceInstance: cfg.bacnetDeviceInstance ?? null,
    },
    pendingDeploy: cfg.pendingDeploy ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize protocol string to DriverConfig.protocol */
function toDriverProtocol(raw: string): DriverConfig["protocol"] | null {
  switch (raw.toLowerCase()) {
    case "modbus": case "modbus_tcp": return "modbus_tcp";
    case "modbus_rtu": return "modbus_rtu";
    case "mqtt": return "mqtt";
    case "http": return "http";
    case "websocket": case "ws": return "websocket";
    case "opcua": case "opc-ua": case "opc_ua": return "opcua";
    case "bacnet": case "bac-net": case "bac_net": return "bacnet";
    default: return null;
  }
}

// ── POST /devices/connection-preflight ───────────────────────────────────────
// Test connection params without needing a saved device (used by the wizard).

router.post("/devices/connection-preflight", requirePermission("device.manage"), async (req, res) => {
  const parsed = PreflightBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "validation_error", message: parsed.error.message });
    return;
  }
  const b = parsed.data;

  // SSRF guard
  try {
    assertNotSsrfTarget(b.ipAddress);
    assertNotSsrfTarget(b.brokerUrl);
    assertNotSsrfTarget(b.url);
  } catch (e) {
    if (e instanceof SsrfBlockedError) {
      res.status(400).json({ ok: false, error: "ssrf_blocked", message: e.message });
      return;
    }
    throw e;
  }

  const protocol = toDriverProtocol(b.protocol);
  if (!protocol) {
    res.status(400).json({ ok: false, error: "unsupported_protocol", message: `Protocol '${b.protocol}' is not supported` });
    return;
  }

  const cfg: DriverConfig = {
    deviceId:        "preflight",
    protocol,
    ipAddress:       b.ipAddress,
    port:            b.port,
    modbusUnitId:    b.modbusUnitId,
    brokerUrl:       b.brokerUrl,
    topic:           b.topic,
    url:             b.url,
    httpAuthMethod:  b.httpAuthMethod,
    httpAuthValue:   b.httpAuthValue,
    httpApiKeyHeader: b.httpApiKeyHeader,
    serialPort:      b.serialPort,
    baudRate:        b.baudRate,
    parity:          b.parity,
    dataBits:        b.dataBits,
    stopBits:        b.stopBits,
    opcuaSecurityMode: b.opcuaSecurityMode,
    opcuaUsername:   b.opcuaUsername,
    opcuaPassword:   b.opcuaPassword,
    bacnetDeviceInstance: b.bacnetDeviceInstance,
    pollingIntervalS: 30,
    fieldMap:        [],
  };

  const driver = driverRegistry.makeTestDriver(cfg);
  if (!driver) {
    res.status(400).json({
      ok: false,
      error: "no_connection_info",
      message: "No connection parameters provided — supply a URL, broker URL, IP address, or serial port path",
    });
    return;
  }

  req.log.info({ protocol }, "Connection preflight test initiated");
  const result = await driver.test(7_000);
  req.log.info({ ok: result.ok, latencyMs: result.latencyMs }, "Connection preflight test complete");
  res.json(result);
});

// ── GET /devices/health-stats ─────────────────────────────────────────────────

router.get("/devices/health-stats", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const stats = await driverRegistry.getHealthStats();
  // Scope to org if not super-admin
  const filtered = orgId ? stats.filter((s) => s.orgId === orgId) : stats;
  res.json(filtered);
});

// ── GET /devices ──────────────────────────────────────────────────────────────

router.get("/devices", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const now = new Date();
  const conditions: SQL[] = [];
  const oc = orgCondition(devicesTable.orgId, orgId);
  if (oc) conditions.push(oc);
  if (req.query["plantId"]) conditions.push(eq(devicesTable.plantId, req.query["plantId"] as string));

  const rows = await db
    .select()
    .from(devicesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(devicesTable.name);

  const templateIds = Array.from(new Set(rows.map((r) => r.templateId).filter((t): t is string => !!t)));
  const templates = templateIds.length > 0
    ? await db.select().from(deviceTemplatesTable).where(sql`${deviceTemplatesTable.id} = ANY(${templateIds})`)
    : [];
  const latestFwByTemplate = new Map(templates.map((t) => [t.id, t.latestFirmwareVersion]));

  res.json(rows.map((r) => {
    const base = toDeviceResponse(r, now);
    const latestFirmwareVersion = r.templateId ? (latestFwByTemplate.get(r.templateId) ?? null) : null;
    return {
      ...base,
      latestFirmwareVersion,
      firmwareUpToDate: latestFirmwareVersion ? base.firmwareVersion === latestFirmwareVersion : true,
      healthScore: r.healthScore,
    };
  }));
});

// ── POST /devices ─────────────────────────────────────────────────────────────

router.post("/devices", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) {
    res.status(400).json({ error: "org_required", message: "Impersonate a specific org before registering devices" });
    return;
  }

  const body = RegisterDeviceBody.parse(req.body);

  const plants = getOrgPlants(orgId);
  if (!plants.find((p) => p.id === body.plantId)) {
    res.status(404).json({ error: "not_found", message: "Plant not found" });
    return;
  }

  // Validate template if provided
  if (body.templateId) {
    const [tmpl] = await db
      .select()
      .from(deviceTemplatesTable)
      .where(eq(deviceTemplatesTable.id, body.templateId));
    if (!tmpl || (tmpl.orgId && tmpl.orgId !== orgId)) {
      res.status(400).json({ error: "invalid_template", message: "Template not found" });
      return;
    }
  }

  // SSRF guard — block loopback/metadata targets before persisting or starting a driver
  const targetUrl = body.url ?? (body.ipAddress ? `tcp://${body.ipAddress}:${body.port ?? 502}` : null)
                  ?? body.brokerUrl ?? null;
  if (targetUrl) {
    try { assertNotSsrfTarget(targetUrl); }
    catch (err) {
      if (err instanceof SsrfBlockedError) {
        res.status(400).json({ error: "ssrf_blocked", message: err.message });
        return;
      }
    }
  }

  const config: DeviceConfig = {
    ipAddress:          body.ipAddress,
    port:               body.port,
    modbusUnitId:       body.modbusUnitId,
    brokerUrl:          body.brokerUrl,
    topic:              body.topic,
    url:                body.url,
    pollingIntervalSec: body.pollingIntervalSec,
    httpAuthMethod:     body.httpAuthMethod,
    // Encrypt credential at rest — never store plaintext
    httpAuthValue:      body.httpAuthValue ? encryptCredential(body.httpAuthValue) : undefined,
    httpApiKeyHeader:   body.httpApiKeyHeader,
    serialPort:         body.serialPort,
    baudRate:           body.baudRate,
    parity:             body.parity,
    dataBits:           body.dataBits,
    stopBits:           body.stopBits,
    opcuaSecurityMode:  body.opcuaSecurityMode,
    opcuaUsername:      body.opcuaUsername,
    // Encrypt credential at rest — never store plaintext
    opcuaPassword:      body.opcuaPassword ? encryptCredential(body.opcuaPassword) : undefined,
    bacnetDeviceInstance: body.bacnetDeviceInstance,
    pendingDeploy:      false,
  };

  const now = new Date();
  const deviceId = randomUUID();
  const [created] = await db
    .insert(devicesTable)
    .values({
      id: deviceId,
      orgId,
      plantId:    body.plantId,
      name:       body.name,
      type:       body.type,
      protocol:   body.protocol,
      templateId: body.templateId ?? null,
      status:     "offline",
      config,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  req.log.info({ deviceId }, "Device registered");

  // Start driver if connection info is present
  await driverRegistry.restartDevice(deviceId).catch(() => undefined);

  res.status(201).json(toDeviceResponse(created!, now));
});

// ── GET /devices/firmware-report ──────────────────────────────────────────────
// Org-scoped fleet report: devices grouped by model, current firmware vs.
// latest known-good version, flagging which devices need an update.
// Registered before /devices/:id so "firmware-report" isn't matched as an id.

router.get("/devices/firmware-report", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const conditions: SQL[] = [];
  const oc = orgCondition(devicesTable.orgId, orgId);
  if (oc) conditions.push(oc);

  const rows = await db
    .select({
      id: devicesTable.id,
      name: devicesTable.name,
      plantId: devicesTable.plantId,
      firmwareVersion: devicesTable.firmwareVersion,
      templateId: devicesTable.templateId,
      status: devicesTable.status,
    })
    .from(devicesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(devicesTable.name);

  const templateIds = Array.from(new Set(rows.map((r) => r.templateId).filter((t): t is string => !!t)));
  const templates = templateIds.length > 0
    ? await db.select().from(deviceTemplatesTable).where(sql`${deviceTemplatesTable.id} = ANY(${templateIds})`)
    : [];
  const templateById = new Map(templates.map((t) => [t.id, t]));

  const now = new Date();
  const groups = new Map<string, {
    manufacturer: string;
    model: string;
    latestFirmwareVersion: string | null;
    devices: { id: string; name: string; plantId: string; firmwareVersion: string; upToDate: boolean; status: string }[];
  }>();

  for (const r of rows) {
    const tmpl = r.templateId ? templateById.get(r.templateId) : undefined;
    const groupKey = tmpl ? `${tmpl.manufacturer}::${tmpl.model}` : "unassigned";
    const firmwareVersion = r.firmwareVersion ?? deviceStatus(r.id, now).firmwareVersion;
    const latest = tmpl?.latestFirmwareVersion ?? null;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        manufacturer: tmpl?.manufacturer ?? "Unassigned",
        model: tmpl?.model ?? "No template",
        latestFirmwareVersion: latest,
        devices: [],
      });
    }
    groups.get(groupKey)!.devices.push({
      id: r.id,
      name: r.name,
      plantId: r.plantId,
      firmwareVersion,
      upToDate: latest ? firmwareVersion === latest : true,
      status: r.status,
    });
  }

  const report = Array.from(groups.values()).map((g) => ({
    ...g,
    totalDevices: g.devices.length,
    outdatedDevices: g.devices.filter((d) => !d.upToDate).length,
  }));

  res.json(report);
});

// ── GET /devices/:id ──────────────────────────────────────────────────────────

router.get("/devices/:id", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, (req.params["id"] as string) ?? ""));
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  const now = new Date();
  const timeline = deviceConnectivityTimeline(row.id, now);

  // Fetch template info if assigned
  let template = null;
  if (row.templateId) {
    const [tmpl] = await db
      .select()
      .from(deviceTemplatesTable)
      .where(eq(deviceTemplatesTable.id, row.templateId));
    if (tmpl) template = { id: tmpl.id, manufacturer: tmpl.manufacturer, model: tmpl.model, fieldMap: tmpl.fieldMap, latestFirmwareVersion: tmpl.latestFirmwareVersion ?? null };
  }

  const base = toDeviceResponse(row, now);
  res.json({
    ...base,
    healthScore: row.healthScore,
    consecutiveFailures: row.consecutiveFailures,
    latestFirmwareVersion: template?.latestFirmwareVersion ?? null,
    firmwareUpToDate: template?.latestFirmwareVersion ? base.firmwareVersion === template.latestFirmwareVersion : true,
    template,
    connectivityTimeline: timeline.map((p) => ({
      timestamp: p.timestamp,
      status: p.status,
    })),
  });
});

// ── PATCH /devices/:id ────────────────────────────────────────────────────────

router.patch("/devices/:id", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const deviceId = (req.params["id"] as string) ?? "";
  const [existing] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (!existing || (orgId !== null && existing.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  const body = UpdateDeviceBody.parse(req.body);

  // Validate new template if changing
  if (body.templateId) {
    const [tmpl] = await db
      .select()
      .from(deviceTemplatesTable)
      .where(eq(deviceTemplatesTable.id, body.templateId));
    if (!tmpl || (tmpl.orgId && orgId !== null && tmpl.orgId !== orgId)) {
      res.status(400).json({ error: "invalid_template", message: "Template not found" });
      return;
    }
  }

  // SSRF guard on updated network targets
  const patchUrl = body.url
    ?? (body.ipAddress ? `tcp://${body.ipAddress}:${body.port ?? 502}` : null)
    ?? body.brokerUrl ?? null;
  if (patchUrl) {
    try { assertNotSsrfTarget(patchUrl); }
    catch (err) {
      if (err instanceof SsrfBlockedError) {
        res.status(400).json({ error: "ssrf_blocked", message: err.message });
        return;
      }
    }
  }

  const currentCfg = parseConfig(existing.config);
  const newCfg: DeviceConfig = {
    ...currentCfg,
    ...(body.ipAddress !== undefined          && { ipAddress:          body.ipAddress }),
    ...(body.port !== undefined               && { port:               body.port }),
    ...(body.modbusUnitId !== undefined       && { modbusUnitId:       body.modbusUnitId }),
    ...(body.brokerUrl !== undefined          && { brokerUrl:          body.brokerUrl }),
    ...(body.topic !== undefined              && { topic:              body.topic }),
    ...(body.url !== undefined                && { url:                body.url }),
    ...(body.pollingIntervalSec !== undefined && { pollingIntervalSec: body.pollingIntervalSec }),
    // Auth: update method and header name as-is; encrypt value when provided
    ...(body.httpAuthMethod !== undefined     && { httpAuthMethod:     body.httpAuthMethod }),
    ...(body.httpApiKeyHeader !== undefined   && { httpApiKeyHeader:   body.httpApiKeyHeader }),
    ...(body.httpAuthValue !== undefined      && {
      // Empty string clears the credential; non-empty encrypts it
      httpAuthValue: body.httpAuthValue ? encryptCredential(body.httpAuthValue) : undefined,
    }),
    ...(body.serialPort !== undefined         && { serialPort:         body.serialPort }),
    ...(body.baudRate !== undefined           && { baudRate:           body.baudRate }),
    ...(body.parity !== undefined             && { parity:             body.parity }),
    ...(body.dataBits !== undefined           && { dataBits:           body.dataBits }),
    ...(body.stopBits !== undefined           && { stopBits:           body.stopBits }),
    ...(body.opcuaSecurityMode !== undefined  && { opcuaSecurityMode:  body.opcuaSecurityMode }),
    ...(body.opcuaUsername !== undefined      && { opcuaUsername:      body.opcuaUsername }),
    ...(body.opcuaPassword !== undefined      && {
      // Empty string clears the credential; non-empty encrypts it
      opcuaPassword: body.opcuaPassword ? encryptCredential(body.opcuaPassword) : undefined,
    }),
    ...(body.bacnetDeviceInstance !== undefined && { bacnetDeviceInstance: body.bacnetDeviceInstance }),
    pendingDeploy: true,
  };

  const now = new Date();
  const updates: Partial<typeof devicesTable.$inferInsert> = {
    config:    newCfg,
    updatedAt: now,
  };
  if (body.name)                         updates.name       = body.name;
  if (body.templateId !== undefined)     updates.templateId = body.templateId ?? null;

  const [updated] = await db.update(devicesTable).set(updates).where(eq(devicesTable.id, deviceId)).returning();
  req.log.info({ deviceId }, "Device config updated — pending deploy");

  // Restart the driver to pick up new config/template
  await driverRegistry.restartDevice(deviceId).catch(() => undefined);

  res.json(toDeviceResponse(updated!, now));
});

// ── POST /devices/:id/restart ─────────────────────────────────────────────────

router.post("/devices/:id/restart", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const deviceId = (req.params["id"] as string) ?? "";
  const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  req.log.info({ deviceId }, "Device restart requested");
  await db.update(devicesTable).set({ updatedAt: new Date() }).where(eq(devicesTable.id, deviceId));
  await driverRegistry.restartDevice(deviceId).catch(() => undefined);
  res.json({ ok: true, message: "Restart command sent to device" });
});

// ── POST /devices/:id/sync ────────────────────────────────────────────────────

router.post("/devices/:id/sync", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const deviceId = (req.params["id"] as string) ?? "";
  const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  const cfg = parseConfig(row.config);
  cfg.pendingDeploy = false;
  const [updated] = await db
    .update(devicesTable)
    .set({ config: cfg, updatedAt: new Date() })
    .where(eq(devicesTable.id, deviceId))
    .returning();

  req.log.info({ deviceId }, "Device config sync acknowledged");
  res.json({ ok: true, message: "Config synced to device", pendingDeploy: false, updatedAt: updated?.updatedAt });
});

// ── GET /devices/:id/logs ─────────────────────────────────────────────────────

router.get("/devices/:id/logs", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const deviceId = (req.params["id"] as string) ?? "";
  const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  const count = Math.min(Number(req.query["count"] ?? 100), 500);
  const eventTypeFilter = (req.query["eventType"] as string | undefined)?.trim();
  const levelFilter = (req.query["level"] as string | undefined)?.trim().toUpperCase();

  // Return real comm logs if they exist, otherwise simulation
  const conditions: SQL[] = [eq(deviceCommLogsTable.deviceId, deviceId)];
  if (eventTypeFilter) conditions.push(eq(deviceCommLogsTable.eventType, eventTypeFilter));
  const realLogs = await db
    .select()
    .from(deviceCommLogsTable)
    .where(and(...conditions))
    .orderBy(desc(deviceCommLogsTable.occurredAt))
    .limit(count);

  if (realLogs.length > 0) {
    let mapped = realLogs.map((l) => ({
      timestamp: l.occurredAt,
      level:     l.eventType === "READ_OK" || l.eventType === "CONNECT" ? "INFO"
               : l.eventType === "PARSE_ERROR" ? "WARN" : "ERROR",
      message:   `[${l.eventType}] ${l.message ?? ""}${l.rttMs != null ? ` (${l.rttMs}ms)` : ""}`,
      eventType: l.eventType,
      registerAddr: l.registerAddr,
      rttMs:     l.rttMs,
    }));
    if (levelFilter) mapped = mapped.filter((m) => m.level === levelFilter);
    res.json(mapped);
    return;
  }

  // Fallback to simulation
  let simLogs = deviceLogs(deviceId, count, new Date()).map((l) => ({ ...l, eventType: null, registerAddr: null, rttMs: null }));
  if (levelFilter) simLogs = simLogs.filter((l) => l.level === levelFilter);
  res.json(simLogs);
});

// ── GET /devices/:id/diagnostics ──────────────────────────────────────────────
// Health score, 24h connectivity timeline, polling stats, and error breakdown
// for the Diagnostics tab.

router.get("/devices/:id/diagnostics", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const deviceId = (req.params["id"] as string) ?? "";
  const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const commLogs24h = await db
    .select()
    .from(deviceCommLogsTable)
    .where(and(eq(deviceCommLogsTable.deviceId, deviceId), sql`${deviceCommLogsTable.occurredAt} >= ${dayAgo}`))
    .orderBy(deviceCommLogsTable.occurredAt);

  const hasRealData = commLogs24h.length > 0;
  const BUCKET_MS = 15 * 60 * 1000;
  const BUCKET_COUNT = 96;

  // ── Connectivity timeline (96 x 15-min buckets over 24h) ──
  let connectivityTimeline: { timestamp: string; status: string; successCount: number; failureCount: number }[];
  if (hasRealData) {
    const buckets = new Map<number, { success: number; failure: number }>();
    for (const log of commLogs24h) {
      const bucketIdx = Math.floor((log.occurredAt.getTime() - dayAgo.getTime()) / BUCKET_MS);
      const b = buckets.get(bucketIdx) ?? { success: 0, failure: 0 };
      if (log.eventType === "READ_OK" || log.eventType === "CONNECT") b.success++;
      else if (log.eventType !== "STATUS") b.failure++;
      buckets.set(bucketIdx, b);
    }
    connectivityTimeline = Array.from({ length: BUCKET_COUNT }, (_, i) => {
      const ts = new Date(dayAgo.getTime() + i * BUCKET_MS);
      const b = buckets.get(i);
      if (!b || (b.success === 0 && b.failure === 0)) {
        return { timestamp: ts.toISOString(), status: "no_data", successCount: 0, failureCount: 0 };
      }
      const status = b.failure === 0 ? "online" : b.success === 0 ? "offline" : "degraded";
      return { timestamp: ts.toISOString(), status, successCount: b.success, failureCount: b.failure };
    });
  } else {
    connectivityTimeline = deviceConnectivityTimeline(deviceId, now).map((p) => ({
      timestamp: p.timestamp.toISOString(),
      status: p.status,
      successCount: p.status === "online" ? 1 : 0,
      failureCount: p.status === "online" ? 0 : 1,
    }));
  }

  // ── Polling stats ──
  const healthStats = await driverRegistry.getHealthStats();
  const liveStat = healthStats.find((s) => s.deviceId === deviceId);
  const realOkCount = commLogs24h.filter((l) => l.eventType === "READ_OK").length;
  const realFailCount = commLogs24h.filter((l) => l.eventType !== "READ_OK" && l.eventType !== "CONNECT" && l.eventType !== "STATUS").length;
  const realRtts = commLogs24h.filter((l) => l.rttMs != null).map((l) => l.rttMs as number);

  const pollingStats = hasRealData || liveStat
    ? {
        readingCount24h: realOkCount,
        errorCount24h: realFailCount,
        successRate24h: realOkCount + realFailCount > 0 ? Math.round((realOkCount / (realOkCount + realFailCount)) * 100) : null,
        avgRttMs: realRtts.length > 0 ? Math.round(realRtts.reduce((a, b) => a + b, 0) / realRtts.length) : (liveStat?.lastRttMs ?? null),
        lastRttMs: liveStat?.lastRttMs ?? (realRtts.length > 0 ? realRtts[realRtts.length - 1]! : null),
        lastReadingAt: liveStat?.lastReadingAt ?? row.lastSeenAt,
        driverStatus: liveStat?.status ?? "no_driver",
      }
    : {
        readingCount24h: connectivityTimeline.filter((p) => p.status === "online").length,
        errorCount24h: connectivityTimeline.filter((p) => p.status === "offline" || p.status === "error").length,
        successRate24h: Math.round((connectivityTimeline.filter((p) => p.status === "online").length / BUCKET_COUNT) * 100),
        avgRttMs: null,
        lastRttMs: null,
        lastReadingAt: row.lastSeenAt ?? deviceStatus(deviceId, now).lastSeenAt,
        driverStatus: "simulated",
      };

  // ── Error breakdown donut ──
  let errorBreakdown: { category: string; count: number }[];
  if (hasRealData) {
    const categoryOf = (eventType: string): string => {
      switch (eventType) {
        case "TIMEOUT": return "Timeout";
        case "PARSE_ERROR": return "Parse Error";
        case "DISCONNECT": return "Disconnect";
        case "ERROR": return "Connection Error";
        case "READ_FAIL": return "Read Failure";
        default: return "Other";
      }
    };
    const counts = new Map<string, number>();
    for (const l of commLogs24h) {
      if (l.eventType === "READ_OK" || l.eventType === "CONNECT" || l.eventType === "STATUS") continue;
      const cat = categoryOf(l.eventType);
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    errorBreakdown = Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
  } else {
    const simLogs = deviceLogs(deviceId, 200, now).filter((l) => l.level !== "INFO");
    const counts = new Map<string, number>();
    for (const l of simLogs) {
      const cat = /timeout/i.test(l.message) ? "Timeout"
                : /crc|checksum|mismatch/i.test(l.message) ? "Parse Error"
                : /refused|disconnect/i.test(l.message) ? "Disconnect"
                : /auth/i.test(l.message) ? "Connection Error"
                : "Other";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    errorBreakdown = Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
  }

  const healthScore = row.healthScore ?? (
    hasRealData ? null : Math.max(0, Math.min(100, Math.round(
      (connectivityTimeline.filter((p) => p.status === "online").length / BUCKET_COUNT) * 100,
    )))
  );

  res.json({
    deviceId,
    healthScore,
    consecutiveFailures: row.consecutiveFailures ?? 0,
    dataSource: hasRealData ? "live" : "simulated",
    connectivityTimeline,
    pollingStats,
    errorBreakdown,
  });
});

// ── GET /devices/:id/firmware-history ─────────────────────────────────────────

router.get("/devices/:id/firmware-history", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const deviceId = (req.params["id"] as string) ?? "";
  const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  const history = await db
    .select()
    .from(firmwareVersionHistoryTable)
    .where(eq(firmwareVersionHistoryTable.deviceId, deviceId))
    .orderBy(desc(firmwareVersionHistoryTable.detectedAt));

  res.json(history.map((h) => ({
    id: h.id,
    previousVersion: h.previousVersion,
    newVersion: h.newVersion,
    detectedAt: h.detectedAt,
  })));
});

// ── POST /devices/:id/import-readings ─────────────────────────────────────────

router.post(
  "/devices/:id/import-readings",
  requirePermission("device.manage"),
  async (req, res) => {
    const orgId    = resolveOrgId(req);
    const deviceId = (req.params["id"] as string) ?? "";
    const [row]    = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
    if (!row || (orgId !== null && row.orgId !== orgId)) {
      res.status(404).json({ error: "not_found", message: "Device not found" });
      return;
    }

    // Accept text/csv body
    const body = req.body as unknown;
    if (typeof body !== "string" || !body.trim()) {
      res.status(400).json({ error: "bad_request", message: "Send CSV data as text/csv body" });
      return;
    }

    const { headers, rows } = parseCsv(body);
    if (headers.length === 0) {
      res.status(400).json({ error: "bad_request", message: "CSV has no headers" });
      return;
    }

    // First column must be timestamp-ish
    const tsCol = headers.find((h) =>
      /^(timestamp|ts|time|datetime|date_time)$/i.test(h),
    ) ?? headers[0]!;
    const paramCols = headers.filter((h) => h !== tsCol);

    if (paramCols.length === 0) {
      res.status(400).json({ error: "bad_request", message: "CSV must have at least one parameter column beyond the timestamp" });
      return;
    }

    // Cap to 10 000 rows per upload to bound memory and DB impact
    const MAX_IMPORT_ROWS = 10_000;
    if (rows.length > MAX_IMPORT_ROWS) {
      res.status(400).json({
        error: "too_many_rows",
        message: `CSV has ${rows.length} data rows — maximum is ${MAX_IMPORT_ROWS} per upload. Split into smaller files.`,
      });
      return;
    }

    let imported = 0;
    let skippedInvalid = 0;
    let skippedDuplicate = 0;

    // Batch-insert in chunks of 500; check existing timestamps to handle deduplication
    // without a DB unique constraint. Collect valid rows first.
    const toInsert: { ts: Date; params: Record<string, number | string> }[] = [];
    const parseErrors: string[] = [];

    for (const r of rows) {
      const raw = r[tsCol];
      if (!raw?.trim()) continue;
      const ts = new Date(raw.trim());
      if (isNaN(ts.getTime())) {
        parseErrors.push(`Invalid timestamp: ${raw}`);
        skippedInvalid++;
        continue;
      }
      const params: Record<string, number | string> = {};
      for (const col of paramCols) {
        const val = r[col];
        if (val !== undefined && val !== "") {
          const num = Number(val);
          params[col] = isNaN(num) ? val : num;
        }
      }
      if (Object.keys(params).length === 0) { skippedInvalid++; continue; }
      toInsert.push({ ts, params });
    }

    // Batch insert in chunks; count actual inserts via returning()
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const values = chunk.map((c) => ({
        id:       randomUUID(),
        deviceId,
        orgId:    row.orgId,
        ts:       c.ts,
        params:   c.params,
      }));
      // Use INSERT … ON CONFLICT DO NOTHING; count rows actually inserted via returning
      const inserted = await db
        .insert(deviceReadingsTable)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: deviceReadingsTable.id });
      imported        += inserted.length;
      skippedDuplicate += chunk.length - inserted.length;
    }

    // Apply same bounded-retention policy as live driver ingestion
    if (imported > 0) {
      await db.execute(sql`
        DELETE FROM device_readings
        WHERE device_id = ${deviceId}
          AND id NOT IN (
            SELECT id FROM device_readings
            WHERE device_id = ${deviceId}
            ORDER BY ts DESC
            LIMIT 2000
          )
      `);
    }

    req.log.info({ deviceId, imported, skippedInvalid, skippedDuplicate }, "CSV readings imported");
    res.json({
      ok: true,
      imported,
      skipped:  skippedInvalid + skippedDuplicate,
      columns:  paramCols,
      errors:   parseErrors.slice(0, 10),
    });
  },
);

// ── GET /devices/:id/readings ─────────────────────────────────────────────────

router.get("/devices/:id/readings", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const deviceId = (req.params["id"] as string) ?? "";
  const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  const limit = Math.min(Number(req.query["limit"] ?? 1), 100);
  const readings = await db
    .select()
    .from(deviceReadingsTable)
    .where(eq(deviceReadingsTable.deviceId, deviceId))
    .orderBy(desc(deviceReadingsTable.ts))
    .limit(limit);

  res.json(readings.map((r) => ({ ts: r.ts, params: r.params })));
});

// ── GET /devices/:id/connection-test ──────────────────────────────────────────

router.get("/devices/:id/connection-test", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const deviceId = (req.params["id"] as string) ?? "";
  const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (!row || (orgId !== null && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Device not found" });
    return;
  }

  const cfg = parseConfig(row.config);
  const protocol = toDriverProtocol(row.protocol);
  if (!protocol) {
    res.status(400).json({ error: "unsupported_protocol", message: `Protocol '${row.protocol}' is not supported by the driver framework` });
    return;
  }

  // Resolve field map from template
  let fieldMap: FieldDef[] = [];
  if (row.templateId) {
    const [tmpl] = await db
      .select()
      .from(deviceTemplatesTable)
      .where(eq(deviceTemplatesTable.id, row.templateId));
    if (tmpl?.fieldMap) fieldMap = tmpl.fieldMap as FieldDef[];
  }

  const driverCfg: DriverConfig = {
    deviceId,
    protocol,
    ipAddress:        cfg.ipAddress,
    port:             cfg.port,
    modbusUnitId:     cfg.modbusUnitId,
    brokerUrl:        cfg.brokerUrl,
    topic:            cfg.topic,
    url:              cfg.url,
    httpAuthMethod:   cfg.httpAuthMethod,
    // Decrypt at point-of-use — never expose ciphertext to the driver
    httpAuthValue:    cfg.httpAuthValue ? decryptCredential(cfg.httpAuthValue) : undefined,
    httpApiKeyHeader: cfg.httpApiKeyHeader,
    serialPort:       cfg.serialPort,
    baudRate:         cfg.baudRate,
    parity:           cfg.parity,
    dataBits:         cfg.dataBits,
    stopBits:         cfg.stopBits,
    opcuaSecurityMode: cfg.opcuaSecurityMode,
    opcuaUsername:    cfg.opcuaUsername,
    // Decrypt at point-of-use — never expose ciphertext to the driver
    opcuaPassword:    cfg.opcuaPassword ? decryptCredential(cfg.opcuaPassword) : undefined,
    bacnetDeviceInstance: cfg.bacnetDeviceInstance,
    pollingIntervalS: cfg.pollingIntervalSec ?? 30,
    fieldMap,
  };

  // SSRF guard — block loopback / link-local / metadata targets
  try {
    assertNotSsrfTarget(driverCfg.ipAddress);
    assertNotSsrfTarget(driverCfg.brokerUrl);
    assertNotSsrfTarget(driverCfg.url);
  } catch (e) {
    if (e instanceof SsrfBlockedError) {
      res.status(400).json({ ok: false, error: "ssrf_blocked", message: e.message });
      return;
    }
    throw e;
  }

  const driver = driverRegistry.makeTestDriver(driverCfg);
  if (!driver) {
    res.status(400).json({
      ok: false,
      error: "no_connection_info",
      message: "Device has no connection parameters configured (IP address, broker URL, endpoint URL, or serial port required)",
    });
    return;
  }

  req.log.info({ deviceId, protocol }, "Connection test initiated");
  const result = await driver.test(5_000);
  req.log.info({ deviceId, ok: result.ok, latencyMs: result.latencyMs }, "Connection test complete");
  res.json(result);
});

export default router;
