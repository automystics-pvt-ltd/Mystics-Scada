/**
 * Minimal Modbus TCP poller for the edge agent — reads holding registers and
 * decodes them per the device's field map. Mirrors the wire format used by
 * the cloud API's ModbusTcpDriver (see artifacts/api-server/src/lib/drivers)
 * so a device behaves identically whether polled from the cloud or the edge.
 */

import net from "node:net";
import type { FieldDef, ParamMap } from "./types.js";

const RESPONSE_TIMEOUT_MS = 3_000;

function buildReadHoldingRegs(transId: number, unitId: number, startAddr: number, quantity: number): Buffer {
  const pdu = Buffer.alloc(5);
  pdu.writeUInt8(0x03, 0);
  pdu.writeUInt16BE(startAddr, 1);
  pdu.writeUInt16BE(quantity, 3);
  const header = Buffer.alloc(7);
  header.writeUInt16BE(transId & 0xffff, 0);
  header.writeUInt16BE(0x0000, 2);
  header.writeUInt16BE(pdu.length + 1, 4);
  header.writeUInt8(unitId & 0xff, 6);
  return Buffer.concat([header, pdu]);
}

function parseHoldingRegResponse(buf: Buffer): number[] | null {
  if (buf.length < 9) return null;
  const fc = buf.readUInt8(7);
  if (fc & 0x80) return null;
  const byteCount = buf.readUInt8(8);
  if (buf.length < 9 + byteCount) return null;
  const regs: number[] = [];
  for (let i = 0; i < byteCount; i += 2) regs.push(buf.readUInt16BE(9 + i));
  return regs;
}

function decodeField(regs: number[], field: FieldDef, baseAddr: number): number | null {
  if (field.address === undefined) return null;
  const idx = field.address - baseAddr;
  const len = field.length ?? 1;
  if (idx < 0 || idx + len > regs.length) return null;
  const buf = Buffer.alloc(len * 2);
  for (let i = 0; i < len; i++) buf.writeUInt16BE(regs[idx + i]!, i * 2);

  let raw: number;
  switch (field.dataType) {
    case "INT16": raw = buf.readInt16BE(0); break;
    case "UINT16": raw = buf.readUInt16BE(0); break;
    case "INT32": raw = buf.readInt32BE(0); break;
    case "UINT32": raw = buf.readUInt32BE(0); break;
    case "FLOAT32": raw = buf.readFloatBE(0); break;
    default: raw = buf.readUInt16BE(0);
  }
  return raw * (field.multiplier ?? 1) + (field.offset ?? 0);
}

export interface ModbusTcpTarget {
  ipAddress: string;
  port: number;
  modbusUnitId: number;
  fieldMap: FieldDef[];
}

/** Opens a fresh TCP connection, reads all fields, closes, and returns decoded params. */
export function pollModbusTcp(target: ModbusTcpTarget): Promise<ParamMap> {
  return new Promise((resolve, reject) => {
    const addressed = target.fieldMap.filter((f) => f.address !== undefined);
    if (addressed.length === 0) {
      resolve({});
      return;
    }
    const minAddr = Math.min(...addressed.map((f) => f.address!));
    const maxAddr = Math.max(...addressed.map((f) => f.address! + (f.length ?? 1) - 1));
    const quantity = Math.min(125, maxAddr - minAddr + 1);

    const socket = new net.Socket();
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      fn();
    };

    const timer = setTimeout(() => finish(() => reject(new Error("Modbus TCP read timed out"))), RESPONSE_TIMEOUT_MS);

    socket.once("error", (err) => finish(() => reject(err)));
    socket.connect(target.port, target.ipAddress, () => {
      socket.write(buildReadHoldingRegs(1, target.modbusUnitId, minAddr, quantity));
    });

    let acc = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      acc = Buffer.concat([acc, chunk]);
      const regs = parseHoldingRegResponse(acc);
      if (!regs) return;
      const params: ParamMap = {};
      for (const field of addressed) {
        const value = decodeField(regs, field, minAddr);
        if (value !== null) params[field.key] = value;
      }
      finish(() => resolve(params));
    });
  });
}
