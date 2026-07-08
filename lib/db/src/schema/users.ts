import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const rolesTable = pgTable(
  "roles",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
    name: text("name").notNull(),
    description: text("description").notNull(),
    permissions: text("permissions").array().notNull().default([]),
  },
  (table) => ({
    orgIdIdx: index("roles_org_id_idx").on(table.orgId),
  }),
);

export const insertRoleSchema = createInsertSchema(rolesTable);
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type RoleRow = typeof rolesTable.$inferSelect;

export const usersTable = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    roleId: text("role_id").notNull(),
    plantIds: text("plant_ids").array().notNull().default([]),
    status: text("status").notNull(),
    passwordHash: text("password_hash"),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("users_org_id_idx").on(table.orgId),
    emailIdx: index("users_email_idx").on(table.email),
    orgEmailIdx: index("users_org_email_idx").on(table.orgId, table.email),
  }),
);

export const insertUserSchema = createInsertSchema(usersTable);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserRow = typeof usersTable.$inferSelect;
