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
  // Support bracket notation: data[0].field → data.0.field
  const cleaned = normalized.replace(/\[(\d+)\]/g, ".$1");
  return cleaned.split(".").filter(Boolean).reduce<unknown>((cur, key) => {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = parseInt(key, 10);
      return !isNaN(idx) ? cur[idx] : undefined;
    }
    if (typeof cur === "object") return (cur as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/**
 * Recursively flatten all scalar leaf values into a ParamMap.
 * For arrays, only the first element is inspected (we assume all items share
 * the same schema — e.g. paginated API responses like { data: { data: [...] } }).
 * Numeric strings are coerced to numbers.
 */
function flattenScalars(obj: unknown, prefix = "", depth = 0): ParamMap {
  const result: ParamMap = {};
  if (depth > 8 || obj == null || typeof obj !== "object") return result;
  if (Array.isArray(obj)) {
    if (obj.length > 0) Object.assign(result, flattenScalars(obj[0], prefix, depth + 1));
    return result;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const dotKey = prefix ? `${prefix}.${k}` : k;
    const paramKey = dotKey.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (v == null) continue;
    if (typeof v === "number") {
      result[paramKey] = v;
    } else if (typeof v === "string") {
      // Coerce numeric strings to numbers; keep other strings as-is
      const n = Number(v);
      result[paramKey] = (v.trim() !== "" && isFinite(n)) ? n : v;
    } else if (typeof v === "boolean") {
      result[paramKey] = v;
    } else if (typeof v === "object") {
      Object.assign(result, flattenScalars(v, dotKey, depth + 1));
    }
  }
  return result;
}

function decodeResponse(body: unknown, fields: FieldDef[]): ParamMap {
  // Raw passthrough: auto-flatten all scalar leaf values when no field map is configured
  if (fields.length === 0) return flattenScalars(body);

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
  private _polling = false; // guard against concurrent poll cycles
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
    const headers: Record<string, string> = { "Accept": "application/json" };
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
          // httpAuthValue is "user:password"
          headers["Authorization"] = `Basic ${Buffer.from(httpAuthValue).toString("base64")}`;
        }
        break;
      default:
        break;
    }
    return headers;
  }

  private async _poll(): Promise<void> {
    if (this._stopped) return;
    // Guard: skip this tick if a previous fetch is still in-flight (slow endpoint
    // or network delay longer than the polling interval).
    if (this._polling) {
      this.emit("log", "READ_WARN", "Poll skipped — previous HTTP request still in-flight");
      return;
    }

    const url = this._resolveUrl();
    if (!url) {
      this._setStatus("error");
      this.emit("log", "ERROR", "No URL configured for HTTP driver");
      return;
    }

    this._polling = true;
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
    } finally {
      this._polling = false;
    }
  }
}
