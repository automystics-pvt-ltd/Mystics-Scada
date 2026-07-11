import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Device model templates — define the field/register map for a device type once;
 * instantiate as many physical devices from it as needed without code changes.
 *
 * org_id = null  → system library template (visible to all orgs, read-only)
 * org_id = <id>  → org-private custom template
 *
 * protocol: "modbus_tcp" | "modbus_rtu" | "mqtt" | "http" | "websocket" | "opcua" | "bacnet"
 *
 * field_map: FieldDef[]
 *   FieldDef = {
 *     key:        string;   // camelCase param key, e.g. "acPowerKw"
 *     label:      string;   // display label, e.g. "AC Power"
 *     unit:       string;   // e.g. "kW"
 *     // Modbus-specific:
 *     address?:   number;   // Holding register start address
 *     length?:    number;   // Number of 16-bit registers (1 or 2)
 *     dataType?:  "INT16" | "UINT16" | "INT32" | "UINT32" | "FLOAT32";
 *     multiplier?: number;  // scale factor (e.g. 0.1 means raw ÷ 10)
 *     offset?:    number;   // additive offset after scaling
 *     // MQTT / HTTP / WS-specific:
 *     jsonPath?:  string;   // JSONPath expression, e.g. "$.data.power"
 *   }
 */
export const deviceTemplatesTable = pgTable(
  "device_templates",
  {
    id: text("id").primaryKey(),
    /** null = system library; set = org-private */
    orgId: text("org_id"),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    /** modbus_tcp | modbus_rtu | mqtt | http | websocket */
    protocol: text("protocol").notNull(),
    /** Array of FieldDef objects (see JSDoc above) */
    fieldMap: jsonb("field_map").notNull().default([]),
    defaultPollIntervalS: integer("default_poll_interval_s").notNull().default(30),
    /** camelCase key in fieldMap that carries the firmware version string
     *  (Modbus register or JSON path — resolved via the referenced FieldDef) */
    firmwareVersionParam: text("firmware_version_param"),
    /** Latest known-good firmware version for this device model, used to badge outdated devices. */
    latestFirmwareVersion: text("latest_firmware_version"),
    /** active | deprecated */
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("device_templates_org_idx").on(table.orgId),
    protocolIdx: index("device_templates_protocol_idx").on(table.protocol),
  }),
);

export type DeviceTemplateRow = typeof deviceTemplatesTable.$inferSelect;
