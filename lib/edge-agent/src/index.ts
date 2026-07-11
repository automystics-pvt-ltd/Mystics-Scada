/**
 * Edge Gateway Agent — entry point.
 *
 * On startup:
 *  1. Fetch the device list assigned to this gateway from the cloud API.
 *  2. Start a poll loop per device (Modbus TCP / MQTT / HTTP — see drivers/).
 *  3. Every successful read is written to the local SQLite buffer first,
 *     then a background flush loop drains the buffer to the cloud in
 *     batches. If the cloud is unreachable, readings simply accumulate in
 *     the buffer (capped) until connectivity returns.
 *  4. A heartbeat is sent every HEARTBEAT_INTERVAL_MS so the cloud's
 *     Gateways page can show live/offline status.
 *
 * Read-only telemetry collection only — no write/control commands are sent
 * to devices (see Task #79 "Out of scope").
 */

import { loadConfig } from "./config.js";
import { ApiClient, type RemoteDevice } from "./apiClient.js";
import { ReadingsBuffer } from "./buffer.js";
import { pollModbusTcp } from "./drivers/modbusTcp.js";
import { pollHttp } from "./drivers/http.js";
import { MqttSubscription } from "./drivers/mqtt.js";
import type { FieldDef, ParamMap } from "./drivers/types.js";
import { logger } from "./logger.js";

const SUPPORTED_PROTOCOLS = new Set(["modbus_tcp", "modbus", "http", "mqtt"]);

interface DeviceWorker {
  device: RemoteDevice;
  timer: ReturnType<typeof setInterval>;
  mqttSub?: MqttSubscription;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new ApiClient(config.apiUrl, config.gatewayToken);
  const buffer = new ReadingsBuffer(config.bufferDbPath, config.bufferMaxRows);

  const workers = new Map<string, DeviceWorker>();

  async function pollDevice(device: RemoteDevice): Promise<void> {
    const cfg = device.config;
    const fieldMap = (device.fieldMap ?? []) as FieldDef[];
    let params: ParamMap;
    try {
      const protocol = device.protocol.toLowerCase();
      if (protocol === "modbus" || protocol === "modbus_tcp") {
        params = await pollModbusTcp({
          ipAddress: String(cfg["ipAddress"] ?? ""),
          port: Number(cfg["port"] ?? 502),
          modbusUnitId: Number(cfg["modbusUnitId"] ?? 1),
          fieldMap,
        });
      } else if (protocol === "http") {
        params = await pollHttp({
          url: String(cfg["url"] ?? cfg["ipAddress"] ?? ""),
          fieldMap,
          httpAuthMethod: cfg["httpAuthMethod"] as "none" | "bearer" | "api_key" | "basic" | undefined,
          httpAuthValue: cfg["httpAuthValue"] as string | undefined,
          httpApiKeyHeader: cfg["httpApiKeyHeader"] as string | undefined,
        });
      } else if (protocol === "mqtt") {
        const worker = workers.get(device.id);
        if (!worker?.mqttSub) return; // subscription still connecting
        params = await worker.mqttSub.poll();
      } else {
        return;
      }
    } catch (err) {
      logger.warn("Device poll failed", { deviceId: device.id, name: device.name, err: String(err) });
      return;
    }

    if (Object.keys(params).length === 0) return;
    buffer.enqueue({ deviceId: device.id, ts: new Date().toISOString(), params });
    logger.info("Reading buffered", { deviceId: device.id, name: device.name, fields: Object.keys(params).length });
  }

  function startWorker(device: RemoteDevice): void {
    const protocol = device.protocol.toLowerCase();
    if (!SUPPORTED_PROTOCOLS.has(protocol)) {
      logger.warn("Skipping device — protocol not supported by the edge agent yet", {
        deviceId: device.id,
        name: device.name,
        protocol: device.protocol,
      });
      return;
    }

    let mqttSub: MqttSubscription | undefined;
    if (protocol === "mqtt") {
      mqttSub = new MqttSubscription(
        String(device.config["brokerUrl"] ?? ""),
        String(device.config["topic"] ?? "#"),
        (device.fieldMap ?? []) as FieldDef[],
      );
      mqttSub.connect();
    }

    const intervalMs = Math.max(5, device.pollingIntervalSec) * 1_000;
    const timer = setInterval(() => void pollDevice(device), intervalMs);
    workers.set(device.id, { device, timer, mqttSub });
    logger.info("Started polling device", { deviceId: device.id, name: device.name, protocol, intervalMs });
  }

  function stopAllWorkers(): void {
    for (const worker of workers.values()) {
      clearInterval(worker.timer);
      worker.mqttSub?.close();
    }
    workers.clear();
  }

  async function refreshDevices(): Promise<void> {
    let devices: RemoteDevice[];
    try {
      devices = await api.fetchDevices();
    } catch (err) {
      logger.warn("Failed to refresh device list — keeping current workers running", { err: String(err) });
      return;
    }
    stopAllWorkers();
    logger.info("Fetched device list from cloud", { count: devices.length });
    for (const device of devices) startWorker(device);
  }

  async function flushLoop(): Promise<void> {
    const { rowIds, items } = buffer.peekBatch(config.bufferFlushBatchSize);
    if (items.length === 0) return;
    const ok = await api.pushReadings(items);
    if (ok) {
      buffer.deleteRows(rowIds);
      logger.info("Flushed buffered readings to cloud", { count: items.length, remaining: buffer.count() });
    } else {
      logger.warn("Cloud unreachable — readings remain buffered", { pending: buffer.count() });
    }
  }

  // ── Startup sequence ────────────────────────────────────────────────────
  await refreshDevices();
  setInterval(() => void refreshDevices(), config.deviceRefreshMs);
  setInterval(() => void flushLoop(), 10_000);
  setInterval(() => void api.heartbeat(), config.heartbeatIntervalMs);
  void api.heartbeat();

  logger.info("Edge Gateway Agent started", {
    apiUrl: config.apiUrl,
    bufferDbPath: config.bufferDbPath,
    bufferMaxRows: config.bufferMaxRows,
  });

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      logger.info("Shutting down Edge Gateway Agent", { signal: sig });
      stopAllWorkers();
      buffer.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.error("Fatal startup error", { err: String(err) });
  process.exit(1);
});
