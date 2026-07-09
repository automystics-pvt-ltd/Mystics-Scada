/**
 * WebSocket Driver
 *
 * Maintains a persistent WebSocket connection and decodes each incoming
 * JSON frame using jsonPath field definitions from the device template.
 */

import { EventEmitter } from "node:events";
import { WebSocket } from "ws";
import type { IDriver, DriverConfig, DriverStatus, ParamMap, FieldDef, ConnectionTestResult } from "./types.js";

function resolveJsonPath(obj: unknown, path: string): unknown {
  const normalized = path.startsWith("$.") ? path.slice(2) : path.startsWith("$") ? path.slice(1) : path;
  if (!normalized) return obj;
  return normalized.split(".").reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== "object") return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

/** Returns null if the raw string is not valid JSON, otherwise a (possibly empty) ParamMap. */
function decodeMessage(raw: string, fields: FieldDef[]): ParamMap | null {
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

const RECONNECT_DELAY_MS = 15_000;

export class WebSocketDriver extends EventEmitter implements IDriver {
  readonly deviceId: string;
  private _status: DriverStatus = "idle";
  private _ws: WebSocket | null = null;
  private _stopped = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this._ws) { this._ws.terminate(); this._ws = null; }
    this._setStatus("disconnected");
    this.emit("log", "DISCONNECT", "WebSocket driver stopped");
  }

  async test(timeoutMs = 5_000): Promise<ConnectionTestResult> {
    const wsUrl = this._resolveUrl();
    if (!wsUrl) return { ok: false, latencyMs: 0, error: "No WebSocket URL configured" };

    const t0 = Date.now();
    return new Promise((resolve) => {
      let done = false;
      const finish = (result: ConnectionTestResult) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        ws.terminate();
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish({ ok: false, latencyMs: Date.now() - t0, error: "Connection timed out" });
      }, timeoutMs);

      const ws = new WebSocket(wsUrl, { headers: this._buildHeaders() });
      ws.on("open", () => finish({ ok: true, latencyMs: Date.now() - t0 }));
      ws.on("error", (err) => finish({ ok: false, latencyMs: Date.now() - t0, error: err.message }));
    });
  }

  private _setStatus(s: DriverStatus) {
    this._status = s;
    this.emit("status", s);
  }

  private _buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const { httpAuthMethod, httpAuthValue, httpApiKeyHeader } = this._cfg;
    switch (httpAuthMethod) {
      case "bearer":
        if (httpAuthValue) headers["Authorization"] = `Bearer ${httpAuthValue}`;
        break;
      case "api_key":
        if (httpApiKeyHeader && httpAuthValue) headers[httpApiKeyHeader] = httpAuthValue;
        break;
      case "basic":
        if (httpAuthValue) {
          headers["Authorization"] = `Basic ${Buffer.from(httpAuthValue).toString("base64")}`;
        }
        break;
      default:
        break;
    }
    return headers;
  }

  private _resolveUrl(): string | null {
    if (this._cfg.url) return this._cfg.url;
    if (this._cfg.ipAddress) {
      const port = this._cfg.port ?? 80;
      return `ws://${this._cfg.ipAddress}:${port}/`;
    }
    return null;
  }

  private _connect() {
    if (this._stopped) return;
    const wsUrl = this._resolveUrl();
    if (!wsUrl) {
      this._setStatus("error");
      this.emit("log", "ERROR", "No WebSocket URL configured");
      return;
    }

    this._setStatus("connecting");
    const ws = new WebSocket(wsUrl, { headers: this._buildHeaders() });
    this._ws = ws;

    ws.on("open", () => {
      if (this._stopped) { ws.terminate(); return; }
      this._setStatus("connected");
      this.emit("log", "CONNECT", `Connected to ${wsUrl}`);
    });

    ws.on("message", (data) => {
      const t0 = Date.now();
      const raw = typeof data === "string" ? data : data.toString("utf8");
      const params = decodeMessage(raw, this._cfg.fieldMap ?? []);
      const rttMs = Date.now() - t0;
      if (params === null) {
        // JSON parse failure — the frame was not valid JSON
        this.emit("log", "PARSE_ERROR", `Invalid JSON in WS frame (${Buffer.byteLength(raw, "utf8")} bytes)`);
      } else if (Object.keys(params).length > 0) {
        this.emit("log", "READ_OK", `${Object.keys(params).length} params`, rttMs);
        this.emit("reading", params);
      } else {
        // Valid JSON but no configured field paths matched
        this.emit("log", "READ_WARN", "WS frame parsed but no field map entries matched");
      }
    });

    ws.on("error", (err) => {
      this._setStatus("error");
      this.emit("log", "ERROR", err.message);
      this.emit("error", err);
    });

    ws.on("close", () => {
      if (!this._stopped) {
        this._setStatus("error");
        this.emit("log", "DISCONNECT", "WebSocket closed — will reconnect");
        this._reconnectTimer = setTimeout(() => {
          if (!this._stopped) this._connect();
        }, RECONNECT_DELAY_MS);
      }
    });
  }
}
