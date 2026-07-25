/**
 * MQTT Driver
 *
 * Connects to an MQTT broker, subscribes to the configured topic,
 * and decodes each JSON payload using jsonPath field definitions.
 */

import { EventEmitter } from "node:events";
import mqtt from "mqtt";
import type { MqttClient } from "mqtt";
import type { IDriver, DriverConfig, DriverStatus, ParamMap, FieldDef, ConnectionTestResult } from "./types.js";

// ─── Simple JSONPath resolver (supports $.key and $.a.b.c notation) ───────────

function resolveJsonPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  // Accept both "$.field" and "field" notation
  const normalized = path.startsWith("$.") ? path.slice(2) : path.startsWith("$") ? path.slice(1) : path;
  if (!normalized) return obj;
  return normalized.split(".").reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== "object") return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

/** Returns null if the raw string is not valid JSON, otherwise a (possibly empty) ParamMap. */
function decodePayload(raw: string, fields: FieldDef[]): ParamMap | null {
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return null; }

  const params: ParamMap = {};
  for (const field of fields) {
    const path = field.jsonPath ?? `$.${field.key}`;
    const val = resolveJsonPath(obj, path);
    if (val == null) continue;
    if (typeof val === "number") {
      const scaled = val * (field.multiplier ?? 1) + (field.offset ?? 0);
      params[field.key] = Math.round(scaled * 1000) / 1000;
    } else if (typeof val === "string" || typeof val === "boolean") {
      params[field.key] = val;
    }
  }
  return params;
}

// ─── Name-value accumulator (TRB246 / per-register MQTT format) ──────────────

/**
 * Decodes a single "name-value" message where each MQTT publish carries one
 * register reading:  { "Automystics": { "name": "Acurrent", "data": "1347" }, … }
 *
 * Returns { _name, _rawValue } so the caller can update its accumulator, or
 * null if the message doesn't match the expected shape.
 */
function extractNameValue(
  raw: string,
  namePath: string,
  valuePath: string,
): { name: string; rawValue: number } | null {
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return null; }
  const name = resolveJsonPath(obj, namePath);
  const val  = resolveJsonPath(obj, valuePath);
  if (typeof name !== "string" || name === "") return null;
  const num = typeof val === "number" ? val : parseFloat(String(val ?? ""));
  if (!isFinite(num)) return null;
  return { name, rawValue: num };
}

/**
 * Build a ParamMap from the current accumulator state using the field map.
 * Each FieldDef is matched by `registerName` (or `key` as fallback).
 */
function buildParamsFromAccumulator(
  state: Map<string, number>,
  fields: FieldDef[],
): ParamMap {
  const params: ParamMap = {};
  for (const field of fields) {
    const regName = field.registerName ?? field.key;
    const raw = state.get(regName);
    if (raw === undefined) continue;
    const scaled = raw * (field.multiplier ?? 1) + (field.offset ?? 0);
    params[field.key] = Math.round(scaled * 1000) / 1000;
  }

  // Derived: acPowerKw = √3 × V × I × PF / 1000 (if all three present)
  const v  = params["acVoltageV"]  as number | undefined;
  const i  = params["acCurrentA"]  as number | undefined;
  const pf = params["powerFactor"] as number | undefined;
  if (v != null && i != null && pf != null && v > 0 && i > 0) {
    params["acPowerKw"] = Math.round(Math.sqrt(3) * v * i * pf / 1000 * 10) / 10;
    // Estimate DC side (assume ~96.5 % efficiency)
    if ((params["acPowerKw"] as number) > 0) {
      params["dcPowerKw"] = Math.round((params["acPowerKw"] as number) / 0.965 * 10) / 10;
    }
  }

  return params;
}

// ─── Driver ──────────────────────────────────────────────────────────────────

export class MqttDriver extends EventEmitter implements IDriver {
  readonly deviceId: string;
  private _status: DriverStatus = "idle";
  private _client: MqttClient | null = null;
  private _stopped = false;
  private readonly _cfg: DriverConfig;
  /** Accumulator for name-value mode — persists across individual register messages */
  private readonly _nvState = new Map<string, number>();

  constructor(cfg: DriverConfig) {
    super();
    this.deviceId = cfg.deviceId;
    this._cfg = cfg;
  }

  get status(): DriverStatus { return this._status; }

  start(): void {
    this._stopped = false;
    this._connect();
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (this._client) {
      await this._client.endAsync(true).catch(() => undefined);
      this._client = null;
    }
    this._setStatus("disconnected");
    this.emit("log", "DISCONNECT", "MQTT driver stopped");
  }

