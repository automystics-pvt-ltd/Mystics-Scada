import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

/**
 * Immutable audit trail — one row per write action taken by any actor.
 * Written by API middleware; never updated or deleted.
 */
export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
    /** User who performed the action (null = system/background job). */
    userId: text("user_id"),
    /** Verb-style action name, e.g. "alert.acknowledge", "work_order.create". */
    action: text("action").notNull(),
    /** Table or domain entity being acted on, e.g. "alert", "work_order". */
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    /** Additional context (request body diff, previous values, etc.). */
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("audit_logs_org_id_idx").on(table.orgId),
    orgCreatedIdx: index("audit_logs_org_created_idx").on(table.orgId, table.createdAt),
    resourceIdx: index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
  }),
);

export const insertAuditLogSchema = createInsertSchema(auditLogsTable);
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLogRow = typeof auditLogsTable.$inferSelect;

/**
 * Per-org notification channel configuration.
 * Primary key is (org_id, channel) — one config row per channel per org.
 *
 * channel: "email" | "webhook" | "sms" | "slack" | "pagerduty"
 */
export const notificationConfigsTable = pgTable(
  "notification_configs",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
    /** Delivery channel identifier. */
    channel: text("channel").notNull(),
    /**
     * JSONB blob containing channel-specific settings and alert-routing rules.
     * Shape varies by channel (e.g. webhook URL, email recipients, severity filter).
     */
    rules: jsonb("rules").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.channel] }),
    orgIdIdx: index("notification_configs_org_id_idx").on(table.orgId),
  }),
);

export const insertNotificationConfigSchema = createInsertSchema(notificationConfigsTable);
export type InsertNotificationConfig = z.infer<typeof insertNotificationConfigSchema>;
export type NotificationConfigRow = typeof notificationConfigsTable.$inferSelect;
