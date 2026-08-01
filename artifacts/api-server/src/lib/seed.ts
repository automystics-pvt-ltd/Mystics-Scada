import bcrypt from "bcryptjs";
import {
  db,
  organizationsTable,
  usersTable,
  rolesTable,
  devicesTable,
  deviceTemplatesTable,
  plantsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  alertsTable,
  alertHistoryTable,
  workOrdersTable,
} from "@workspace/db";
import { SYSTEM_TEMPLATES } from "./systemTemplates";
import { logger } from "./logger";
import { DEFAULT_ROLE_PERMISSIONS } from "@workspace/permissions";

// ── Organization ─────────────────────────────────────────────────────────────

const ORG_SEED = [
  {
    id: "org-1",
    name: "Automystics",
    slug: "automystics",
    planTier: "enterprise",
    status: "active",
    logoUrl: null,
  },
] as const;

// ── Roles (org-1) ─────────────────────────────────────────────────────────────

const ROLE_SEED = [
  {
    id: "role-admin",
    orgId: "org-1",
    name: "Administrator",
    description: "Full access to all plants, settings, and user management.",
    permissions: DEFAULT_ROLE_PERMISSIONS["role-admin"]!,
  },
  {
    id: "role-operator",
    orgId: "org-1",
    name: "Control Room Operator",
    description: "Monitors live telemetry, acknowledges alerts, and raises work orders.",
    permissions: DEFAULT_ROLE_PERMISSIONS["role-operator"]!,
  },
  {
    id: "role-technician",
    orgId: "org-1",
    name: "O&M Technician",
    description: "Executes and closes out maintenance work orders in the field.",
    permissions: DEFAULT_ROLE_PERMISSIONS["role-technician"]!,
  },
  {
    id: "role-viewer",
    orgId: "org-1",
    name: "Viewer",
    description: "Read-only access to dashboards and reports.",
    permissions: DEFAULT_ROLE_PERMISSIONS["role-viewer"]!,
  },
];

// ── Real device seed ──────────────────────────────────────────────────────────

function buildDeviceSeed(): (typeof devicesTable.$inferInsert)[] {
  const now = new Date();
  return [
    // ── plant-ana — real TRB246 inverter (MQTT, name-value mode) ────────────
    {
      id: "dev-ana-inv-01", orgId: "org-1", plantId: "plant-ana",
      name: "Ana Inverter (TRB246)", type: "inverter", protocol: "mqtt",
      status: "online", firmwareVersion: "TRB2M_R_00.07.22.1",
      config: {
        brokerUrl: "mqtt://76.13.4.214:1883",
        topic: "trn246/modbus",
        mqttUsername: "automystics",
        mqttPassword: "automystics",
        payloadMode: "name-value",
        nameKeyPath: "$.Automystics.name",
        nameValuePath: "$.Automystics.data",
        pollingIntervalSec: 60,
        fieldMap: [
          // ── AC grid measurements ────────────────────────────────────────────
          // Raw register values are in 0.1× units (e.g. 7920 → 792.0 V, 748 → 74.8 A)
          { key: "acVoltageV",        registerName: "phaseABvoltage",      label: "AC Voltage (AB)",    unit: "V",   multiplier: 0.1 },
          { key: "acVoltageBcV",      registerName: "phaseBCvoltage",      label: "AC Voltage (BC)",    unit: "V",   multiplier: 0.1 },
          { key: "acVoltageCaV",      registerName: "phaseCAvoltage",      label: "AC Voltage (CA)",    unit: "V",   multiplier: 0.1 },
          { key: "acCurrentA",        registerName: "Acurrent",            label: "AC Current (A)",     unit: "A",   multiplier: 0.1 },
          { key: "acCurrentBA",       registerName: "Bcurrent",            label: "AC Current (B)",     unit: "A",   multiplier: 0.1 },
          { key: "acCurrentCA",       registerName: "Ccurrent",            label: "AC Current (C)",     unit: "A",   multiplier: 0.1 },
          { key: "powerFactor",       registerName: "pf",                  label: "Power Factor",       unit: "",    multiplier: 0.001 },
          { key: "frequencyHz",       registerName: "frq",                 label: "Frequency",          unit: "Hz",  multiplier: 0.1 },
          // ── Thermal ────────────────────────────────────────────────────────
          // Raw value IS degrees Celsius (e.g. 64 → 64 °C); multiplier = 1
          { key: "temperatureC",      registerName: "internaltemperature", label: "Internal Temp",      unit: "°C",  multiplier: 1 },
          // ── Energy meters ──────────────────────────────────────────────────
          { key: "energyTodayKwh",    registerName: "dailyeneregykwh",     label: "Daily Energy",       unit: "kWh", multiplier: 0.1 },
          { key: "energyLifetimeMwh", registerName: "totalenergy",         label: "Total Energy",       unit: "MWh", multiplier: 0.000001 },
          // ── Active power (direct register reading) ─────────────────────────
          // The TRB246 encodes the 32-bit Modbus FLOAT32 as a decimal integer.
          // Re-interpret those bits as IEEE 754 big-endian float → kW.
          // The *derived* acPowerKw (from V×I×PF) is also computed automatically
          // and is more reliable; actPowerKw is kept for cross-check.
          { key: "actPowerKw",        registerName: "actpow",              label: "Active Power",       unit: "kW",  multiplier: 1, encoding: "ieee754_be" },
          // ── Alarms & faults ────────────────────────────────────────────────
          { key: "faultCode",         registerName: "faultcode",           label: "Fault Code",         unit: "",    multiplier: 1 },
          { key: "faultAlarm",        registerName: "faultalarm",          label: "Fault Alarm",        unit: "",    multiplier: 1 },
          { key: "alarmCode",         registerName: "alarmcode",           label: "Alarm Code",         unit: "",    multiplier: 1 },
          // ── DC string currents ─────────────────────────────────────────────
          // Raw values are in 0.01 A units (e.g. 831 → 8.31 A per string)
          { key: "string1CurrentA",   registerName: "string1current",      label: "String 1 Current",   unit: "A",   multiplier: 0.01 },
          { key: "string2CurrentA",   registerName: "str2A",               label: "String 2 Current",   unit: "A",   multiplier: 0.01 },
          { key: "string3CurrentA",   registerName: "STR3A",               label: "String 3 Current",   unit: "A",   multiplier: 0.01 },
          { key: "string4CurrentA",   registerName: "STR4A",               label: "String 4 Current",   unit: "A",   multiplier: 0.01 },
          { key: "string5CurrentA",   registerName: "STR5A",               label: "String 5 Current",   unit: "A",   multiplier: 0.01 },
          { key: "string6CurrentA",   registerName: "STR6A",               label: "String 6 Current",   unit: "A",   multiplier: 0.01 },
        ],
      },
      createdAt: now, updatedAt: now,
    },
  ];
}

