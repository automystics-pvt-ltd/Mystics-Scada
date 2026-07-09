import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { deviceTemplatesTable } from "./deviceTemplates";

/**
 * IoT device registry — one row per physical device connected to a plant.
 *
 * type:     "RTU" | "PLC" | "data_logger" | "smart_meter" | "inverter" |
 *           "weather_station" | "tracker_controller" | "sensor" | "gateway"
 * protocol: "modbus" | "mqtt" | "http" | "opcua"
 * status:   "online" | "offline" | "error" | "maintenance"
 */
export const devicesTable = pgTable(
  "devices",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
    plantId: text("plant_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    protocol: text("protocol").notNull(),
    status: text("status").notNull().default("offline"),
    firmwareVersion: text("firmware_version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** FK to device_templates — null if no template assigned */
    templateId: text("template_id").references(() => deviceTemplatesTable.id, { onDelete: "set null" }),
    /** Arbitrary device-specific settings stored as JSONB. */
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("devices_org_id_idx").on(table.orgId),
    plantIdIdx: index("devices_plant_id_idx").on(table.plantId),
    orgPlantIdx: index("devices_org_plant_idx").on(table.orgId, table.plantId),
  }),
);

export const insertDeviceSchema = createInsertSchema(devicesTable);
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type DeviceRow = typeof devicesTable.$inferSelect;
