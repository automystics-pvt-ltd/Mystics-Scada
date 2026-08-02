/**
 * MQTT Subscriber Service
 *
 * Connects to a Mosquitto broker at startup, subscribes to one or more topics,
 * parses incoming JSON payloads, and stores every Modbus reading into PostgreSQL
 * via the driver registry (same pipeline as live drivers and HTTP push).
 *
 * Configuration (environment variables — set in VPS systemd unit):
 *   MQTT_BROKER_URL   broker address, e.g. mqtt://76.13.4.214:1883  (required)
 *   MQTT_TOPIC        topic to subscribe, e.g. trn246/modbus         (default: trn246/modbus)
 *   MQTT_USERNAME     optional broker username
 *   MQTT_PASSWORD     optional broker password
 *   MQTT_DEVICE_NAME  name to register the device as                 (default: TRB246)
 *
 * Behaviour:
 *   - Auto-connects and auto-reconnects with exponential backoff (2 s → 64 s)
 *   - Auto-provisions the device on first message — no pre-registration needed
 *   - Handles invalid JSON gracefully (logs + skips, never crashes)
 *   - Runs as a background singleton — never blocks the HTTP server
 *   - Safe to call startMqttSubscriber() multiple times (only starts once)
 *   - Exposes connection state via getMqttStatus() / onMqttStatusChange()
 *     so SSE stream endpoints can push Live / Reconnecting badges to the UI
 */

import mqtt, { type MqttClient } from "mqtt";
import { logger } from "./logger.js";
import { flattenPayload, resolveDevice } from "./pushIngest.js";
import { driverRegistry } from "./drivers/registry.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BROKER_URL   = process.env["MQTT_BROKER_URL"]   ?? "";
const TOPIC        = process.env["MQTT_TOPIC"]         ?? "trn246/modbus";
const USERNAME     = process.env["MQTT_USERNAME"];
const PASSWORD     = process.env["MQTT_PASSWORD"];
const DEVICE_NAME  = process.env["MQTT_DEVICE_NAME"]  ?? "TRB246";

// Exponential backoff config
const BACKOFF_BASE_MS  = 2_000;
const BACKOFF_MAX_MS   = 64_000;
const CONNECT_TIMEOUT  = 15_000;

// ── Connection state ──────────────────────────────────────────────────────────

export type MqttStatus = "disabled" | "connecting" | "connected" | "reconnecting" | "disconnected";

let _currentStatus: MqttStatus = "disabled";
const _statusListeners = new Set<(status: MqttStatus) => void>();

function _setStatus(s: MqttStatus): void {
  if (_currentStatus === s) return;
  _currentStatus = s;
  _statusListeners.forEach((fn) => {
    try { fn(s); } catch { /* listener threw */ }
  });
}

/**
 * Returns the current MQTT broker connection state.
 */
export function getMqttStatus(): MqttStatus {
  return _currentStatus;
}

/**
 * Subscribe to MQTT connection-state changes.
 * Returns an unsubscribe function.
 */
export function onMqttStatusChange(listener: (status: MqttStatus) => void): () => void {
  _statusListeners.add(listener);
  return () => _statusListeners.delete(listener);
}

// ── Singleton state ───────────────────────────────────────────────────────────

let _client: MqttClient | null = null;
let _started = false;
let _reconnectAttempt = 0;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

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
    _setStatus("disabled");
    return;
  }

  _started = true;
  _setStatus("connecting");
  _connect();
}

/** Gracefully stop the subscriber (called on process shutdown). */
export async function stopMqttSubscriber(): Promise<void> {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  if (_client) {
    await _client.endAsync(true).catch(() => undefined);
    _client = null;
  }
  _setStatus("disconnected");
}

// ── Internal ──────────────────────────────────────────────────────────────────

/**
 * Compute next reconnect delay with full-jitter exponential backoff.
 * Attempt 0 → 2 s, attempt 1 → 4 s, … capped at 64 s.
 */
function _backoffDelay(): number {
  const cap = Math.min(BACKOFF_BASE_MS * 2 ** _reconnectAttempt, BACKOFF_MAX_MS);
  // Add up to 25 % jitter so multiple clients don't stampede the broker
  return cap * (0.75 + Math.random() * 0.25);
}

function _scheduleReconnect(): void {
  const delay = _backoffDelay();
  _reconnectAttempt++;
  logger.info(
    { broker: BROKER_URL, attempt: _reconnectAttempt, delayMs: Math.round(delay) },
    "MQTT subscriber: scheduling reconnect…",
  );
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    _connect();
  }, delay);
}

function _connect(): void {
  // Tear down any lingering client before creating a new one
  if (_client) {
    _client.removeAllListeners();
    _client.end(true);
    _client = null;
  }

  const clientId = `solar-scada-sub-${Math.random().toString(16).slice(2, 10)}`;

  logger.info({ broker: BROKER_URL, topic: TOPIC }, "MQTT subscriber: connecting…");

  const client = mqtt.connect(BROKER_URL, {
    clientId,
    clean:           true,
    // Disable mqtt.js built-in auto-reconnect; we manage it ourselves so we
    // can apply exponential backoff instead of a fixed retry period.
    reconnectPeriod: 0,
    connectTimeout:  CONNECT_TIMEOUT,
    keepalive:       60,
    ...(USERNAME ? { username: USERNAME } : {}),
    ...(PASSWORD ? { password: PASSWORD } : {}),
  });

  _client = client;

  // ── Connected ──────────────────────────────────────────────────────────────
  client.on("connect", () => {
    logger.info({ broker: BROKER_URL, topic: TOPIC }, "MQTT subscriber: connected ✓");
    _reconnectAttempt = 0; // reset backoff on successful connect
    _setStatus("connected");

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

  // ── Close — triggers reconnect logic ──────────────────────────────────────
  client.on("close", () => {
    logger.info({ broker: BROKER_URL }, "MQTT subscriber: connection closed");

    // Only schedule reconnect when we're not in the middle of a clean shutdown
    if (_started && _client === client) {
      _setStatus("reconnecting");
      _scheduleReconnect();
    }
  });

  // ── Error ──────────────────────────────────────────────────────────────────
  client.on("error", (err: Error) => {
    logger.error({ err: err.message, broker: BROKER_URL }, "MQTT subscriber: connection error");
    // The "close" event fires after "error", so reconnect is handled there.
  });

  // ── Offline (broker went away while connected) ─────────────────────────────
  client.on("offline", () => {
    logger.warn({ broker: BROKER_URL }, "MQTT subscriber: broker offline — will retry");
    _setStatus("reconnecting");
  });
}
