/**
 * Environment-driven configuration for the Edge Gateway Agent.
 *
 * Required:
 *   GATEWAY_TOKEN — plaintext token issued by the cloud API (Org Settings → Gateways → Generate Token)
 *   API_URL       — base URL of the cloud API, e.g. https://my-plant.example.com/api
 *
 * Optional:
 *   BUFFER_DB_PATH        — SQLite file path for the offline buffer (default ./data/readings.db)
 *   BUFFER_MAX_ROWS       — cap on buffered rows before oldest are pruned (default 10000)
 *   BUFFER_FLUSH_BATCH    — rows sent per flush request (default 200)
 *   HEARTBEAT_INTERVAL_MS — heartbeat cadence (default 30000)
 *   DEVICE_REFRESH_MS     — how often to re-fetch the device list from the cloud (default 300000)
 */

export interface AgentConfig {
  gatewayToken: string;
  apiUrl: string;
  bufferDbPath: string;
  bufferMaxRows: number;
  bufferFlushBatchSize: number;
  heartbeatIntervalMs: number;
  deviceRefreshMs: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} environment variable is required`);
  }
  return value.trim();
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function loadConfig(): AgentConfig {
  const gatewayToken = requireEnv("GATEWAY_TOKEN");
  const apiUrl = requireEnv("API_URL").replace(/\/+$/, "");

  return {
    gatewayToken,
    apiUrl,
    bufferDbPath: process.env["BUFFER_DB_PATH"]?.trim() || "./data/readings.db",
    bufferMaxRows: intEnv("BUFFER_MAX_ROWS", 10_000),
    bufferFlushBatchSize: intEnv("BUFFER_FLUSH_BATCH", 200),
    heartbeatIntervalMs: intEnv("HEARTBEAT_INTERVAL_MS", 30_000),
    deviceRefreshMs: intEnv("DEVICE_REFRESH_MS", 300_000),
  };
}
