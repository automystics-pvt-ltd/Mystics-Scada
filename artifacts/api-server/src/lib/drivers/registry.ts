/**
 * Driver Registry
 *
 * Singleton that manages one driver instance per device.
 * - Starts drivers for all configured devices on server boot
 * - Persists readings to device_readings table
 * - Writes communication events to device_comm_logs table
 * - Updates devices.status and devices.last_seen_at on each reading
 * - Restarts a driver when its device config changes
 * - Prunes old readings / comm logs to keep the DB bounded
 * - Exposes per-driver health stats (status, RTT, counts, last reading)
 */

import { randomUUID } from "node:crypto";
import { eq, and, lt, sql } from "drizzle-orm";
import { db, devicesTable, deviceReadingsTable, deviceCommLogsTable, deviceTemplatesTable, ingestionRetryQueueTable, firmwareVersionHistoryTable } from "@workspace/db";
import { logger } from "../logger.js";
import { decryptCredential } from "../credentialCrypto.js";
import type { IDriver, DriverConfig, DriverStatus, FieldDef } from "./types.js";
import { ModbusTcpDriver } from "./ModbusTcpDriver.js";
import { ModbusRtuDriver } from "./ModbusRtuDriver.js";
import { MqttDriver } from "./MqttDriver.js";
import { HttpDriver } from "./HttpDriver.js";
import { WebSocketDriver } from "./WebSocketDriver.js";
import { OpcuaDriver } from "./opcua-driver.js";
import { BacnetDriver } from "./bacnet-driver.js";
import { applyFormulas } from "../formulaEngine.js";
import { publish } from "../sseRegistry.js";
import { computeDeviceHealthScore } from "../deviceHealth.js";
import { resolveDeviceOfflineAlert } from "../offlineDetection.js";

const DEVICE_READING_CHANNEL = "device_reading";

const MAX_READINGS_PER_DEVICE = 2_000;
const MAX_COMM_LOGS_PER_DEVICE = 1_000;

// ─── Types ────────────────────────────────────────────────────────────────────

type DeviceRow = typeof devicesTable.$inferSelect;

type DeviceConfig = {
  ipAddress?: string;
  port?: number;
  modbusUnitId?: number;
  brokerUrl?: string;
  topic?: string;
  url?: string;
  pollingIntervalSec?: number;
  httpAuthMethod?: "none" | "bearer" | "api_key" | "basic";
  httpAuthValue?: string;
  httpApiKeyHeader?: string;
  serialPort?: string;
  baudRate?: number;
  parity?: "none" | "even" | "odd";
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  opcuaSecurityMode?: "None" | "Sign" | "SignAndEncrypt";
  opcuaUsername?: string;
  opcuaPassword?: string;
  bacnetDeviceInstance?: number;
  [key: string]: unknown;
};

export interface DriverHealthStat {
  deviceId: string;
  deviceName: string;
  protocol: string;
  orgId: string;
  plantId: string;
  status: DriverStatus | "no_driver";
  startedAt: Date | null;
  lastReadingAt: Date | null;
  lastRttMs: number | null;
  readingCount: number;
  errorCount: number;
  /** Active NodeId/object subscriptions being polled — only meaningful for opcua/bacnet drivers. */
  subscriptionCount: number | null;
}

