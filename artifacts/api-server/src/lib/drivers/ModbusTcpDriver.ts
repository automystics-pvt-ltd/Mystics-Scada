/**
 * Modbus TCP Driver
 *
 * Uses Node.js built-in `net` module — no native dependencies.
 * Reads all field-map registers in minimum batches (max 125 regs / request).
 */

import net from "node:net";
import { EventEmitter } from "node:events";
import type { IDriver, DriverConfig, DriverStatus, ParamMap, FieldDef, ConnectionTestResult } from "./types.js";

const MAX_REGS_PER_REQUEST = 125;
const RESPONSE_TIMEOUT_MS = 3_000;

// ─── MBAP + PDU helpers ───────────────────────────────────────────────────────

function buildReadHoldingRegs(
  transId: number,
  unitId: number,
  startAddr: number,
  quantity: number,
): Buffer {
  const pdu = Buffer.alloc(5);
  pdu.writeUInt8(0x03, 0);
  pdu.writeUInt16BE(startAddr, 1);
  pdu.writeUInt16BE(quantity, 3);

  const header = Buffer.alloc(7);
  header.writeUInt16BE(transId & 0xffff, 0);  // transaction ID
  header.writeUInt16BE(0x0000, 2);             // protocol ID
  header.writeUInt16BE(pdu.length + 1, 4);     // length = PDU + unit byte
  header.writeUInt8(unitId & 0xff, 6);

  return Buffer.concat([header, pdu]);
}

function parseHoldingRegResponse(buf: Buffer): number[] | null {
  if (buf.length < 9) return null;
  const fc = buf.readUInt8(7);
  if (fc & 0x80) return null; // exception response
  const byteCount = buf.readUInt8(8);
  if (buf.length < 9 + byteCount) return null;
  const regs: number[] = [];
  for (let i = 0; i < byteCount; i += 2) {
    regs.push(buf.readUInt16BE(9 + i));
  }
  return regs;
}

// ─── Field decoding ───────────────────────────────────────────────────────────

function decodeField(regs: number[], field: FieldDef, baseAddr: number): number | null {
  if (field.address === undefined) return null;
  const idx = field.address - baseAddr;
  const len = field.length ?? 1;
  if (idx < 0 || idx + len > regs.length) return null;

  // Pack register words into a Buffer for type-safe decoding
  const buf = Buffer.alloc(len * 2);
  for (let i = 0; i < len; i++) {
    buf.writeUInt16BE(regs[idx + i]!, i * 2);
  }

  let raw: number;
  switch (field.dataType) {
    case "INT16":   raw = buf.readInt16BE(0);   break;
    case "UINT16":  raw = buf.readUInt16BE(0);  break;
    case "INT32":   raw = buf.readInt32BE(0);   break;
    case "UINT32":  raw = buf.readUInt32BE(0);  break;
    case "FLOAT32": raw = buf.readFloatBE(0);   break;
    default:        raw = buf.readUInt16BE(0);  break;
  }

  const scaled = raw * (field.multiplier ?? 1) + (field.offset ?? 0);
  return Math.round(scaled * 1000) / 1000; // 3 decimal places
}

// ─── Group fields into minimal batch read windows ─────────────────────────────

interface ReadGroup {
  startAddr: number;
  quantity: number;
  fields: FieldDef[];
}

function groupFields(fields: FieldDef[]): ReadGroup[] {
  const sorted = fields
    .filter((f) => f.address !== undefined)
    .sort((a, b) => (a.address ?? 0) - (b.address ?? 0));

  const groups: ReadGroup[] = [];
  let current: ReadGroup | null = null;

  for (const f of sorted) {
    const addr = f.address!;
    const len = f.length ?? 1;

    if (!current) {
      current = { startAddr: addr, quantity: len, fields: [f] };
      continue;
    }

    const newEnd = addr + len - current.startAddr;
    if (newEnd <= MAX_REGS_PER_REQUEST) {
      current.quantity = Math.max(current.quantity, newEnd);
      current.fields.push(f);
    } else {
      groups.push(current);
      current = { startAddr: addr, quantity: len, fields: [f] };
    }
  }
  if (current) groups.push(current);
  return groups;
}

// ─── Driver ──────────────────────────────────────────────────────────────────

