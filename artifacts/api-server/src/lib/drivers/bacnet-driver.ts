/**
 * BACnet/IP Protocol Driver
 *
 * Polls Present Value from configured BACnet objects (Analog Input, Analog
 * Output, Analog Value, and a handful of common Binary/Multi-state types) on
 * a device reachable over BACnet/IP — unicast (device IP known) or the
 * subnet broadcast address.
 *
 * BACnet/IP is UDP-based and every node normally binds the same well-known
 * port (47808). To avoid multiple drivers fighting over that port, all
 * BacnetDriver instances in this process share a single reference-counted
 * `node-bacnet` Client — this also keeps confirmed-request/response
 * correlation correct, which breaks if two sockets share a port.
 *
 * Requires: node-bacnet (externalized in build.mjs)
 */

import { EventEmitter } from "node:events";
import type { IDriver, DriverConfig, DriverStatus, ConnectionTestResult, FieldDef } from "./types";
import { logger } from "../logger";

// ── node-bacnet module + shared client plumbing ─────────────────────────────

interface BacnetObjectId {
  type: number;
  instance: number;
}
interface BacnetValueEntry {
  type: number;
  value: unknown;
}
interface BacnetReadResult {
  objectId: BacnetObjectId;
  property: { id: number; index: number };
  values: BacnetValueEntry[];
}
interface BacnetClient {
  readProperty(
    address: string,
    objectId: BacnetObjectId,
    propertyId: number,
    next: (err: Error | null, value?: BacnetReadResult) => void,
  ): void;
  on(event: "error", cb: (err: Error) => void): void;
  close(): void;
}
interface BacnetEnum {
  ObjectType: Record<string, number>;
  ObjectTypeName: Record<number, string>;
  PropertyIdentifier: Record<string, number>;
}

let cachedCtor: { Client: new (opts: { apduTimeout: number }) => BacnetClient; enum: BacnetEnum } | null = null;

async function getBacnetModule(): Promise<{ Client: new (opts: { apduTimeout: number }) => BacnetClient; enum: BacnetEnum }> {
  if (cachedCtor) return cachedCtor;
  const mod = (await import("node-bacnet")) as unknown as { default?: unknown };
  // node-bacnet's index.js does `module.exports = require('./lib/client')` then
  // attaches `.enum` onto that same function object — the ESM `default` interop
  // always refers to the real exports object, so `.enum` is reachable off it
  // regardless of how (or whether) named exports were statically detected.
  const Client = (mod.default ?? mod) as new (opts: { apduTimeout: number }) => BacnetClient;
  const bacnetEnum = (Client as unknown as { enum: BacnetEnum }).enum;
  cachedCtor = { Client, enum: bacnetEnum };
  return cachedCtor;
}

let sharedClient: BacnetClient | null = null;
let sharedClientPromise: Promise<BacnetClient> | null = null;
let refCount = 0;

async function acquireSharedClient(): Promise<BacnetClient> {
  if (sharedClient) { refCount++; return sharedClient; }
  if (!sharedClientPromise) {
    sharedClientPromise = (async () => {
      const { Client } = await getBacnetModule();
      const client = new Client({ apduTimeout: 6000 });
      client.on("error", (err) => logger.warn({ err: err.message }, "Shared BACnet/IP transport error"));
      return client;
    })();
  }
  const client = await sharedClientPromise;
  sharedClient = client;
  refCount++;
  return client;
}

function releaseSharedClient(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && sharedClient) {
    try { sharedClient.close(); } catch { /* already closed */ }
    sharedClient = null;
    sharedClientPromise = null;
  }
}

function readPropertyAsync(
  client: BacnetClient,
  address: string,
  objectId: BacnetObjectId,
  propertyId: number,
  timeoutMs: number,
): Promise<BacnetReadResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("BACnet read timed out")), timeoutMs);
    client.readProperty(address, objectId, propertyId, (err, value) => {
      clearTimeout(timer);
      if (err) reject(err);
      else if (!value) reject(new Error("BACnet read returned no data"));
      else resolve(value);
    });
  });
}

// camelCase field-map aliases -> node-bacnet enum keys
const OBJECT_TYPE_ALIASES: Record<string, string> = {
  analogInput: "ANALOG_INPUT",
  analogOutput: "ANALOG_OUTPUT",
  analogValue: "ANALOG_VALUE",
  binaryInput: "BINARY_INPUT",
  binaryOutput: "BINARY_OUTPUT",
  binaryValue: "BINARY_VALUE",
  multiStateInput: "MULTI_STATE_INPUT",
  multiStateOutput: "MULTI_STATE_OUTPUT",
  multiStateValue: "MULTI_STATE_VALUE",
  device: "DEVICE",
};

const PROPERTY_ALIASES: Record<string, string> = {
  presentValue: "PRESENT_VALUE",
  statusFlags: "STATUS_FLAGS",
  objectName: "OBJECT_NAME",
  units: "UNITS",
  outOfService: "OUT_OF_SERVICE",
  reliability: "RELIABILITY",
  objectList: "OBJECT_LIST",
};

