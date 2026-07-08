import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const workOrdersTable = pgTable(
  "work_orders",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
    plantId: text("plant_id").notNull(),
    plantName: text("plant_name").notNull(),
    equipment: text("equipment").notNull(),
    faultDescription: text("fault_description").notNull(),
    priority: text("priority").notNull(),
    status: text("status").notNull(),
    assignedTo: text("assigned_to"),
    sourceAlertId: text("source_alert_id"),
    rootCause: text("root_cause"),
    resolutionNotes: text("resolution_notes"),
    slaBreached: boolean("sla_breached").notNull().default(false),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdIdx: index("work_orders_org_id_idx").on(table.orgId),
    orgPlantIdx: index("work_orders_org_plant_idx").on(table.orgId, table.plantId),
    orgStatusIdx: index("work_orders_org_status_idx").on(table.orgId, table.status),
  }),
);

export const insertWorkOrderSchema = createInsertSchema(workOrdersTable);
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type WorkOrderRow = typeof workOrdersTable.$inferSelect;
