import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";
import { organizationsTable } from "./organizations";

export const retryStatusEnum = pgEnum("retry_status", ["pending", "processing", "done", "failed"]);

/**
 * Durable queue for device readings that failed to persist.
 * A background worker retries each row with exponential back-off.
 */
export const ingestionRetryQueueTable = pgTable(
  "ingestion_retry_queue",
  {
    id:           text("id").primaryKey(),
    deviceId:     text("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
    orgId:        text("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    /** The reading payload: { ts: ISO string, params: Record<string, unknown> } */
    payload:      jsonb("payload").notNull(),
    attempts:     integer("attempts").notNull().default(0),
    maxAttempts:  integer("max_attempts").notNull().default(5),
    status:       retryStatusEnum("status").notNull().default("pending"),
    nextRetryAt:  timestamp("next_retry_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    lastError:    text("last_error"),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    statusRetryIdx: index("irq_status_retry_idx").on(t.status, t.nextRetryAt),
    deviceIdx:      index("irq_device_idx").on(t.deviceId),
  }),
);

export type IngestionRetryQueueRow = typeof ingestionRetryQueueTable.$inferSelect;