export class ModbusTcpDriver extends EventEmitter implements IDriver {
  readonly deviceId: string;
  private _status: DriverStatus = "idle";
  private _socket: net.Socket | null = null;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _stopped = false;
  private _reconnecting = false; // guard against double-schedule on close-after-destroy
  private _transId = 0;
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
    this._connect();
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._socket) { this._socket.destroy(); this._socket = null; }
    this._setStatus("disconnected");
    this.emit("log", "DISCONNECT", "Driver stopped");
  }

  async test(timeoutMs = 5_000): Promise<ConnectionTestResult> {
    const t0 = Date.now();
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({ ok: false, latencyMs: Date.now() - t0, error: "Connection timed out" });
      }, timeoutMs);

      const socket = new net.Socket();
      const host = this._cfg.ipAddress ?? "localhost";
      const port = this._cfg.port ?? 502;
      const unitId = this._cfg.modbusUnitId ?? 1;
      let done = false;

      socket.connect(port, host, () => {
        // Send a read of 1 register at address 0 as a probe
        socket.write(buildReadHoldingRegs(1, unitId, 0, 1));
      });

      const buf: Buffer[] = [];
      socket.on("data", (chunk: Buffer) => {
        buf.push(chunk);
        const full = Buffer.concat(buf);
        if (full.length >= 9) {
          if (!done) {
            done = true;
            clearTimeout(timeout);
            socket.destroy();
            const regs = parseHoldingRegResponse(full);
            resolve({
              ok: regs !== null,
              latencyMs: Date.now() - t0,
              sampleParams: regs ? { "register_0": regs[0] ?? 0 } : undefined,
              error: regs === null ? "Exception response from device" : undefined,
            });
          }
        }
      });

      socket.on("error", (err) => {
        if (!done) {
          done = true;
          clearTimeout(timeout);
          resolve({ ok: false, latencyMs: Date.now() - t0, error: err.message });
        }
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
    const host = this._cfg.ipAddress ?? "127.0.0.1";
    const port = this._cfg.port ?? 502;

    const socket = new net.Socket();
    this._socket = socket;

    socket.setTimeout(RESPONSE_TIMEOUT_MS);

    socket.connect(port, host, () => {
      if (this._stopped) { socket.destroy(); return; }
      this._setStatus("connected");
      this.emit("log", "CONNECT", `Connected to ${host}:${port}`);
      this._startPolling();
    });

    socket.on("timeout", () => {
      this.emit("log", "TIMEOUT", "Socket timeout");
      this._handleDisconnect();
    });

    socket.on("error", (err) => {
      this.emit("log", "ERROR", err.message);
      this.emit("error", err);
      this._handleDisconnect();
    });

    socket.on("close", () => {
      if (!this._stopped) this._handleDisconnect();
    });
  }

  private _handleDisconnect() {
    // Guard: when _handleDisconnect is called from a "timeout" or "error" event,
    // the subsequent socket.destroy() triggers a "close" event which would call
    // _handleDisconnect again — resulting in two reconnect setTimeout calls.
    if (this._reconnecting) return;

    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._socket) {
      this._socket.removeAllListeners(); // prevent further event callbacks
      this._socket.destroy();
      this._socket = null;
    }
    if (!this._stopped) {
      this._reconnecting = true;
      this._setStatus("error");
      setTimeout(() => {
        this._reconnecting = false;
        if (!this._stopped) {
          this._setStatus("connecting");
          this._connect();
        }
      }, 15_000);
    }
  }

  private _startPolling() {
    const intervalMs = (this._cfg.pollingIntervalS ?? 30) * 1000;
    // Fire immediately, then on interval
    void this._poll();
    this._timer = setInterval(() => void this._poll(), intervalMs);
  }

  private async _poll(): Promise<void> {
    if (!this._socket || this._status !== "connected") return;

    const groups = groupFields(this._cfg.fieldMap ?? []);
    const params: ParamMap = {};
    const t0 = Date.now();

    for (const group of groups) {
      const regs = await this._readRegisters(group.startAddr, group.quantity);
      if (!regs) {
        this.emit("log", "READ_FAIL", `Failed to read addr ${group.startAddr}`);
        this._setStatus("error");
        return;
      }
      for (const field of group.fields) {
        const val = decodeField(regs, field, group.startAddr);
        if (val !== null) params[field.key] = val;
      }
    }

    const rttMs = Date.now() - t0;
    this.emit("log", "READ_OK", `${Object.keys(params).length} params`, rttMs);
    this.emit("reading", params);
  }

  private _readRegisters(startAddr: number, quantity: number): Promise<number[] | null> {
    return new Promise((resolve) => {
      if (!this._socket) { resolve(null); return; }

      const transId = ++this._transId & 0xffff;
      const unitId = this._cfg.modbusUnitId ?? 1;
      const req = buildReadHoldingRegs(transId, unitId, startAddr, quantity);

      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        this._socket?.removeListener("data", onData);
        resolve(null);
      }, RESPONSE_TIMEOUT_MS);

      const buf: Buffer[] = [];
      this._socket.write(req);

      const onData = (chunk: Buffer) => {
        if (timedOut) return; // ignore late data after timeout
        buf.push(chunk);
        const full = Buffer.concat(buf);
        const expectedLen = 9 + quantity * 2;
        if (full.length >= expectedLen) {
          clearTimeout(timeout);
          this._socket?.removeListener("data", onData);
          resolve(parseHoldingRegResponse(full));
        }
      };

      this._socket.on("data", onData);
    });
  }
}
