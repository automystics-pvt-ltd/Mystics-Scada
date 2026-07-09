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

function decodePayload(raw: string, fields: FieldDef[]): ParamMap {
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return {}; }

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

// ─── Driver ──────────────────────────────────────────────────────────────────

export class MqttDriver extends EventEmitter implements IDriver {
  readonly deviceId: string;
  private _status: DriverStatus = "idle";
  private _client: MqttClient | null = null;
  private _stopped = false;
  private readonly _cfg: DriverConfig;

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
      const params = decodePayload(payload.toString("utf8"), this._cfg.fieldMap ?? []);
      const rttMs = Date.now() - t0;
      if (Object.keys(params).length > 0) {
        this.emit("log", "READ_OK", `${Object.keys(params).length} params from ${_topic}`, rttMs);
        this.emit("reading", params);
      } else {
        this.emit("log", "PARSE_ERROR", `Empty params from payload on ${_topic}`);
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
