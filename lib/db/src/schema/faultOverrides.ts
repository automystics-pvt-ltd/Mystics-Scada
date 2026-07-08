/**
 * Persisted fault-injection state so active simulations survive server restarts.
 *
 * Rows are short-lived (max 300 s by the route's own durationSeconds cap).
 * Expired rows are evicted on startup and during periodic cleanup; they never
 * accumulate beyond a handful of rows per plant.
 */
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const faultOverridesTable = pgTable("fault_overrides", {
  /** Stable key: "<plantId>:plant" or "<plantId>:<inverterId>" */
  key:         text("key").primaryKey(),
  plantId:     text("plant_id").notNull(),
  orgId:       text("org_id").notNull().references(() => organizationsTable.id),
  /** Serialised FaultTarget — { kind: "plant" } | { kind: "inverter"; inverterId: string } */
  targetJson:  jsonb("target_json").notNull(),
  label:       text("label").notNull(),
  injectedAt:  timestamp("injected_at",  { withTimezone: true }).notNull(),
  expiresAt:   timestamp("expires_at",   { withTimezone: true }).notNull(),
  /** Alert row created by Task #18; stored so expiry/resolve can be replayed on restore. */
  alertId:     text("alert_id"),
});

export type FaultOverrideRow = typeof faultOverridesTable.$inferSelect;
