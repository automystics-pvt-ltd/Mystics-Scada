/**
 * Persistent Ingestion Retry Worker
 *
 * Polls the ingestion_retry_queue table every 30 s.
 * For each "pending" row whose next_retry_at ≤ now it attempts to write the
 * reading to device_readings. On success the row is marked "done". On failure
 * it increments attempts and schedules the next retry with exponential back-off
 * (capped at 2 h). After maxAttempts failures the row is marked "failed".
 *
 * Concurrency-safe: the SELECT + status-flip to "processing" happens in a
 * single transaction with SKIP LOCKED so multiple workers never double-process.
 */

import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  ingestionRetryQueueTable,
  deviceReadingsTable,
  devicesTable,
} from "@workspace/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 30_000;
const MAX_BATCH        = 50;

// ── State tracking ────────────────────────────────────────────────────────────

interface RetryWorkerState {
  running: boolean;
  startedAt: string | null;
  lastRunAt: string | null;
  runsCompleted: number;
  lastBatchSize: number;
  lastError: string | null;
  pollIntervalMs: number;
}
const _state: RetryWorkerState = {
  running: false, startedAt: null, lastRunAt: null,
  runsCompleted: 0, lastBatchSize: 0, lastError: null,
  pollIntervalMs: POLL_INTERVAL_MS,
};
export function getRetryWorkerState(): RetryWorkerState { return { ..._state }; }
export function triggerRetryWorker(): void { void processBatch().catch(() => undefined); }

type ReadingPayload = { ts: string; params: Record<string, unknown> };
type QueueRow = typeof ingestionRetryQueueTable.$inferSelect;

async function claimBatch(now: Date): Promise<QueueRow[]> {
  // Claim rows atomically: SELECT FOR UPDATE SKIP LOCKED + UPDATE inside one transaction
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(ingestionRetryQueueTable)
      .where(
        and(
          eq(ingestionRetryQueueTable.status, "pending"),
          lte(ingestionRetryQueueTable.nextRetryAt, now),
        ),
      )
      .limit(MAX_BATCH)
      .for("update", { skipLocked: true });

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    await tx
      .update(ingestionRetryQueueTable)
      .set({ status: "processing" })
      .where(
        sql`${ingestionRetryQueueTable.id} = ANY(ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::text[])`,
      );

    return rows;
  });
}

async function processBatch(): Promise<void> {
  const now = new Date();
  _state.lastRunAt = now.toISOString();
  const rows = await claimBatch(now);
  _state.lastBatchSize = rows.length;
  if (rows.length === 0) { _state.runsCompleted++; return; }

  for (const row of rows) {
    const payload = row.payload as ReadingPayload;
    try {
      const ts = new Date(payload.ts);
      await db.insert(deviceReadingsTable).values({
        id:       randomUUID(),
        deviceId: row.deviceId,
        orgId:    row.orgId,
        ts,
        params:   payload.params,
      }).onConflictDoNothing();

      // Also touch device lastSeenAt on successful retry
      await db
        .update(devicesTable)
        .set({ lastSeenAt: ts, updatedAt: now })
        .where(eq(devicesTable.id, row.deviceId));

      await db
        .update(ingestionRetryQueueTable)
        .set({ status: "done" })
        .where(eq(ingestionRetryQueueTable.id, row.id));

      logger.debug({ jobId: row.id, deviceId: row.deviceId }, "Retry job succeeded");
    } catch (err) {
      const attempts = row.attempts + 1;
      const isFinal  = attempts >= row.maxAttempts;

      // Exponential back-off: 2^attempts × 30 s, max 2 h
      const backoffMs  = Math.min(Math.pow(2, attempts) * 30_000, 7_200_000);
      const nextRetry  = new Date(Date.now() + backoffMs);

      await db
        .update(ingestionRetryQueueTable)
        .set({
          status:      isFinal ? "failed" : "pending",
          attempts,
          nextRetryAt: nextRetry,
          lastError:   err instanceof Error ? err.message : String(err),
        })
        .where(eq(ingestionRetryQueueTable.id, row.id));

      _state.lastError = err instanceof Error ? err.message : String(err);
      logger.warn({ jobId: row.id, deviceId: row.deviceId, attempts, isFinal }, "Retry job failed");
    }
  }
  _state.runsCompleted++;
}

let _timer: NodeJS.Timeout | null = null;

export function startRetryWorker(): void {
  if (_timer) return;
  _state.running = true;
  _state.startedAt = new Date().toISOString();
  logger.info("IngestionRetryWorker: starting");
  _timer = setInterval(() => {
    processBatch().catch((err) => {
      logger.error({ err }, "IngestionRetryWorker: batch error");
    });
  }, POLL_INTERVAL_MS);
  // Run one cycle immediately so stale jobs don't wait 30 s after restart
  processBatch().catch(() => undefined);
}

export function stopRetryWorker(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