// ── Demo data cleanup ─────────────────────────────────────────────────────────

const DEMO_PLANT_IDS   = ["plant-thar", "plant-sundarbans", "plant-deccan", "plant-coastal"];
const DEMO_DEVICE_IDS  = [
  "dev-thar-rtu-01", "dev-thar-plc-01", "dev-thar-wx-01", "dev-thar-gw-01", "dev-thar-meter-01",
  "dev-sun-rtu-01",  "dev-sun-logger-01", "dev-sun-wx-01", "dev-sun-gw-01",
  "dev-dec-rtu-01",  "dev-dec-wx-01",    "dev-dec-meter-01",
  "dev-cst-rtu-01",  "dev-cst-plc-01",   "dev-cst-wx-01", "dev-cst-tracker-01", "dev-cst-gw-01",
];
const DEMO_USER_IDS    = ["user-1", "user-2", "user-3", "user-4", "user-5", "user-6", "user-admin"];
const DEMO_ORG_IDS     = ["org-2"];

async function cleanupDemoData(): Promise<void> {
  // Work orders & alerts reference plants — delete children before parents
  const [woCount] = await db
    .delete(workOrdersTable)
    .where(inArray(workOrdersTable.plantId, DEMO_PLANT_IDS))
    .returning({ id: workOrdersTable.id });

  // Alert history references alerts — delete history first
  const demoAlerts = await db
    .select({ id: alertsTable.id })
    .from(alertsTable)
    .where(inArray(alertsTable.plantId, DEMO_PLANT_IDS));
  if (demoAlerts.length > 0) {
    const ids = demoAlerts.map((a) => a.id);
    await db.delete(alertHistoryTable).where(inArray(alertHistoryTable.alertId, ids));
    await db.delete(alertsTable).where(inArray(alertsTable.id, ids));
  }

  await db.delete(devicesTable).where(inArray(devicesTable.id, DEMO_DEVICE_IDS));
  await db.delete(plantsTable).where(inArray(plantsTable.id, DEMO_PLANT_IDS));
  await db.delete(usersTable).where(inArray(usersTable.id, DEMO_USER_IDS));
  await db.delete(organizationsTable).where(inArray(organizationsTable.id, DEMO_ORG_IDS));

  const removed = (woCount ? 1 : 0) + demoAlerts.length + DEMO_DEVICE_IDS.length + DEMO_PLANT_IDS.length;
  if (removed > 0) {
    logger.info("Removed demo plants, devices, users, alerts and work orders");
  }
}

// ── Main seed entry point ─────────────────────────────────────────────────────

