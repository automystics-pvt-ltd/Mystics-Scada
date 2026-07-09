import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";
import { organizationsTable } from "./organizations";

/**
 * Time-series storage for ingested device readings.
 *
 * params: Record<string, number | string | boolean>
 *   — keyed by FieldDef.key from the device template, e.g.
 *     { acPowerKw: 12.5, dcVoltageV: 623.1, deviceTempC: 42.3 }
 *
 * Kept bounded per device: the driver registry prunes rows older than 24h
 * and caps to the latest 2 000 rows per device on each write.
 */
export const deviceReadingsTable = pgTable(
  "device_readings",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    /** Decoded parameter values keyed by FieldDef.key */
    params: jsonb("params").notNull().default({}),
  },
  (table) => ({
    deviceTsIdx: index("device_readings_device_ts_idx").on(table.deviceId, table.ts),
    orgTsIdx: index("device_readings_org_ts_idx").on(table.orgId, table.ts),
  }),
);

export type DeviceReadingRow = typeof deviceReadingsTable.$inferSelect;
