import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const alertsTable = pgTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
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
  },
  (table) => ({
    orgIdIdx: index("alerts_org_id_idx").on(table.orgId),
    orgPlantIdx: index("alerts_org_plant_idx").on(table.orgId, table.plantId),
    orgStatusIdx: index("alerts_org_status_idx").on(table.orgId, table.status),
  }),
);

export const insertAlertSchema = createInsertSchema(alertsTable);
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;

/**
 * Audit trail for individual alert lifecycle transitions.
 * Tenant-scoped via org_id so history rows can never be queried
 * across org boundaries without an explicit join.
 */
export const alertHistoryTable = pgTable(
  "alert_history",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
    alertId: text("alert_id")
      .notNull()
      .references(() => alertsTable.id),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    note: text("note"),
    sortOrder: text("sort_order").notNull(),
  },
  (table) => ({
    orgIdIdx: index("alert_history_org_id_idx").on(table.orgId),
    alertIdIdx: index("alert_history_alert_id_idx").on(table.alertId),
  }),
);

export const insertAlertHistorySchema = createInsertSchema(alertHistoryTable);
export type InsertAlertHistory = z.infer<typeof insertAlertHistorySchema>;
export type AlertHistoryRow = typeof alertHistoryTable.$inferSelect;
