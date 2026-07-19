/**
 * FTP / FTPS / SFTP Scheduled File Pull
 *
 * Every minute this scheduler checks ftp_sources rows whose
 * next poll time has passed, downloads new CSV files, parses them,
 * and ingests readings into device_readings via the same path as
 * the manual CSV import endpoint.
 */

import { randomUUID } from "node:crypto";
import * as ftp from "basic-ftp";
import SftpClient from "ssh2-sftp-client";
import { db } from "@workspace/db";
import {
  ftpSourcesTable,
  deviceReadingsTable,
  devicesTable,
} from "@workspace/db/schema";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { logger } from "./logger";
import { decryptCredential } from "./credentialCrypto";

// ── RFC 4180 CSV parser (same algorithm as devices.ts) ────────────────────────

function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  function parseField(raw: string): string {
    const t = raw.trim();
    return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/""/g, '"') : t;
  }
  function tokenise(line: string): string[] {
    const fields: string[] = [];
    let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === ',') { fields.push(cur); cur = ""; }
      else cur += ch;
    }
    fields.push(cur);
    return fields;
  }
  const norm = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines: string[] = [];
  let buf = ""; let inQ = false;
  for (const ch of norm) {
    if (ch === '"') { inQ = !inQ; buf += ch; }
    else if (ch === "\n" && !inQ) { rawLines.push(buf); buf = ""; }
    else buf += ch;
  }
  if (buf) rawLines.push(buf);
  const nonEmpty = rawLines.filter((l) => l.trim());
  if (nonEmpty.length < 2) return { headers: [], rows: [] };
  const headers = tokenise(nonEmpty[0]!).map(parseField);
  return {
    headers,
    rows: nonEmpty.slice(1).map((line) => {
      const cols = tokenise(line).map(parseField);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cols[i] ?? ""; });
      return row;
    }),
  };
}

// ── Ingest parsed CSV rows for a device ───────────────────────────────────────

async function ingestRows(
  deviceId: string,
  orgId: string,
  rows: Record<string, string>[],
  tsCol: string,
  paramCols: string[],
): Promise<number> {
  const CHUNK = 200;
  let imported = 0;
  const toInsert: { ts: Date; params: Record<string, number | string> }[] = [];

  for (const r of rows) {
    const raw = r[tsCol]?.trim();
    if (!raw) continue;
    const ts = new Date(raw);
    if (isNaN(ts.getTime())) continue;
    const params: Record<string, number | string> = {};
    for (const col of paramCols) {
      const val = r[col];
      if (val !== undefined && val !== "") {
        const num = Number(val);
        params[col] = isNaN(num) ? val : num;
      }
    }
    if (Object.keys(params).length === 0) continue;
    toInsert.push({ ts, params });
  }

  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const inserted = await db
      .insert(deviceReadingsTable)
      .values(chunk.map((c) => ({ id: randomUUID(), deviceId, orgId, ts: c.ts, params: c.params })))
      .onConflictDoNothing()
      .returning({ id: deviceReadingsTable.id });
    imported += inserted.length;
  }

  // Touch lastSeenAt
  if (imported > 0) {
    await db
      .update(devicesTable)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(devicesTable.id, deviceId));
  }
  return imported;
}

// ── File name pattern matching (glob: *.csv or prefix*) ───────────────────────

function matchesPattern(filename: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(filename);
}

// ── Download and parse a single source ───────────────────────────────────────

