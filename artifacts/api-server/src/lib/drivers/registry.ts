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
import { db, devicesTable, deviceReadingsTable, deviceCommLogsTable, deviceTemplatesTable, ingestionRetryQueueTable } from "@workspace/db";
import { logger } from "../logger.js";
import type { IDriver, DriverConfig, DriverStatus, FieldDef } from "./types.js";
import { ModbusTcpDriver } from "./ModbusTcpDriver.js";
import { MqttDriver } from "./MqttDriver.js";
import { HttpDriver } from "./HttpDriver.js";
import { WebSocketDriver } from "./WebSocketDriver.js";
import { OpcuaDriver } from "./opcua-driver.js";
import { applyFormulas } from "../formulaEngine.js";

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
    case "modbus_rtu":
      if (!cfg.ipAddress) return null;
      return new ModbusTcpDriver(cfg);
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
    }

    const driverCfg: DriverConfig = {
      deviceId:        device.id,
      protocol,
      ipAddress:       rawCfg.ipAddress,
      port:            rawCfg.port,
      modbusUnitId:    rawCfg.modbusUnitId,
      brokerUrl:       rawCfg.brokerUrl,
      topic:           rawCfg.topic,
      url:             rawCfg.url,
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
    // Keep stats — cleared on re-launch
  }

  private _wire(driver: IDriver, orgId: string): void {
    const deviceId = driver.deviceId;

    driver.on("reading", (params: Record<string, unknown>) => {
      // Pass fieldMap so formula-derived fields are computed before persistence
      void this._persistReading(deviceId, orgId, params, this._fieldMaps.get(deviceId));
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
    });
  }

  private async _persistReading(
    deviceId: string,
    orgId: string,
    rawParams: Record<string, unknown>,
    fieldMap?: FieldDef[],
  ): Promise<void> {
    // Apply formula-based derived fields before persisting
    const params: Record<string, unknown> = fieldMap?.some((f) => f.formula)
      ? applyFormulas(rawParams as Record<string, number | string | boolean | null>, fieldMap)
      : rawParams;

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
        .set({ lastSeenAt: now, status: "online", updatedAt: now })
        .where(eq(devicesTable.id, deviceId));

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
    } catch { /* non-critical */ }
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
    } catch { /* non-critical */ }
  }
}

export const driverRegistry = new DriverRegistry();
