import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const reportsTable = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
    name: text("name").notNull(),
    type: text("type").notNull(),
    format: text("format").notNull(),
    plantIds: text("plant_ids").array().notNull().default([]),
    status: text("status").notNull(),
    requestedBy: text("requested_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    downloadUrl: text("download_url"),
    /** Content type key from REPORT_TYPE_CATALOG (e.g. "energy_generation"). Null on legacy rows. */
    reportType: text("report_type"),
    /** Reporting period start — null on legacy rows. */
    dateFrom: timestamp("date_from", { withTimezone: true }),
    /** Reporting period end — null on legacy rows. */
    dateTo: timestamp("date_to", { withTimezone: true }),
  },
  (table) => ({
    orgIdIdx: index("reports_org_id_idx").on(table.orgId),
    orgStatusIdx: index("reports_org_status_idx").on(table.orgId, table.status),
  }),
);

export const insertReportSchema = createInsertSchema(reportsTable);
export type InsertReport = z.infer<typeof insertReportSchema>;
export type ReportRow = typeof reportsTable.$inferSelect;