interface InternalStat {
  deviceName: string;
  protocol: string;
  orgId: string;
  plantId: string;
  startedAt: Date;
  lastReadingAt: Date | null;
  lastRttMs: number | null;
  readingCount: number;
  errorCount: number;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeDriver(cfg: DriverConfig): IDriver | null {
  switch (cfg.protocol) {
    case "modbus_tcp":
      if (!cfg.ipAddress) return null;
      return new ModbusTcpDriver(cfg);
    case "modbus_rtu":
      if (!cfg.serialPort) return null;
      return new ModbusRtuDriver(cfg);
    case "mqtt":
      if (!cfg.brokerUrl) return null;
      return new MqttDriver(cfg);
    case "http":
      if (!cfg.ipAddress && !cfg.url) return null;
      return new HttpDriver(cfg);
    case "websocket":
      if (!cfg.ipAddress && !cfg.url) return null;
      return new WebSocketDriver(cfg);
    case "opcua":
      if (!cfg.url && !cfg.ipAddress) return null;
      return new OpcuaDriver(cfg);
    case "bacnet":
      if (!cfg.ipAddress) return null;
      return new BacnetDriver(cfg);
    default:
      return null;
  }
}

function normalizeProtocol(raw: string): DriverConfig["protocol"] | null {
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

// ─── Registry ─────────────────────────────────────────────────────────────────

class DriverRegistry {
  private _drivers   = new Map<string, IDriver>();
  private _stats     = new Map<string, InternalStat>();
  private _fieldMaps = new Map<string, FieldDef[]>();
  /** All device rows that were loaded at init (includes those without drivers) */
  private _allDevices: DeviceRow[] = [];
  /** deviceId -> fieldMap key that carries the firmware version string, from the assigned template */
  private _firmwareParams = new Map<string, string>();
  /** deviceId -> last known firmware version, cached to avoid a DB round-trip on every reading */
  private _firmwareVersions = new Map<string, string | null>();

  async init(): Promise<void> {
    logger.info("DriverRegistry: initializing drivers for all configured devices");
    try {
      this._allDevices = await db.select().from(devicesTable);
      let started = 0;
      for (const device of this._allDevices) {
        const launched = await this._launchDriver(device);
        if (launched) started++;
      }
      logger.info({ started, total: this._allDevices.length }, "DriverRegistry: initialization complete");
    } catch (err) {
      logger.error({ err }, "DriverRegistry: failed to load devices on init");
    }
  }

  /** Returns per-driver health stats for the monitoring dashboard */
  async getHealthStats(): Promise<DriverHealthStat[]> {
    // Refresh device list to pick up devices registered after boot
    const devices = await db.select().from(devicesTable).catch(() => this._allDevices);

    return devices.map((d) => {
      const driver = this._drivers.get(d.id);
      const stat   = this._stats.get(d.id);
      return {
        deviceId:      d.id,
        deviceName:    d.name,
        protocol:      d.protocol,
        orgId:         d.orgId,
        plantId:       d.plantId,
        status:        driver ? driver.status : "no_driver",
        startedAt:     stat?.startedAt ?? null,
        lastReadingAt: stat?.lastReadingAt ?? null,
        lastRttMs:     stat?.lastRttMs ?? null,
        readingCount:  stat?.readingCount ?? 0,
        errorCount:    stat?.errorCount ?? 0,
        subscriptionCount:
          driver && (driver instanceof OpcuaDriver || driver instanceof BacnetDriver) ? driver.subscriptionCount : null,
      };
    });
  }

  /** Call this after a device's config or template changes */
  async restartDevice(deviceId: string): Promise<void> {
    await this._stopDriver(deviceId);
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
    if (device) {
      // Keep it in the device list
      const idx = this._allDevices.findIndex((d) => d.id === deviceId);
      if (idx >= 0) this._allDevices[idx] = device;
      else this._allDevices.push(device);
      await this._launchDriver(device);
    }
  }

  /** Used by connection-test endpoint — instantiates a throw-away driver */
  makeTestDriver(cfg: DriverConfig): IDriver | null {
    return makeDriver(cfg);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async _launchDriver(device: DeviceRow): Promise<boolean> {
    const rawCfg   = (device.config ?? {}) as DeviceConfig;
    const protocol = normalizeProtocol(device.protocol);
    if (!protocol) return false;

    // Resolve field map from template (if assigned)
    let fieldMap: FieldDef[] = [];
    if (device.templateId) {
      const [tmpl] = await db
        .select()
        .from(deviceTemplatesTable)
        .where(eq(deviceTemplatesTable.id, device.templateId));
      if (tmpl?.fieldMap) fieldMap = tmpl.fieldMap as FieldDef[];
      if (tmpl?.firmwareVersionParam) this._firmwareParams.set(device.id, tmpl.firmwareVersionParam);
      else this._firmwareParams.delete(device.id);
    } else {
      this._firmwareParams.delete(device.id);
    }
    this._firmwareVersions.set(device.id, device.firmwareVersion ?? null);

    const driverCfg: DriverConfig = {
      deviceId:         device.id,
      protocol,
      ipAddress:        rawCfg.ipAddress,
      port:             rawCfg.port,
      modbusUnitId:     rawCfg.modbusUnitId,
      brokerUrl:        rawCfg.brokerUrl,
      topic:            rawCfg.topic,
      url:              rawCfg.url,
      httpAuthMethod:   rawCfg.httpAuthMethod,
      // Decrypt at point-of-use — the driver never sees the ciphertext
      httpAuthValue:    rawCfg.httpAuthValue ? decryptCredential(rawCfg.httpAuthValue) : undefined,
      httpApiKeyHeader: rawCfg.httpApiKeyHeader,
      serialPort:       rawCfg.serialPort,
      baudRate:         rawCfg.baudRate,
      parity:           rawCfg.parity,
      dataBits:         rawCfg.dataBits,
      stopBits:         rawCfg.stopBits,
      opcuaSecurityMode: rawCfg.opcuaSecurityMode,
      opcuaUsername:    rawCfg.opcuaUsername,
      // Decrypt at point-of-use — the driver never sees the ciphertext
      opcuaPassword:    rawCfg.opcuaPassword ? decryptCredential(rawCfg.opcuaPassword) : undefined,
      bacnetDeviceInstance: rawCfg.bacnetDeviceInstance,
      pollingIntervalS: rawCfg.pollingIntervalSec ?? 30,
      fieldMap,
    };

    const driver = makeDriver(driverCfg);
    if (!driver) return false;

    this._fieldMaps.set(device.id, fieldMap);
    this._drivers.set(device.id, driver);
    this._stats.set(device.id, {
      deviceName:    device.name,
      protocol:      device.protocol,
      orgId:         device.orgId,
      plantId:       device.plantId,
      startedAt:     new Date(),
      lastReadingAt: null,
      lastRttMs:     null,
      readingCount:  0,
      errorCount:    0,
    });
    this._wire(driver, device.orgId);
    driver.start();
    return true;
  }

  private async _stopDriver(deviceId: string): Promise<void> {
    const existing = this._drivers.get(deviceId);
    if (existing) {
      await existing.stop().catch(() => undefined);
      this._drivers.delete(deviceId);
    }
    this._fieldMaps.delete(deviceId); // prevent stale-memory accumulation
    this._firmwareParams.delete(deviceId);
    this._firmwareVersions.delete(deviceId);
    // Keep stats — cleared on re-launch
  }

  private _wire(driver: IDriver, orgId: string): void {
    const deviceId = driver.deviceId;

    driver.on("reading", (params: Record<string, unknown>) => {
      const fieldMap = this._fieldMaps.get(deviceId);
      // Apply formula-derived fields once, then fan out to both the live SSE
      // stream (real-time, low-latency) and durable persistence.
      const processed: Record<string, unknown> = fieldMap?.some((f) => f.formula)
        ? applyFormulas(params as Record<string, number | string | boolean | null>, fieldMap)
        : params;

      publish(DEVICE_READING_CHANNEL, orgId, {
        deviceId,
        ts: new Date().toISOString(),
        params: processed,
      });

      void this._persistReading(deviceId, orgId, processed);
      void this._checkFirmwareVersion(deviceId, processed);
    });

    driver.on("status", (status: string) => {
      void this._updateDeviceStatus(deviceId, status);
    });

    driver.on("log", (eventType: string, message: string, rttMs?: number) => {
      // Update health stats for READ_OK events
      if (eventType === "READ_OK") {
        const stat = this._stats.get(deviceId);
        if (stat) {
          stat.lastReadingAt = new Date();
          stat.readingCount  += 1;
          if (rttMs !== undefined) stat.lastRttMs = rttMs;
        }
      }
      void this._writeCommLog(deviceId, eventType, message, rttMs);
    });

    driver.on("error", (err: Error) => {
      const stat = this._stats.get(deviceId);
      if (stat) stat.errorCount += 1;
      logger.warn({ deviceId, err: err.message }, "Driver error");
      void db
        .update(devicesTable)
        .set({ consecutiveFailures: sql`${devicesTable.consecutiveFailures} + 1` })
        .where(eq(devicesTable.id, deviceId))
        .catch(() => undefined);
      void computeDeviceHealthScore(deviceId, new Date());
    });
  }

  private async _persistReading(
    deviceId: string,
    orgId: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    try {
      const now = new Date();
      await db.insert(deviceReadingsTable).values({
        id: randomUUID(),
        deviceId,
        orgId,
        ts: now,
        params,
      });

      await db
        .update(devicesTable)
        .set({ lastSeenAt: now, status: "online", consecutiveFailures: 0, updatedAt: now })
        .where(eq(devicesTable.id, deviceId));

      const stat = this._stats.get(deviceId);
      void resolveDeviceOfflineAlert(deviceId, orgId, stat?.deviceName ?? deviceId);
      void computeDeviceHealthScore(deviceId, now);

      await db.execute(sql`
        DELETE FROM device_readings
        WHERE device_id = ${deviceId}
          AND id NOT IN (
            SELECT id FROM device_readings
            WHERE device_id = ${deviceId}
            ORDER BY ts DESC
            LIMIT ${MAX_READINGS_PER_DEVICE}
          )
      `);
    } catch (err) {
      logger.error({ deviceId, err }, "Failed to persist device reading — queuing for retry");
      // Queue for durable retry with exponential back-off
      try {
        const backoffMs = 30_000;
        await db.insert(ingestionRetryQueueTable).values({
          id:          randomUUID(),
          deviceId,
          orgId,
          payload:     { ts: new Date().toISOString(), params },
          attempts:    0,
          maxAttempts: 5,
          status:      "pending",
          nextRetryAt: new Date(Date.now() + backoffMs),
        });
      } catch (queueErr) {
        logger.error({ deviceId, queueErr }, "Failed to queue reading for retry");
      }
    }
  }

  private async _updateDeviceStatus(deviceId: string, status: string): Promise<void> {
    try {
      const mappedStatus = status === "connected" ? "online"
        : status === "error" ? "error"
        : "offline";
      await db
        .update(devicesTable)
        .set({ status: mappedStatus, updatedAt: new Date() })
        .where(eq(devicesTable.id, deviceId));
    } catch (err) {
      // Non-critical — live telemetry continues even if the status column is stale.
      // Log at warn so DB connectivity issues surface in monitoring.
      logger.warn({ deviceId, err }, "Failed to update device status in DB (non-critical)");
    }
  }

  /** Detects a firmware version change from a decoded reading and records history. */
  private async _checkFirmwareVersion(deviceId: string, processed: Record<string, unknown>): Promise<void> {
    const paramKey = this._firmwareParams.get(deviceId);
    if (!paramKey) return;
    const raw = processed[paramKey];
    if (raw === undefined || raw === null) return;
    const newVersion = String(raw).trim();
    if (!newVersion) return;

    const previousVersion = this._firmwareVersions.get(deviceId) ?? null;
    if (previousVersion === newVersion) return;

    this._firmwareVersions.set(deviceId, newVersion);
    try {
      const now = new Date();
      await db.insert(firmwareVersionHistoryTable).values({
        id: randomUUID(),
        deviceId,
        previousVersion,
        newVersion,
        detectedAt: now,
      });
      await db.update(devicesTable).set({ firmwareVersion: newVersion, updatedAt: now }).where(eq(devicesTable.id, deviceId));
      logger.info({ deviceId, previousVersion, newVersion }, "Device firmware version change detected");
    } catch (err) {
      logger.warn({ deviceId, err }, "Failed to record firmware version change (non-critical)");
    }
  }

  private async _writeCommLog(
    deviceId: string,
    eventType: string,
    message: string,
    rttMs?: number,
  ): Promise<void> {
    try {
      await db.insert(deviceCommLogsTable).values({
        id: randomUUID(),
        deviceId,
        eventType,
        message,
        rttMs: rttMs ?? null,
        occurredAt: new Date(),
      });

      await db.execute(sql`
        DELETE FROM device_comm_logs
        WHERE device_id = ${deviceId}
          AND id NOT IN (
            SELECT id FROM device_comm_logs
            WHERE device_id = ${deviceId}
            ORDER BY occurred_at DESC
            LIMIT ${MAX_COMM_LOGS_PER_DEVICE}
          )
      `);
    } catch (err) {
      // Non-critical — missing a comm log entry does not affect telemetry.
      logger.warn({ deviceId, err }, "Failed to write device comm log (non-critical)");
    }
  }
}

export const driverRegistry = new DriverRegistry();
