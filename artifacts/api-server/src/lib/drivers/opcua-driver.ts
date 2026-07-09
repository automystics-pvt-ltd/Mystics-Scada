/**
 * OPC-UA Protocol Driver
 *
 * Connects to an OPC-UA server endpoint and reads NodeIds defined
 * in the device template field map. Supports both subscription-based
 * (push) and polling-based (pull) reading strategies.
 *
 * Requires: node-opcua (externalized in build.mjs)
 */

import { EventEmitter } from "node:events";
import type { IDriver, DriverConfig, DriverStatus, ConnectionTestResult, FieldDef } from "./types";
import { logger } from "../logger";

// Dynamic import so the build doesn't fail if node-opcua is unavailable
async function getOpcua() {
  return import("node-opcua") as Promise<typeof import("node-opcua")>;
}

type OpcuaSession = {
  readVariableValue(nodeId: string): Promise<{ value: { value: unknown }; statusCode: { value: number } }>;
  close(): Promise<void>;
};
type OpcuaClient = {
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
  createSession(userIdentity?: unknown): Promise<OpcuaSession>;
};

export class OpcuaDriver extends EventEmitter implements IDriver {
  readonly deviceId: string;
  status: DriverStatus = "idle";

  private readonly _cfg: DriverConfig;
  private _client: OpcuaClient | null = null;
  private _session: OpcuaSession | null = null;
  private _timer: NodeJS.Timeout | null = null;
  private _reconnecting = false;
  private _stopped = false;
  private _polling = false; // guard against concurrent poll cycles

  constructor(config: DriverConfig) {
    super();
    this.deviceId = config.deviceId;
    this._cfg = config;
  }

  start(): void {
    this._stopped = false;
    this._setStatus("connecting");
    this._connect();
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    await this._cleanup();
    this._setStatus("disconnected");
  }

  async test(timeoutMs = 5000): Promise<ConnectionTestResult> {
    const t0 = Date.now();
    try {
      const opcua = await getOpcua();
      const client = opcua.OPCUAClient.create({ endpointMustExist: false, connectionStrategy: { maxRetry: 1 } }) as unknown as OpcuaClient;
      const endpointUrl = this._cfg.url ?? `opc.tcp://${this._cfg.ipAddress ?? "localhost"}:${this._cfg.port ?? 4840}`;
      await Promise.race([
        client.connect(endpointUrl),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
      ]);
      const session = await client.createSession();
      const sampleParams: Record<string, unknown> = {};
      for (const field of (this._cfg.fieldMap ?? []).slice(0, 3)) {
        if (field.nodeId) {
          try {
            const dv = await session.readVariableValue(field.nodeId);
            sampleParams[field.key] = dv.value.value;
          } catch { /* ignore per-node errors in test */ }
        }
      }
      await session.close();
      await client.disconnect();
      return { ok: true, latencyMs: Date.now() - t0, sampleParams: sampleParams as Record<string, number | string | boolean | null> };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - t0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _setStatus(s: DriverStatus): void {
    this.status = s;
    this.emit("status", s);
  }

  private async _cleanup(): Promise<void> {
    try { await this._session?.close(); } catch { /* ok */ }
    try { await this._client?.disconnect(); } catch { /* ok */ }
    this._session = null;
    this._client = null;
  }

  private _connect(): void {
    if (this._stopped) return;
    const endpointUrl = this._cfg.url ?? `opc.tcp://${this._cfg.ipAddress ?? "localhost"}:${this._cfg.port ?? 4840}`;

    getOpcua().then(async (opcua) => {
      const client = opcua.OPCUAClient.create({
        endpointMustExist: false,
        connectionStrategy: { maxRetry: 3, initialDelay: 1000 },
        securityMode: opcua.MessageSecurityMode.None,
        securityPolicy: opcua.SecurityPolicy.None,
      }) as unknown as OpcuaClient;

      this._client = client;
      await client.connect(endpointUrl);

      let identity: unknown = { type: 0 }; // AnonymousIdentity
      if (this._cfg.opcuaUsername) {
        identity = { type: 1, userName: this._cfg.opcuaUsername, password: this._cfg.opcuaPassword };
      }
      const session = await client.createSession(identity);
      this._session = session;
      this._setStatus("connected");
      this.emit("log", "CONNECT_OK", `OPC-UA connected to ${endpointUrl}`);
      this._startPolling();
    }).catch((err: unknown) => {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      this._setStatus("error");
      this.emit("log", "CONNECT_ERR", String(err));
      if (!this._stopped && !this._reconnecting) {
        this._reconnecting = true;
        setTimeout(() => { this._reconnecting = false; this._connect(); }, 10_000);
      }
    });
  }

  private _startPolling(): void {
    if (this._timer) clearInterval(this._timer);
    const intervalMs = (this._cfg.pollingIntervalS ?? 30) * 1000;
    this._timer = setInterval(() => { void this._poll(); }, intervalMs);
    void this._poll(); // immediate first read
  }

  private async _poll(): Promise<void> {
    if (!this._session || this._stopped) return;
    // Guard: skip this tick if a previous read cycle is still awaiting node responses.
    if (this._polling) {
      this.emit("log", "READ_WARN", "Poll skipped — previous OPC-UA read still in-flight");
      return;
    }

    this._polling = true;
    const t0 = Date.now();
    const params: Record<string, unknown> = {};
    const nodeFields: FieldDef[] = (this._cfg.fieldMap ?? []).filter((f) => f.nodeId);

    try {
      for (const field of nodeFields) {
        const dv = await this._session.readVariableValue(field.nodeId!);
        if (dv.statusCode.value === 0) {
          let val = dv.value.value as number | string;
          if (typeof val === "number" && field.multiplier) val = val * field.multiplier + (field.offset ?? 0);
          params[field.key] = val;
        }
      }

      const rttMs = Date.now() - t0;
      this.emit("reading", params);
      this.emit("log", "READ_OK", `OPC-UA read ${nodeFields.length} nodes`, rttMs);
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      this.emit("log", "READ_ERR", String(err));
      this._setStatus("error");
      await this._cleanup();
      if (!this._stopped && !this._reconnecting) {
        this._reconnecting = true;
        setTimeout(() => { this._reconnecting = false; this._connect(); }, 10_000);
      }
    } finally {
      this._polling = false;
    }
  }
}
