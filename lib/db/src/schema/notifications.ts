import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

/**
 * In-app notification instances — one row per triggered notification event.
 * Separate from notificationConfigsTable (which holds delivery rules/config).
 * Scoped to an org; users within the org all see the same feed.
 */
export const notificationsTable = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
    /** Notification type identifier, e.g. "alarm.critical", "work_order.status". */
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    /** Domain entity that triggered this notification. */
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    /** Optional frontend path the user is taken to on click. */
    resourceUrl: text("resource_url"),
    /** Whether any user in the org has dismissed / read this notification. */
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx:      index("notifications_org_id_idx").on(table.orgId),
    orgReadIdx:    index("notifications_org_read_idx").on(table.orgId, table.isRead),
    orgCreatedIdx: index("notifications_org_created_idx").on(table.orgId, table.createdAt),
  }),
);

export const insertNotificationSchema = createInsertSchema(notificationsTable);
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type NotificationRow = typeof notificationsTable.$inferSelect;
