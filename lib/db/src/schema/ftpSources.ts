import { boolean, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { devicesTable } from "./devices";

export const ftpProtocolEnum = pgEnum("ftp_protocol", ["ftp", "ftps", "sftp"]);

/**
 * Configured FTP/SFTP data sources.
 * A scheduler polls each active source according to intervalMinutes
 * and ingests new CSV files as device readings.
 */
export const ftpSourcesTable = pgTable(
  "ftp_sources",
  {
    id:              text("id").primaryKey(),
    orgId:           text("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    /** If set, ingested readings are tagged to this device; otherwise deviceId is extracted from filename/column */
    deviceId:        text("device_id").references(() => devicesTable.id, { onDelete: "set null" }),
    name:            text("name").notNull(),
    host:            text("host").notNull(),
    port:            integer("port").notNull().default(21),
    protocol:        ftpProtocolEnum("protocol").notNull().default("ftp"),
    username:        text("username").notNull(),
    /** Encrypted password — never returned to clients */
    passwordEnc:     text("password_enc").notNull(),
    /** Remote directory path to list for new files */
    remotePath:      text("remote_path").notNull().default("/"),
    /** File glob pattern, e.g. "*.csv" or "export_*.csv" */
    filePattern:     text("file_pattern").notNull().default("*.csv"),
    /** How often to poll, in minutes */
    intervalMinutes: integer("interval_minutes").notNull().default(60),
    active:          boolean("active").notNull().default(true),
    lastPulledAt:    timestamp("last_pulled_at", { withTimezone: true }),
    lastPulledFile:  text("last_pulled_file"),
    lastError:       text("last_error"),
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    orgIdx:    index("ftp_sources_org_idx").on(t.orgId),
    activeIdx: index("ftp_sources_active_idx").on(t.active, t.orgId),
  }),
);

export type FtpSourceRow = typeof ftpSourcesTable.$inferSelect;
