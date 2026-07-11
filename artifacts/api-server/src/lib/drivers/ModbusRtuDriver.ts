/**
 * Modbus RTU / RS485 Driver
 *
 * Talks Modbus RTU (function code 0x03, read holding registers) over a local
 * serial port using the `serialport` npm package. RS485 is the physical
 * transport most field-bus devices use; Modbus RTU is the framing/protocol
 * layered on top of it.
 *
 * Cloud environments (like this one) have no physical serial hardware, so
 * opening the configured port will fail with ENOENT. That is treated as an
 * expected, non-fatal condition: the driver logs a warning, stays idle, and
 * retries periodically in case real hardware is attached later (e.g. via a
 * USB-to-RS485 adapter on a Reserved VM deployment, or a plant-local edge
 * gateway with a real serial bus).
 */

import { EventEmitter } from "node:events";
import { logger } from "../logger.js";
import type { IDriver, DriverConfig, DriverStatus, ParamMap, ConnectionTestResult } from "./types.js";
import { groupFields, decodeField } from "./ModbusTcpDriver.js";

// Narrow shape of the bits of `serialport`'s SerialPort we actually use —
// avoids a hard type dependency so the driver still type-checks even if the
// package (and its native binding) is unavailable at build time.
interface SerialPortLike {
  isOpen: boolean;
  open(cb: (err: Error | null | undefined) => void): void;
  close(cb?: (err: Error | null | undefined) => void): void;
  write(data: Buffer): boolean;
  on(event: "data", listener: (chunk: Buffer) => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "close", listener: () => void): this;
  removeListener(event: string, listener: (...args: unknown[]) => void): this;
}

const DEFAULT_BAUD_RATE = 9600;
const RESPONSE_TIMEOUT_MS = 1_000;
const RECONNECT_DELAY_MS = 30_000; // longer than TCP — no point hammering absent hardware

// ─── CRC16 (Modbus polynomial 0xA001) ──────────────────────────────────────────