async function pollSource(row: typeof ftpSourcesTable.$inferSelect): Promise<void> {
  const { id, host, port, protocol, username, remotePath, filePattern, lastPulledFile, deviceId, orgId } = row;
  const password = decryptCredential(row.passwordEnc);

  let csvContent = "";
  let downloadedFile = "";

  if (protocol === "sftp") {
    const sftp = new SftpClient();
    try {
      await sftp.connect({ host, port, username, password });
      const list = await sftp.list(remotePath) as Array<{ name: string; modifyTime: number }>;
      const candidates = (list as Array<{ name: string; modifyTime: number }>)
        .filter((f) => matchesPattern(f.name, filePattern ?? "*.csv"))
        .sort((a, b) => b.modifyTime - a.modifyTime);
      const target = candidates[0];
      if (!target || target.name === lastPulledFile) return;
      downloadedFile = target.name;
      const buf: Buffer[] = [];
      await sftp.get(`${remotePath}/${target.name}`, (chunk: Buffer) => { buf.push(chunk); });
      csvContent = Buffer.concat(buf).toString("utf-8");
    } finally {
      await sftp.end().catch(() => undefined);
    }
  } else {
    // FTP / FTPS
    const client = new ftp.Client(15000);
    client.ftp.verbose = false;
    try {
      await client.access({ host, port, user: username, password, secure: protocol === "ftps" });
      await client.cd(remotePath);
      const list = await client.list();
      const candidates = list
        .filter((f) => f.type === ftp.FileType.File && matchesPattern(f.name, filePattern ?? "*.csv"))
        .sort((a, b) => {
          // basic-ftp FileInfo.date can be a Date or string depending on server
          const aRaw = a.date as Date | string | undefined;
          const bRaw = b.date as Date | string | undefined;
          const aTime = aRaw ? new Date(aRaw instanceof Date ? aRaw.toISOString() : aRaw).getTime() : 0;
          const bTime = bRaw ? new Date(bRaw instanceof Date ? bRaw.toISOString() : bRaw).getTime() : 0;
          return bTime - aTime;
        });
      const target = candidates[0];
      if (!target || target.name === lastPulledFile) return;
      downloadedFile = target.name;
      const chunks: Buffer[] = [];
      const writable = new (await import("node:stream")).Writable({
        write(chunk: Buffer, _enc, cb) { chunks.push(chunk); cb(); },
      });
      await client.downloadTo(writable, target.name);
      csvContent = Buffer.concat(chunks).toString("utf-8");
    } finally {
      client.close();
    }
  }

  if (!csvContent || !downloadedFile) return;

  const { headers, rows } = parseCsvText(csvContent);
  if (headers.length === 0) return;

  const tsCol = headers.find((h) => /^(timestamp|ts|time|datetime|date_time)$/i.test(h)) ?? headers[0]!;
  const paramCols = headers.filter((h) => h !== tsCol);
  if (paramCols.length === 0) return;

  // Use configured deviceId or derive from first data row
  const targetDeviceId = deviceId ?? null;
  if (!targetDeviceId || !orgId) {
    logger.warn({ sourceId: id }, "FTP source has no deviceId — skipping ingest");
    return;
  }

  const imported = await ingestRows(targetDeviceId, orgId, rows, tsCol, paramCols);

  await db
    .update(ftpSourcesTable)
    .set({ lastPulledAt: new Date(), lastPulledFile: downloadedFile, lastError: null, updatedAt: new Date() })
    .where(eq(ftpSourcesTable.id, id));

  logger.info({ sourceId: id, file: downloadedFile, imported }, "FTP source polled");
}

// ── Scheduler ────────────────────────────────────────────────────────────────

const TICK_MS = 60_000; // check every minute
let _timer: NodeJS.Timeout | null = null;

// ── State tracking ────────────────────────────────────────────────────────────

interface FtpSchedulerState {
  running: boolean;
  startedAt: string | null;
  lastTickAt: string | null;
  ticksCompleted: number;
  sourcesProcessed: number;
  lastError: string | null;
  tickIntervalMs: number;
}
const _ftpState: FtpSchedulerState = {
  running: false, startedAt: null, lastTickAt: null,
  ticksCompleted: 0, sourcesProcessed: 0, lastError: null,
  tickIntervalMs: TICK_MS,
};
export function getFtpSchedulerState(): FtpSchedulerState { return { ..._ftpState }; }
export function triggerFtpScheduler(): void { void tick().catch(() => undefined); }

async function tick(): Promise<void> {
  const now = new Date();
  _ftpState.lastTickAt = now.toISOString();
  _ftpState.ticksCompleted++;
  const due = await db
    .select()
    .from(ftpSourcesTable)
    .where(
      and(
        eq(ftpSourcesTable.active, true),
        or(
          isNull(ftpSourcesTable.lastPulledAt),
          lte(
            sql`${ftpSourcesTable.lastPulledAt} + (${ftpSourcesTable.intervalMinutes} * interval '1 minute')`,
            now,
          ),
        ),
      ),
    );

  _ftpState.sourcesProcessed += due.length;
  for (const source of due) {
    pollSource(source).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      _ftpState.lastError = msg;
      logger.warn({ sourceId: source.id, err: msg }, "FTP source poll error");
      db.update(ftpSourcesTable)
        .set({ lastError: msg, updatedAt: new Date() })
        .where(eq(ftpSourcesTable.id, source.id))
        .catch(() => undefined);
    });
  }
}

export function startFtpScheduler(): void {
  if (_timer) return;
  _ftpState.running = true;
  _ftpState.startedAt = new Date().toISOString();
  logger.info("FtpScheduler: starting");
  _timer = setInterval(() => { tick().catch(() => undefined); }, TICK_MS);
  tick().catch(() => undefined);
}

export function stopFtpScheduler(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
