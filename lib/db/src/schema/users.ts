import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rolesTable = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  permissions: text("permissions").array().notNull().default([]),
});

export const insertRoleSchema = createInsertSchema(rolesTable);
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type RoleRow = typeof rolesTable.$inferSelect;

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  roleId: text("role_id").notNull(),
  plantIds: text("plant_ids").array().notNull().default([]),
  status: text("status").notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserRow = typeof usersTable.$inferSelect;
