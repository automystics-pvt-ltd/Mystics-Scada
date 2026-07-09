import type { EventEmitter } from "node:events";

// ─── Field definition (from device template) ────────────────────────────────

export interface FieldDef {
  key: string;          // camelCase parameter key, e.g. "acPowerKw"
  label: string;        // display label, e.g. "AC Power"
  unit: string;         // e.g. "kW"
  // Modbus-specific
  address?: number;     // holding register start address
  length?: number;      // number of 16-bit registers (1 or 2)
  dataType?: "INT16" | "UINT16" | "INT32" | "UINT32" | "FLOAT32";
  multiplier?: number;  // scale: decoded = raw × multiplier + offset
  offset?: number;
  // MQTT / HTTP / WebSocket-specific
  jsonPath?: string;    // dot-notation path, e.g. "$.data.acPower"
  // OPC-UA-specific
  nodeId?: string;           // e.g. "ns=2;i=1002"
  samplingIntervalMs?: number;
  // BACnet-specific
  objectType?: string;       // e.g. "analogInput"
  objectInstance?: number;
  propertyId?: string;       // e.g. "presentValue"
  // Derived / formula field (computed from other params after raw decode)
  formula?: string;          // e.g. "ac_voltage * ac_current / 1000"
  // Alarm thresholds
  alarmHiHi?: number;
  alarmHi?: number;
  alarmLo?: number;
  alarmLoLo?: number;
}

// ─── Decoded reading ─────────────────────────────────────────────────────────

export type ParamMap = Record<string, number | string | boolean | null>;

// ─── Driver connection config ────────────────────────────────────────────────

export interface DriverConfig {
  deviceId: string;
  protocol: "modbus_tcp" | "modbus_rtu" | "mqtt" | "http" | "websocket" | "opcua" | "bacnet";
  // Modbus TCP / RTU
  ipAddress?: string;
  port?: number;
  modbusUnitId?: number;
  // MQTT
  brokerUrl?: string;
  topic?: string;
  // HTTP / WebSocket / OPC-UA
  url?: string;
  // HTTP auth
  httpAuthMethod?: "none" | "bearer" | "api_key" | "basic";
  httpAuthValue?: string;    // bearer token or "user:pass" for basic
  httpApiKeyHeader?: string; // custom header name for api_key, e.g. "X-API-Key"
  // OPC-UA
  opcuaSecurityMode?: "None" | "Sign" | "SignAndEncrypt";
  opcuaUsername?: string;
  opcuaPassword?: string;
  // BACnet
  bacnetDeviceInstance?: number;
  // Shared
  pollingIntervalS?: number;
  fieldMap: FieldDef[];
}

// ─── Driver status ───────────────────────────────────────────────────────────

export type DriverStatus = "idle" | "connecting" | "connected" | "error" | "disconnected";

// ─── Driver interface ────────────────────────────────────────────────────────

export interface IDriver extends EventEmitter {
  readonly deviceId: string;
  readonly status: DriverStatus;
  /**
   * Start connecting and polling. Non-throwing — errors are emitted as events.
   */
  start(): void;
  /**
   * Cleanly stop the driver and release all resources.
   */
  stop(): Promise<void>;
  /**
   * Perform one connection test: attempt to connect and read.
   * Resolves within `timeoutMs` ms.
   * Never throws — returns { ok, latencyMs, error, sampleParams }.
   */
  test(timeoutMs?: number): Promise<ConnectionTestResult>;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  sampleParams?: ParamMap;
}

// ─── Driver events ────────────────────────────────────────────────────────────
// "reading"  → (params: ParamMap)
// "error"    → (err: Error)
// "status"   → (status: DriverStatus)
// "log"      → (eventType: string, message: string, rttMs?: number)
