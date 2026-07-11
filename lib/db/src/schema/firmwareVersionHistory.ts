import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

/**
 * Records every detected firmware version change for a device.
 * A new row is written whenever the driver registry decodes a
 * firmware_version_register/param value that differs from
 * devices.firmware_version.
 */
export const firmwareVersionHistoryTable = pgTable(
  "firmware_version_history",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    previousVersion: text("previous_version"),
    newVersion: text("new_version").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    deviceDetectedIdx: index("firmware_version_history_device_detected_idx").on(
      table.deviceId,
      table.detectedAt,
    ),
  }),
);

export type FirmwareVersionHistoryRow = typeof firmwareVersionHistoryTable.$inferSelect;
