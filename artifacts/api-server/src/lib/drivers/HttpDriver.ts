/**
 * HTTP Polling Driver
 *
 * Fetches a configured URL on a polling interval and decodes the JSON response
 * using jsonPath field definitions from the device template.
 */

import { EventEmitter } from "node:events";
import type { IDriver, DriverConfig, DriverStatus, ParamMap, FieldDef, ConnectionTestResult } from "./types.js";

function resolveJsonPath(obj: unknown, path: string): unknown {
  const normalized = path.startsWith("$.") ? path.slice(2) : path.startsWith("$") ? path.slice(1) : path;
  if (!normalized) return obj;
  return normalized.split(".").reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== "object") return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

function decodeResponse(body: unknown, fields: FieldDef[]): ParamMap {
  const params: ParamMap = {};
  for (const field of fields) {
    const path = field.jsonPath ?? `$.${field.key}`;
    const val = resolveJsonPath(body, path);
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

export class HttpDriver extends EventEmitter implements IDriver {
  readonly deviceId: string;
  private _status: DriverStatus = "idle";
  private _timer: ReturnType<typeof setInterval> | null = null;
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
    this._setStatus("connecting");
    const intervalMs = (this._cfg.pollingIntervalS ?? 30) * 1000;
    void this._poll(); // immediate first poll
    this._timer = setInterval(() => void this._poll(), intervalMs);
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._setStatus("disconnected");
    this.emit("log", "DISCONNECT", "HTTP driver stopped");
  }

  async test(timeoutMs = 5_000): Promise<ConnectionTestResult> {
    const t0 = Date.now();
    const url = this._resolveUrl();
    if (!url) return { ok: false, latencyMs: 0, error: "No URL configured" };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: this._buildHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) return { ok: false, latencyMs: Date.now() - t0, error: `HTTP ${res.status}` };
      const body: unknown = await res.json();
      const params = decodeResponse(body, this._cfg.fieldMap ?? []);
      return { ok: true, latencyMs: Date.now() - t0, sampleParams: params };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - t0, error: (err as Error).message };
    }
  }

  private _setStatus(s: DriverStatus) {
    this._status = s;
    this.emit("status", s);
  }

  private _resolveUrl(): string | null {
    if (this._cfg.url) return this._cfg.url;
    if (this._cfg.ipAddress) {
      const port = this._cfg.port ?? 80;
      return `http://${this._cfg.ipAddress}:${port}/`;
    }
    return null;
  }

  private _buildHeaders(): Record<string, string> {
    return { "Accept": "application/json" };
  }

  private async _poll(): Promise<void> {
    if (this._stopped) return;
    const url = this._resolveUrl();
    if (!url) {
      this._setStatus("error");
      this.emit("log", "ERROR", "No URL configured for HTTP driver");
      return;
    }

    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, {
        headers: this._buildHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const rttMs = Date.now() - t0;
        this._setStatus("error");
        this.emit("log", "READ_FAIL", `HTTP ${res.status} from ${url}`, rttMs);
        // Retry after next poll interval (timer is still running)
        return;
      }

      const body: unknown = await res.json();
      const params = decodeResponse(body, this._cfg.fieldMap ?? []);
      const rttMs = Date.now() - t0;

      this._setStatus("connected");
      this.emit("log", "READ_OK", `${Object.keys(params).length} params`, rttMs);
      this.emit("reading", params);
    } catch (err) {
      const rttMs = Date.now() - t0;
      this._setStatus("error");
      this.emit("log", "ERROR", (err as Error).message, rttMs);
      this.emit("error", err);
    }
  }
}
