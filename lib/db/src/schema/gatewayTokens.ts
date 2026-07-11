import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

/**
 * Edge Gateway Agent registrations.
 *
 * Each row represents one physical/virtual gateway (Raspberry Pi, industrial
 * PC, or Linux VM) deployed at a plant site. The agent authenticates to the
 * cloud API using the plaintext token; only a SHA-256 hash is ever stored.
 *
 * revokedAt: set when an admin revokes the token — the gateway can no longer
 * authenticate, but the row (and its history) is retained for audit purposes.
 */
export const gatewayTokensTable = pgTable(
  "gateway_tokens",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id),
    name: text("name").notNull(),
    /** SHA-256 hex digest of the plaintext token — plaintext is never persisted. */
    tokenHash: text("token_hash").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdIdx: index("gateway_tokens_org_id_idx").on(table.orgId),
    tokenHashIdx: index("gateway_tokens_token_hash_idx").on(table.tokenHash),
  }),
);

export const insertGatewayTokenSchema = createInsertSchema(gatewayTokensTable);
export type InsertGatewayToken = z.infer<typeof insertGatewayTokenSchema>;
export type GatewayTokenRow = typeof gatewayTokensTable.$inferSelect;