function toScreamingSnake(camel: string): string {
  return camel.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

function resolveObjectType(bacnetEnum: BacnetEnum, objectType: string | undefined): number | undefined {
  if (!objectType) return undefined;
  const key = OBJECT_TYPE_ALIASES[objectType] ?? toScreamingSnake(objectType);
  return bacnetEnum.ObjectType[key];
}

function resolvePropertyId(bacnetEnum: BacnetEnum, propertyId: string | undefined): number {
  const fallback = bacnetEnum.PropertyIdentifier["PRESENT_VALUE"]!;
  if (!propertyId) return fallback;
  const key = PROPERTY_ALIASES[propertyId] ?? toScreamingSnake(propertyId);
  return bacnetEnum.PropertyIdentifier[key] ?? fallback;
}

// ── Driver ───────────────────────────────────────────────────────────────────

export class BacnetDriver extends EventEmitter implements IDriver {
  readonly deviceId: string;
  status: DriverStatus = "idle";

  private readonly _cfg: DriverConfig;
  private _client: BacnetClient | null = null;
  private _timer: NodeJS.Timeout | null = null;
  private _stopped = false;
  private _polling = false; // guard against concurrent poll cycles
  private _reconnecting = false;
  /** Count of BACnet objects actively polled — surfaced on the health dashboard. */
  subscriptionCount = 0;

  constructor(config: DriverConfig) {
    super();
    this.deviceId = config.deviceId;
    this._cfg = config;
    this.subscriptionCount = (config.fieldMap ?? []).filter((f) => f.objectType && f.objectInstance !== undefined).length;
  }

  start(): void {
    this._stopped = false;
    this._setStatus("connecting");
    this._connect();
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._client) { releaseSharedClient(); this._client = null; }
    this._setStatus("disconnected");
  }

  async test(timeoutMs = 5000): Promise<ConnectionTestResult> {
    const t0 = Date.now();
    let acquired = false;
    try {
      const client = await acquireSharedClient();
      acquired = true;
      const { enum: bacnetEnum } = await getBacnetModule();
      const address = this._address();
      const deviceInstance = this._cfg.bacnetDeviceInstance ?? 0;
      const result = await readPropertyAsync(
        client,
        address,
        { type: bacnetEnum.ObjectType["DEVICE"]!, instance: deviceInstance },
        bacnetEnum.PropertyIdentifier["OBJECT_LIST"]!,
        timeoutMs,
      );
      const objectList = (result.values ?? [])
        .map((v) => {
          const oid = v.value as BacnetObjectId | undefined;
          if (!oid || typeof oid.type !== "number") return null;
          const typeName = bacnetEnum.ObjectTypeName[oid.type] ?? `TYPE_${oid.type}`;
          return `${typeName}:${oid.instance}`;
        })
        .filter((s): s is string => !!s);

      return {
        ok: true,
        latencyMs: Date.now() - t0,
        sampleParams: {
          deviceInstance,
          objectCount: objectList.length,
          objects: objectList.slice(0, 25).join(", "),
        },
      };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - t0, error: err instanceof Error ? err.message : String(err) };
    } finally {
      if (acquired) releaseSharedClient();
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _address(): string {
    const ip = this._cfg.ipAddress ?? "255.255.255.255";
    const port = this._cfg.port ?? 47808;
    return port === 47808 ? ip : `${ip}:${port}`;
  }

  private _setStatus(s: DriverStatus): void {
    this.status = s;
    this.emit("status", s);
  }

  private _connect(): void {
    if (this._stopped) return;
    acquireSharedClient()
      .then((client) => {
        if (this._stopped) { releaseSharedClient(); return; }
        this._client = client;
        this._setStatus("connected");
        this.emit("log", "CONNECT_OK", `BACnet/IP client ready — polling ${this._address()}`);
        this._startPolling();
      })
      .catch((err: unknown) => {
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
    if (!this._client || this._stopped) return;
    if (this._polling) {
      this.emit("log", "READ_WARN", "Poll skipped — previous BACnet read still in-flight");
      return;
    }

    this._polling = true;
    const t0 = Date.now();
    const params: Record<string, unknown> = {};
    const objFields: FieldDef[] = (this._cfg.fieldMap ?? []).filter((f) => f.objectType && f.objectInstance !== undefined);
    this.subscriptionCount = objFields.length;
    const address = this._address();

    let successCount = 0;
    let lastErr: Error | null = null;
    try {
      const { enum: bacnetEnum } = await getBacnetModule();
      for (const field of objFields) {
        const type = resolveObjectType(bacnetEnum, field.objectType);
        if (type === undefined) continue;
        const propertyId = resolvePropertyId(bacnetEnum, field.propertyId);
        try {
          const result = await readPropertyAsync(this._client, address, { type, instance: field.objectInstance! }, propertyId, 5000);
          const raw = result.values?.[0]?.value;
          if (raw !== undefined && raw !== null) {
            let val: unknown = raw;
            if (typeof val === "number" && field.multiplier) val = val * field.multiplier + (field.offset ?? 0);
            params[field.key] = val as number | string | boolean;
            successCount++;
          }
        } catch (fieldErr) {
          lastErr = fieldErr instanceof Error ? fieldErr : new Error(String(fieldErr));
        }
      }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    } finally {
      this._polling = false;
    }

    if (successCount > 0) {
      const rttMs = Date.now() - t0;
      this._setStatus("connected");
      this.emit("reading", params);
      this.emit("log", "READ_OK", `BACnet read ${successCount}/${objFields.length} objects`, rttMs);
    } else {
      this._setStatus("error");
      const err = lastErr ?? new Error("No reachable BACnet objects configured for this device");
      this.emit("error", err);
      this.emit("log", "READ_ERR", err.message);
    }
  }
}
