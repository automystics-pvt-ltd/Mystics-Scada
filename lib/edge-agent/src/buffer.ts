import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ReadingBatchItem } from "./apiClient.js";
import { logger } from "./logger.js";

/**
 * Local SQLite buffer so readings survive a cloud outage.
 *
 * Writes go here first (durable, synchronous). A background flush loop pulls
 * batches out in `ts` order and deletes them on a successful push. When the
 * buffer exceeds `maxRows`, the oldest rows are pruned so a prolonged outage
 * cannot grow the file unbounded.
 */
export class ReadingsBuffer {
  private readonly db: Database.Database;

  constructor(dbPath: string, private readonly maxRows: number) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        params TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  enqueue(item: ReadingBatchItem): void {
    this.db
      .prepare("INSERT INTO readings (device_id, ts, params) VALUES (?, ?, ?)")
      .run(item.deviceId, item.ts, JSON.stringify(item.params));
    this.prune();
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM readings").get() as { c: number };
    return row.c;
  }

  /** Oldest-first batch, capped at `limit` rows. */
  peekBatch(limit: number): { rowIds: number[]; items: ReadingBatchItem[] } {
    const rows = this.db
      .prepare("SELECT id, device_id, ts, params FROM readings ORDER BY ts ASC LIMIT ?")
      .all(limit) as { id: number; device_id: string; ts: string; params: string }[];
    return {
      rowIds: rows.map((r) => r.id),
      items: rows.map((r) => ({
        deviceId: r.device_id,
        ts: r.ts,
        params: JSON.parse(r.params) as Record<string, number | string | boolean | null>,
      })),
    };
  }

  deleteRows(rowIds: number[]): void {
    if (rowIds.length === 0) return;
    const placeholders = rowIds.map(() => "?").join(",");
    this.db.prepare(`DELETE FROM readings WHERE id IN (${placeholders})`).run(...rowIds);
  }

  /** Cap the buffer at maxRows — oldest rows are dropped first. */
  private prune(): void {
    const total = this.count();
    if (total <= this.maxRows) return;
    const excess = total - this.maxRows;
    this.db
      .prepare(
        `DELETE FROM readings WHERE id IN (SELECT id FROM readings ORDER BY ts ASC LIMIT ?)`,
      )
      .run(excess);
    logger.warn("Offline buffer exceeded max rows — dropped oldest readings", { excess, maxRows: this.maxRows });
  }

  close(): void {
    this.db.close();
  }
}
