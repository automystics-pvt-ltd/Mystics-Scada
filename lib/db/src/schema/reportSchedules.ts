import { index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

/**
 * Recurring report delivery schedule.
 * Unique on (orgId, reportType, frequency) — prevents duplicate scheduled reports
 * even if two users configure the same type+frequency simultaneously.
 */
export const reportSchedulesTable = pgTable(
  "report_schedules",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
    /** Content type key from REPORT_TYPE_CATALOG (e.g. "energy_generation"). */
    reportType: text("report_type").notNull(),
    plantIds: text("plant_ids").array().notNull().default([]),
    /** "pdf" | "csv" */
    format: text("format").notNull().default("pdf"),
    /** "daily" | "weekly" | "monthly" */
    frequency: text("frequency").notNull(),
    /** 0 = Sunday … 6 = Saturday — only used when frequency = "weekly". */
    dayOfWeek: integer("day_of_week"),
    /** HH:MM in UTC, e.g. "08:00". */
    timeUtc: text("time_utc").notNull().default("08:00"),
    /** Comma-separated email recipient list stored as an array. */
    recipients: text("recipients").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("report_schedules_org_id_idx").on(table.orgId),
    /** Prevent duplicate schedules for the same (org, report type, frequency). */
    uniqueOrgTypeFreq: unique("report_schedules_org_type_freq_uq").on(
      table.orgId,
      table.reportType,
      table.frequency,
    ),
  }),
);

export const insertReportScheduleSchema = createInsertSchema(reportSchedulesTable);
export type InsertReportSchedule = z.infer<typeof insertReportScheduleSchema>;
export type ReportScheduleRow = typeof reportSchedulesTable.$inferSelect;
