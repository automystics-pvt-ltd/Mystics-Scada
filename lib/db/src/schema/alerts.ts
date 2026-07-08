import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alertsTable = pgTable("alerts", {
  id: text("id").primaryKey(),
  plantId: text("plant_id").notNull(),
  plantName: text("plant_name").notNull(),
  deviceType: text("device_type").notNull(),
  deviceName: text("device_name").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull(),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const insertAlertSchema = createInsertSchema(alertsTable);
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;

export const alertHistoryTable = pgTable("alert_history", {
  id: text("id").primaryKey(),
  alertId: text("alert_id").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  note: text("note"),
  sortOrder: text("sort_order").notNull(),
});

export const insertAlertHistorySchema = createInsertSchema(alertHistoryTable);
export type InsertAlertHistory = z.infer<typeof insertAlertHistorySchema>;
export type AlertHistoryRow = typeof alertHistoryTable.$inferSelect;