export async function ensureSeedData(): Promise<void> {
  await cleanupDemoData();
  // ── Organization ─────────────────────────────────────────────────────────
  for (const org of ORG_SEED) {
    const [existing] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, org.id))
      .limit(1);
    if (!existing) {
      await db.insert(organizationsTable).values({ ...org });
      logger.info({ orgId: org.id }, "Seeded organization");
    }
  }

  // ── Roles (insert once; migrate permissions format on subsequent starts) ──
  const existingRoles = await db.select().from(rolesTable).limit(1);
  if (existingRoles.length === 0) {
    await db.insert(rolesTable).values(ROLE_SEED);
    logger.info("Seeded roles");
  } else {
    let migrated = 0;
    for (const [roleId, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const [role] = await db
        .select({ permissions: rolesTable.permissions })
        .from(rolesTable)
        .where(eq(rolesTable.id, roleId))
        .limit(1);
      if (role && role.permissions.some((p) => p.includes("_"))) {
        await db
          .update(rolesTable)
          .set({ permissions: [...perms] })
          .where(eq(rolesTable.id, roleId));
        migrated++;
      }
    }
    if (migrated > 0) {
      logger.info({ count: migrated }, "Migrated role permissions to dot-notation format");
    }
  }

  // ── Ana Solar Plant (idempotent) ──────────────────────────────────────────
  const [existingAna] = await db
    .select({ id: plantsTable.id })
    .from(plantsTable)
    .where(eq(plantsTable.id, "plant-ana"))
    .limit(1);
  if (!existingAna) {
    const now2 = new Date();
    await db.insert(plantsTable).values({
      id: "plant-ana",
      orgId: "org-1",
      name: "Ana Solar Plant",
      location: "Tamil Nadu, India",
      capacityMw: 0.2,
      timezoneOffsetHours: 5.5,
      trackerType: "fixed_tilt",
      commissionedYear: 2026,
      inverterCount: 1,
      inverterRatingKw: 200,
      stringsPerInverter: 6,
      weatherStationCount: 0,
      cloudinessSeed: 0.2,
      createdAt: now2,
      updatedAt: now2,
    });
    logger.info("Seeded Ana Solar Plant");
  }

  // ── TRB246 inverter device (always upsert so config stays current) ────────
  {
    const now2 = new Date();
    const [anaDev] = buildDeviceSeed().filter((d) => d.id === "dev-ana-inv-01");
    if (anaDev) {
      await db.insert(devicesTable)
        .values({ ...anaDev, createdAt: now2, updatedAt: now2 })
        .onConflictDoUpdate({
          target: devicesTable.id,
          set: {
            config: anaDev.config,
            name: anaDev.name,
            protocol: anaDev.protocol,
            updatedAt: now2,
          },
        });
      logger.info("Upserted Ana TRB246 inverter device config");
    }
  }

  // ── System device templates (idempotent) ──────────────────────────────────
  const now = new Date();
  for (const t of SYSTEM_TEMPLATES) {
    const [existing] = await db
      .select({ id: deviceTemplatesTable.id })
      .from(deviceTemplatesTable)
      .where(eq(deviceTemplatesTable.id, t.id))
      .limit(1);
    if (!existing) {
      await db.insert(deviceTemplatesTable).values({
        id: t.id,
        orgId: null,
        manufacturer: t.manufacturer,
        model: t.model,
        protocol: t.protocol,
        fieldMap: t.fieldMap,
        defaultPollIntervalS: t.defaultPollIntervalS,
        firmwareVersionParam: t.firmwareVersionParam ?? null,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  logger.info({ count: SYSTEM_TEMPLATES.length }, "System device templates ensured");

  // ── Ensure isSuperAdmin on all known admin emails (ALL environments) ──────
  // adminSession() requires isSuperAdmin=true in the DB.
  const ADMIN_EMAILS = [
    "automystics.com@gmail.com",
    "automystics.ai@gmail.com",
    "anandakumar.mani012@gmail.com",
    "anand02.pm@gmail.com",
  ];
  for (const adminEmail of ADMIN_EMAILS) {
    const [existingForPatch] = await db
      .select({ id: usersTable.id, isSuperAdmin: usersTable.isSuperAdmin })
      .from(usersTable)
      .where(eq(usersTable.email, adminEmail))
      .limit(1);
    if (existingForPatch && !existingForPatch.isSuperAdmin) {
      await db.update(usersTable).set({ isSuperAdmin: true }).where(eq(usersTable.id, existingForPatch.id));
      logger.info({ email: adminEmail }, "Patched isSuperAdmin=true on admin user");
    }
  }

  // ── Seed password for the primary admin account (dev only) ───────────────
  if (process.env.NODE_ENV === "production") {
    logger.info("Skipping dev credential seed (production mode)");
    return;
  }

  const primaryAdminEmail = "automystics.com@gmail.com";
  const [primaryAdmin] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, primaryAdminEmail))
    .limit(1);

  if (primaryAdmin && !primaryAdmin.passwordHash) {
    const passwordHash = await bcrypt.hash("admin1234", 10);
    await db
      .update(usersTable)
      .set({ passwordHash, isSuperAdmin: true })
      .where(eq(usersTable.id, primaryAdmin.id));
    logger.info({ email: primaryAdminEmail }, "Set initial password for primary admin");
  }
}