function crc16Modbus(buf: Buffer): number {
  let crc = 0xffff;
  for (let pos = 0; pos < buf.length; pos++) {
    crc ^= buf[pos]!;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

// ─── RTU frame helpers ──────────────────────────────────────────────────────────

function buildReadHoldingRegsRtu(slaveId: number, startAddr: number, quantity: number): Buffer {
  const pdu = Buffer.alloc(6);
  pdu.writeUInt8(slaveId & 0xff, 0);
  pdu.writeUInt8(0x03, 1);
  pdu.writeUInt16BE(startAddr, 2);
  pdu.writeUInt16BE(quantity, 4);

  const crc = crc16Modbus(pdu);
  const frame = Buffer.alloc(8);
  pdu.copy(frame, 0);
  frame.writeUInt16LE(crc, 6);
  return frame;
}

/** Parses a Modbus RTU read-holding-registers response, verifying slave ID and CRC. */
function parseHoldingRegRtuResponse(buf: Buffer, expectedSlaveId: number): number[] | null {
  if (buf.length < 5) return null;
  if (buf.readUInt8(0) !== (expectedSlaveId & 0xff)) return null;
  const fc = buf.readUInt8(1);
  if (fc & 0x80) return null; // exception response
  const byteCount = buf.readUInt8(2);
  const totalLen = 3 + byteCount + 2;
  if (buf.length < totalLen) return null;

  const withoutCrc = buf.subarray(0, 3 + byteCount);
  const expectedCrc = crc16Modbus(withoutCrc);
  const actualCrc = buf.readUInt16LE(3 + byteCount);
  if (expectedCrc !== actualCrc) return null;

  const regs: number[] = [];
  for (let i = 0; i < byteCount; i += 2) {
    regs.push(buf.readUInt16BE(3 + i));
  }
  return regs;
}

/** Lazily imports `serialport` so a missing/unbuilt native binding never crashes the process. */
async function loadSerialPortCtor(): Promise<
  { new (opts: {
      path: string;
      baudRate: number;
      dataBits: 5 | 6 | 7 | 8;
      parity: "none" | "even" | "odd";
      stopBits: 1 | 2;
      autoOpen: boolean;
    }): SerialPortLike }
  | null
> {
  try {
    const mod: unknown = await import("serialport");
    const ctor = (mod as { SerialPort?: unknown }).SerialPort;
    return typeof ctor === "function" ? (ctor as never) : null;
  } catch {
    return null;
  }
}

// ─── Driver ──────────────────────────────────────────────────────────────────

export class ModbusRtuDriver extends EventEmitter implements IDriver {
  readonly deviceId: string;
  private _status: DriverStatus = "idle";
  private _port: SerialPortLike | null = null;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _stopped = false;
  private _reconnecting = false;
  private _polling = false;
  private _warnedModuleUnavailable = false;
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
    void this._connect();
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this._port) {
      await new Promise<void>((resolve) => this._port!.close(() => resolve()));
      this._port = null;
    }
    this._setStatus("disconnected");
    this.emit("log", "DISCONNECT", "Driver stopped");
  }

  async test(timeoutMs = 5_000): Promise<ConnectionTestResult> {
    const t0 = Date.now();
    const path = this._cfg.serialPort;
    if (!path) {
      return { ok: false, latencyMs: 0, error: "No serial port path configured (e.g. /dev/ttyUSB0)" };
    }

    const Ctor = await loadSerialPortCtor();
    if (!Ctor) {
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        error: "Serial port support is unavailable in this environment (no native binding) — expected on a cloud sandbox without physical RS485 hardware",
      };
    }

    return new Promise((resolve) => {
      let done = false;
      const port = new Ctor({
        path,
        baudRate: this._cfg.baudRate ?? DEFAULT_BAUD_RATE,
        dataBits: this._cfg.dataBits ?? 8,
        parity: this._cfg.parity ?? "none",
        stopBits: this._cfg.stopBits ?? 1,
        autoOpen: false,
      });

      const finish = (result: ConnectionTestResult) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        port.close(() => resolve(result));
      };

      const timer = setTimeout(() => {
        finish({ ok: false, latencyMs: Date.now() - t0, error: "Serial read timed out" });
      }, timeoutMs);

      port.open((err) => {
        if (err) {
          finish({ ok: false, latencyMs: Date.now() - t0, error: err.message });
          return;
        }
        const slaveId = this._cfg.modbusUnitId ?? 1;
        let buf = Buffer.alloc(0);
        port.on("data", (chunk: Buffer) => {
          buf = Buffer.concat([buf, chunk]);
          const regs = parseHoldingRegRtuResponse(buf, slaveId);
          if (regs) {
            finish({ ok: true, latencyMs: Date.now() - t0, sampleParams: { register_0: regs[0] ?? 0 } });
          }
        });
        port.on("error", (e) => finish({ ok: false, latencyMs: Date.now() - t0, error: e.message }));
        port.write(buildReadHoldingRegsRtu(slaveId, 0, 1));
      });
    });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _setStatus(s: DriverStatus) {
    this._status = s;
    this.emit("status", s);
  }

  private async _connect(): Promise<void> {
    if (this._stopped) return;

    const path = this._cfg.serialPort;
    if (!path) {
      this._setStatus("error");
      this.emit("log", "ERROR", "No serial port path configured (e.g. /dev/ttyUSB0)");
      return;
    }

    const Ctor = await loadSerialPortCtor();
    if (!Ctor) {
      if (!this._warnedModuleUnavailable) {
        this._warnedModuleUnavailable = true;
        logger.warn(
          { deviceId: this.deviceId },
          "ModbusRtuDriver: serial port support unavailable in this environment — RTU driver will remain idle",
        );
      }
      this._setStatus("idle");
      this.emit("log", "ERROR", "Serial port support unavailable (no native binding) — will retry periodically");
      this._scheduleReconnect();
      return;
    }

    const port = new Ctor({
      path,
      baudRate: this._cfg.baudRate ?? DEFAULT_BAUD_RATE,
      dataBits: this._cfg.dataBits ?? 8,
      parity: this._cfg.parity ?? "none",
      stopBits: this._cfg.stopBits ?? 1,
      autoOpen: false,
    });
    this._port = port;

    port.open((err) => {
      if (this._stopped) { port.close(); return; }
      if (err) {
        // Most common cause in this environment: no physical serial device at
        // `path` (ENOENT). This is expected — log and retry later rather than
        // treating it as a crash-worthy error.
        const isMissingDevice = /ENOENT|no such file/i.test(err.message);
        this.emit(
          "log",
          isMissingDevice ? "DISCONNECT" : "ERROR",
          isMissingDevice
            ? `No physical serial device found at ${path} — expected in a cloud environment; will retry`
            : `Failed to open serial port ${path}: ${err.message}`,
        );
        this._port = null;
        this._setStatus("idle");
        this._scheduleReconnect();
        return;
      }

      this._setStatus("connected");
      this.emit("log", "CONNECT", `Opened ${path} @ ${this._cfg.baudRate ?? DEFAULT_BAUD_RATE} baud (slave ${this._cfg.modbusUnitId ?? 1})`);
      this._startPolling();
    });

    port.on("error", (e: Error) => {
      this.emit("log", "ERROR", e.message);
      this.emit("error", e);
    });

    port.on("close", () => {
      if (!this._stopped) this._handleDisconnect();
    });
  }

  private _handleDisconnect(): void {
    if (this._reconnecting) return;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._port = null;
    if (!this._stopped) {
      this._reconnecting = true;
      this._setStatus("idle");
      this._scheduleReconnect(() => { this._reconnecting = false; });
    }
  }

  private _scheduleReconnect(onFire?: () => void): void {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      onFire?.();
      if (!this._stopped) {
        this._setStatus("connecting");
        void this._connect();
      }
    }, RECONNECT_DELAY_MS);
  }

  private _startPolling(): void {
    const intervalMs = (this._cfg.pollingIntervalS ?? 30) * 1000;
    void this._poll();
    this._timer = setInterval(() => void this._poll(), intervalMs);
  }

  private async _poll(): Promise<void> {
    if (!this._port || this._status !== "connected") return;
    if (this._polling) {
      this.emit("log", "READ_WARN", "Poll skipped — previous cycle still in-flight");
      return;
    }

    this._polling = true;
    const groups = groupFields(this._cfg.fieldMap ?? []);
    const params: ParamMap = {};
    const t0 = Date.now();

    try {
      for (const group of groups) {
        const regs = await this._readRegisters(group.startAddr, group.quantity);
        if (!regs) {
          this.emit("log", "READ_FAIL", `Failed to read addr ${group.startAddr} (bus contention, timeout, or CRC error)`);
          this._setStatus("error");
          return;
        }
        for (const field of group.fields) {
          const val = decodeField(regs, field, group.startAddr);
          if (val !== null) params[field.key] = val;
        }
      }

      const rttMs = Date.now() - t0;
      this._setStatus("connected");
      this.emit("log", "READ_OK", `${Object.keys(params).length} params`, rttMs);
      this.emit("reading", params);
    } finally {
      this._polling = false;
    }
  }

  private _readRegisters(startAddr: number, quantity: number): Promise<number[] | null> {
    return new Promise((resolve) => {
      const port = this._port;
      if (!port) { resolve(null); return; }

      const slaveId = this._cfg.modbusUnitId ?? 1;
      const frame = buildReadHoldingRegsRtu(slaveId, startAddr, quantity);
      let buf = Buffer.alloc(0);
      let timedOut = false;

      const onData = (chunk: Buffer) => {
        if (timedOut) return;
        buf = Buffer.concat([buf, chunk]);
        const regs = parseHoldingRegRtuResponse(buf, slaveId);
        if (regs) {
          clearTimeout(timeout);
          port.removeListener("data", onData as never);
          resolve(regs);
        }
      };

      const timeout = setTimeout(() => {
        timedOut = true;
        port.removeListener("data", onData as never);
        resolve(null);
      }, RESPONSE_TIMEOUT_MS);

      port.on("data", onData);
      port.write(frame);
    });
  }
}
