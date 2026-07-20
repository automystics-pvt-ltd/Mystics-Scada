/**
 * MQTT Subscriber Service
 *
 * Connects to a Mosquitto broker at startup, subscribes to one or more topics,
 * parses incoming JSON payloads, and stores every Modbus reading into PostgreSQL
 * via the driver registry (same pipeline as live drivers and HTTP push).
 *
 * Configuration (environment variables — set in VPS systemd unit):
 *   MQTT_BROKER_URL   broker address, e.g. mqtt://76.13.4.214:1883  (required)
 *   MQTT_TOPIC        topic to subscribe, e.g. trb246/modbus         (default: trb246/modbus)
 *   MQTT_USERNAME     optional broker username
 *   MQTT_PASSWORD     optional broker password
 *   MQTT_DEVICE_NAME  name to register the device as                 (default: TRB246)
 *
 * Behaviour:
 *   - Auto-connects and auto-reconnects (exponential backoff via mqtt.js)
 *   - Auto-provisions the device on first message — no pre-registration needed
 *   - Handles invalid JSON gracefully (logs + skips, never crashes)
 *   - Runs as a background singleton — never blocks the HTTP server
 *   - Safe to call startMqttSubscriber() multiple times (only starts once)
 */

import mqtt, { type MqttClient } from "mqtt";
import { logger } from "./logger.js";
import { flattenPayload, resolveDevice } from "./pushIngest.js";
import { driverRegistry } from "./drivers/registry.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BROKER_URL   = process.env["MQTT_BROKER_URL"]   ?? "";
const TOPIC        = process.env["MQTT_TOPIC"]         ?? "trb246/modbus";
const USERNAME     = process.env["MQTT_USERNAME"];
const PASSWORD     = process.env["MQTT_PASSWORD"];
const DEVICE_NAME  = process.env["MQTT_DEVICE_NAME"]  ?? "TRB246";

// ── State ─────────────────────────────────────────────────────────────────────

let _client: MqttClient | null = null;
let _started = false;

// ── Subscriber ────────────────────────────────────────────────────────────────

/**
 * Start the MQTT subscriber. Safe to call multiple times — only one connection
 * is created. If MQTT_BROKER_URL is not set the subscriber is silently skipped.
 */
export function startMqttSubscriber(): void {
  if (_started) return;

  if (!BROKER_URL) {
    logger.info(
      "MQTT_BROKER_URL not set — MQTT subscriber disabled. " +
      "Set it in the systemd unit to enable automatic data ingestion.",
    );
    return;
  }

  _started = true;
  _connect();
}

/** Gracefully stop the subscriber (called on process shutdown). */
export async function stopMqttSubscriber(): Promise<void> {
  if (_client) {
    await _client.endAsync(true).catch(() => undefined);
    _client = null;
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _connect(): void {
  const clientId = `solar-scada-sub-${Math.random().toString(16).slice(2, 10)}`;

  logger.info({ broker: BROKER_URL, topic: TOPIC }, "MQTT subscriber: connecting…");

  const client = mqtt.connect(BROKER_URL, {
    clientId,
    clean:           true,
    reconnectPeriod: 10_000,   // retry every 10 s on disconnect
    connectTimeout:  15_000,
    keepalive:       60,
    ...(USERNAME ? { username: USERNAME } : {}),
    ...(PASSWORD ? { password: PASSWORD } : {}),
  });

  _client = client;

  // ── Connected ──────────────────────────────────────────────────────────────
  client.on("connect", () => {
    logger.info({ broker: BROKER_URL, topic: TOPIC }, "MQTT subscriber: connected ✓");

    client.subscribe(TOPIC, { qos: 0 }, (err) => {
      if (err) {
        logger.error({ err, topic: TOPIC }, "MQTT subscriber: subscribe failed");
      } else {
        logger.info({ topic: TOPIC }, "MQTT subscriber: subscribed ✓");
      }
    });
  });

  // ── Message received ───────────────────────────────────────────────────────
  client.on("message", (topic: string, payload: Buffer) => {
    const raw = payload.toString("utf8");

    // 1. Parse JSON
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      logger.warn({ topic, bytes: payload.byteLength }, "MQTT subscriber: invalid JSON — skipping");
      return;
    }

    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      logger.warn({ topic }, "MQTT subscriber: payload is not a JSON object — skipping");
      return;
    }

    const bodyObj = body as Record<string, unknown>;

    // 2. Determine device name: body.device → MQTT_DEVICE_NAME env → "TRB246"
    const deviceName = typeof bodyObj["device"] === "string"
      ? bodyObj["device"]
      : typeof bodyObj["name"] === "string"
        ? bodyObj["name"]
        : DEVICE_NAME;

    // 3. Flatten payload → param map
    const params = flattenPayload(bodyObj);
    const paramCount = Object.keys(params).length;

    if (paramCount === 0) {
      logger.debug({ topic, deviceName }, "MQTT subscriber: no numeric values found — skipping");
      return;
    }

    // 4. Resolve (or auto-create) device, then store the reading
    resolveDevice(deviceName)
      .then((device) => driverRegistry.injectReading(device.id, device.orgId, params))
      .then(() => {
        logger.debug({ topic, deviceName, paramCount }, "MQTT subscriber: reading stored ✓");
      })
      .catch((err: unknown) => {
        logger.error({ err, topic, deviceName }, "MQTT subscriber: failed to store reading");
      });
  });

  // ── Reconnecting ───────────────────────────────────────────────────────────
  client.on("reconnect", () => {
    logger.info({ broker: BROKER_URL }, "MQTT subscriber: reconnecting…");
  });

  // ── Offline ────────────────────────────────────────────────────────────────
  client.on("offline", () => {
    logger.warn({ broker: BROKER_URL }, "MQTT subscriber: broker offline — will retry");
  });

  // ── Error ──────────────────────────────────────────────────────────────────
  client.on("error", (err: Error) => {
    logger.error({ err: err.message, broker: BROKER_URL }, "MQTT subscriber: connection error");
    // mqtt.js handles reconnect automatically — no manual retry needed
  });

  // ── Closed ─────────────────────────────────────────────────────────────────
  client.on("close", () => {
    logger.info({ broker: BROKER_URL }, "MQTT subscriber: connection closed");
  });
}
