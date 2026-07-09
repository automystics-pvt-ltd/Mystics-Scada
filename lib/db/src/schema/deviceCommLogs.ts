import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

/**
 * Per-device communication event log.
 *
 * event_type: "READ_OK" | "READ_FAIL" | "CONNECT" | "DISCONNECT"
 *           | "TIMEOUT" | "PARSE_ERROR" | "ERROR"
 *
 * Capped at 1 000 rows per device (oldest pruned by the driver registry).
 */
export const deviceCommLogsTable = pgTable(
  "device_comm_logs",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    /** READ_OK | READ_FAIL | CONNECT | DISCONNECT | TIMEOUT | PARSE_ERROR | ERROR */
    eventType: text("event_type").notNull(),
    message: text("message"),
    rttMs: integer("rtt_ms"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    deviceOccurredIdx: index("device_comm_logs_device_occurred_idx").on(
      table.deviceId,
      table.occurredAt,
    ),
  }),
);

export type DeviceCommLogRow = typeof deviceCommLogsTable.$inferSelect;
