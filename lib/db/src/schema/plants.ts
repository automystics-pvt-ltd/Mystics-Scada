import { index, integer, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

/**
 * User-created solar plant sites.
 *
 * trackerType: "fixed_tilt" | "single_axis_tracker"
 * Static demo plants (Thar, Sundarbans, etc.) live in the simulation layer
 * and are NOT stored here — only wizard-created plants are persisted.
 */
export const plantsTable = pgTable(
  "plants",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
    name: text("name").notNull(),
    location: text("location").notNull().default(""),
    capacityMw: real("capacity_mw").notNull().default(10),
    timezoneOffsetHours: real("timezone_offset_hours").notNull().default(5.5),
    trackerType: text("tracker_type").notNull().default("fixed_tilt"),
    commissionedYear: integer("commissioned_year").notNull().default(2024),
    inverterCount: integer("inverter_count").notNull().default(4),
    inverterRatingKw: integer("inverter_rating_kw").notNull().default(1500),
    stringsPerInverter: integer("strings_per_inverter").notNull().default(12),
    weatherStationCount: integer("weather_station_count").notNull().default(1),
    cloudinessSeed: real("cloudiness_seed").notNull().default(0.2),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("plants_org_id_idx").on(table.orgId),
  }),
);

export const insertPlantSchema = createInsertSchema(plantsTable);
export type InsertPlant = z.infer<typeof insertPlantSchema>;
export type PlantRow = typeof plantsTable.$inferSelect;
