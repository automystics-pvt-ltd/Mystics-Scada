import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Top-level tenant. Every piece of data in the system is scoped to one org.
 *
 * planTier: "starter" | "professional" | "enterprise"
 * status:   "active"  | "suspended"
 */
export const organizationsTable = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** URL-safe unique identifier used in paths and API keys. */
    slug: text("slug").notNull().unique(),
    planTier: text("plan_tier").notNull().default("starter"),
    status: text("status").notNull().default("active"),
    logoUrl: text("logo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: index("organizations_slug_idx").on(table.slug),
    statusIdx: index("organizations_status_idx").on(table.status),
  }),
);

export const insertOrganizationSchema = createInsertSchema(organizationsTable);
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type OrganizationRow = typeof organizationsTable.$inferSelect;
