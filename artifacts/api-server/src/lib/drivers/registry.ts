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
 */

import { randomUUID } from "node:crypto";
import { eq, and, lt, sql } from "drizzle-orm";
import { db, devicesTable, deviceReadingsTable, deviceCommLogsTable, deviceTemplatesTable } from "@workspace/db";
import { logger } from "../logger.js";
import type { IDriver, DriverConfig, FieldDef } from "./types.js";
import { ModbusTcpDriver } from "./ModbusTcpDriver.js";
import { MqttDriver } from "./MqttDriver.js";
import { HttpDriver } from "./HttpDriver.js";
import { WebSocketDriver } from "./WebSocketDriver.js";

const MAX_READINGS_PER_DEVICE = 2_000;
const MAX_COMM_LOGS_PER_DEVICE = 1_000;

// ─── Types ────────────────────────────────────────────────────────────────────

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
    default:
      return null;
  }
}

// ─── Normalize protocol string ─────────────────────────────────────────────

function normalizeProtocol(raw: string): DriverConfig["protocol"] | null {
  switch (raw.toLowerCase()) {
    case "modbus":
    case "modbus_tcp":
      return "modbus_tcp";
    case "modbus_rtu":
      return "modbus_rtu";
    case "mqtt":
      return "mqtt";
    case "http":
      return "http";
    case "websocket":
    case "ws":
      return "websocket";
    default:
      return null;
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

class DriverRegistry {
  private _drivers = new Map<string, IDriver>();

  async init(): Promise<void> {
    logger.info("DriverRegistry: initializing drivers for all configured devices");
    try {
      const devices = await db
        .select()
        .from(devicesTable);

      let started = 0;
      for (const device of devices) {
        const launched = await this._launchDriver(device);
        if (launched) started++;
      }
      logger.info({ started, total: devices.length }, "DriverRegistry: initialization complete");
    } catch (err) {
      logger.error({ err }, "DriverRegistry: failed to load devices on init");
    }
  }

  /** Call this after a device's config or template changes */
  async restartDevice(deviceId: string): Promise<void> {
    await this._stopDriver(deviceId);
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
    if (device) await this._launchDriver(device);
  }

  /** Used by connection-test endpoint — instantiates a throw-away driver */
  makeTestDriver(cfg: DriverConfig): IDriver | null {
    return makeDriver(cfg);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async _launchDriver(device: typeof devicesTable.$inferSelect): Promise<boolean> {
    const rawCfg = (device.config ?? {}) as DeviceConfig;
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
      deviceId: device.id,
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

    this._drivers.set(device.id, driver);
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
  }

  private _wire(driver: IDriver, orgId: string): void {
    const deviceId = driver.deviceId;

    driver.on("reading", (params: Record<string, unknown>) => {
      void this._persistReading(deviceId, orgId, params);
    });

    driver.on("status", (status: string) => {
      void this._updateDeviceStatus(deviceId, status);
    });

    driver.on("log", (eventType: string, message: string, rttMs?: number) => {
      void this._writeCommLog(deviceId, eventType, message, rttMs);
    });

    driver.on("error", (err: Error) => {
      logger.warn({ deviceId, err: err.message }, "Driver error");
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

      // Update last_seen_at + status on the device row
      await db
        .update(devicesTable)
        .set({ lastSeenAt: now, status: "online", updatedAt: now })
        .where(eq(devicesTable.id, deviceId));

      // Prune oldest readings beyond the cap
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
      logger.error({ deviceId, err }, "Failed to persist device reading");
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

      // Prune oldest comm logs beyond the cap
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
