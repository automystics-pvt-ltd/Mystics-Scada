import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reportsTable = pgTable("reports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  format: text("format").notNull(),
  plantIds: text("plant_ids").array().notNull().default([]),
  status: text("status").notNull(),
  requestedBy: text("requested_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  downloadUrl: text("download_url"),
});

export const insertReportSchema = createInsertSchema(reportsTable);
export type InsertReport = z.infer<typeof insertReportSchema>;
export type ReportRow = typeof reportsTable.$inferSelect;