  async test(timeoutMs = 5_000): Promise<ConnectionTestResult> {
    const t0 = Date.now();
    const brokerUrl = this._cfg.brokerUrl ?? "mqtt://localhost:1883";

    return new Promise((resolve) => {
      let done = false;
      const finish = (result: ConnectionTestResult) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        client.end(true, undefined, () => resolve(result));
      };

      const timer = setTimeout(() => {
        finish({ ok: false, latencyMs: Date.now() - t0, error: "Connection timed out" });
      }, timeoutMs);

      const client = mqtt.connect(brokerUrl, {
        connectTimeout: timeoutMs,
        reconnectPeriod: 0,
        ...(this._cfg.mqttUsername ? { username: this._cfg.mqttUsername } : {}),
        ...(this._cfg.mqttPassword ? { password: this._cfg.mqttPassword } : {}),
      });

      client.on("connect", () => {
        finish({ ok: true, latencyMs: Date.now() - t0 });
      });

      client.on("error", (err) => {
        finish({ ok: false, latencyMs: Date.now() - t0, error: err.message });
      });
    });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _setStatus(s: DriverStatus) {
    this._status = s;
    this.emit("status", s);
  }

  private _connect() {
    if (this._stopped) return;
    const brokerUrl = this._cfg.brokerUrl ?? "mqtt://localhost:1883";
    const topic = this._cfg.topic ?? "#";

    this._setStatus("connecting");

    const client = mqtt.connect(brokerUrl, {
      clientId: `solar-scada-${this.deviceId.slice(0, 8)}`,
      reconnectPeriod: 15_000,
      connectTimeout: 10_000,
      ...(this._cfg.mqttUsername ? { username: this._cfg.mqttUsername } : {}),
      ...(this._cfg.mqttPassword ? { password: this._cfg.mqttPassword } : {}),
    });

    this._client = client;

    client.on("connect", () => {
      if (this._stopped) { void client.endAsync(true); return; }
      this._setStatus("connected");
      this.emit("log", "CONNECT", `Connected to ${brokerUrl}, subscribing ${topic}`);
      client.subscribe(topic, { qos: 0 }, (err) => {
        if (err) this.emit("log", "ERROR", `Subscribe error: ${err.message}`);
      });
    });

    client.on("message", (_topic: string, payload: Buffer) => {
      const t0 = Date.now();
      const raw = payload.toString("utf8");
      const rttMs = Date.now() - t0;

      if (this._cfg.payloadMode === "name-value") {
        // ── Per-register accumulator mode (TRB246 / Teltonika format) ──────
        const namePath  = this._cfg.nameKeyPath  ?? "$.Automystics.name";
        const valuePath = this._cfg.nameValuePath ?? "$.Automystics.data";
        const extracted = extractNameValue(raw, namePath, valuePath);
        if (!extracted) {
          this.emit("log", "PARSE_ERROR", `name-value: could not extract name/value from ${_topic}`);
          return;
        }
        this._nvState.set(extracted.name, extracted.rawValue);
        const params = buildParamsFromAccumulator(this._nvState, this._cfg.fieldMap ?? []);
        if (Object.keys(params).length > 0) {
          this.emit("log", "READ_OK", `[nv] ${extracted.name}=${extracted.rawValue} → ${Object.keys(params).length} accumulated params`, rttMs);
          this.emit("reading", params);
        }
        return;
      }

      // ── Standard JSON-path mode ──────────────────────────────────────────
      const params = decodePayload(raw, this._cfg.fieldMap ?? []);
      if (params === null) {
        // JSON parse failure — device is publishing non-JSON (binary, CSV, etc.)
        this.emit("log", "PARSE_ERROR", `Invalid JSON in MQTT payload on ${_topic} (${Buffer.byteLength(raw, "utf8")} bytes)`);
      } else if (Object.keys(params).length > 0) {
        this.emit("log", "READ_OK", `${Object.keys(params).length} params from ${_topic}`, rttMs);
        this.emit("reading", params);
      } else {
        // Valid JSON but no configured field paths matched
        this.emit("log", "READ_WARN", `MQTT payload parsed but no field map entries matched on ${_topic}`);
      }
    });

    client.on("error", (err) => {
      this._setStatus("error");
      this.emit("log", "ERROR", err.message);
      this.emit("error", err);
    });

    client.on("reconnect", () => {
      this._setStatus("connecting");
    });

    client.on("offline", () => {
      if (!this._stopped) {
        this._setStatus("error");
        this.emit("log", "DISCONNECT", "MQTT broker offline");
      }
    });
  }
}
