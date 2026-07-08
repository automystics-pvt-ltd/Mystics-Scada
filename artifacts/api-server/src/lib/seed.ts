import { randomUUID } from "node:crypto";
import { db, alertsTable, alertHistoryTable, workOrdersTable, usersTable, rolesTable } from "@workspace/db";
import { logger } from "./logger";
import { PLANTS } from "./simulation";

const ROLE_SEED = [
  {
    id: "role-admin",
    name: "Administrator",
    description: "Full access to all plants, settings, and user management.",
    permissions: ["manage_users", "manage_roles", "acknowledge_alerts", "manage_work_orders", "generate_reports", "supervisory_control"],
  },
  {
    id: "role-operator",
    name: "Control Room Operator",
    description: "Monitors live telemetry, acknowledges alerts, and raises work orders.",
    permissions: ["acknowledge_alerts", "manage_work_orders", "generate_reports"],
  },
  {
    id: "role-technician",
    name: "O&M Technician",
    description: "Executes and closes out maintenance work orders in the field.",
    permissions: ["manage_work_orders"],
  },
  {
    id: "role-viewer",
    name: "Viewer",
    description: "Read-only access to dashboards and reports.",
    permissions: ["generate_reports"],
  },
];

const USER_SEED = [
  { id: "user-1", name: "Ananya Rao", email: "ananya.rao@automystics.com", roleId: "role-admin", plantIds: PLANTS.map((p) => p.id), status: "active" },
  { id: "user-2", name: "Vikram Sethi", email: "vikram.sethi@automystics.com", roleId: "role-operator", plantIds: ["plant-thar", "plant-coastal"], status: "active" },
  { id: "user-3", name: "Fatima Sheikh", email: "fatima.sheikh@automystics.com", roleId: "role-operator", plantIds: ["plant-sundarbans", "plant-deccan"], status: "active" },
  { id: "user-4", name: "Rohan Mehta", email: "rohan.mehta@automystics.com", roleId: "role-technician", plantIds: ["plant-thar"], status: "active" },
  { id: "user-5", name: "Priya Nair", email: "priya.nair@automystics.com", roleId: "role-technician", plantIds: ["plant-sundarbans", "plant-coastal"], status: "invited" },
  { id: "user-6", name: "Karan Bose", email: "karan.bose@automystics.com", roleId: "role-viewer", plantIds: PLANTS.map((p) => p.id), status: "active" },
];

function pastDate(minutesAgo: number): Date {
  return new Date(Date.now() - minutesAgo * 60 * 1000);
}

const DEVICE_TYPES = ["inverter", "string", "weather_station", "tracker", "transformer", "plant"] as const;
const SEVERITIES = ["critical", "major", "minor", "informational"] as const;
const STATUSES = ["open", "acknowledged", "assigned", "resolved", "closed"] as const;

function buildAlertSeed() {
  const alerts: (typeof alertsTable.$inferInsert)[] = [];
  const history: (typeof alertHistoryTable.$inferInsert)[] = [];

  let n = 0;
  for (const plant of PLANTS) {
    const alertCount = plant.id === "plant-thar" ? 6 : 4;
    for (let i = 0; i < alertCount; i++) {
      n++;
      const id = `alert-${n}`;
      const deviceType = DEVICE_TYPES[n % DEVICE_TYPES.length]!;
      const severity = SEVERITIES[(n * 3) % SEVERITIES.length]!;
      const status = STATUSES[n % 3]! as (typeof STATUSES)[number];
      const invIdx = n % plant.inverterCount;
      const deviceName = deviceType === "inverter" ? `Inverter ${invIdx + 1}` : deviceType === "plant" ? plant.name : `${deviceType.replace("_", " ")} ${invIdx + 1}`;
      const titles: Record<string, string> = {
        inverter: "Inverter efficiency below threshold",
        string: "String current deviation detected",
        weather_station: "Weather station data gap",
        tracker: "Tracker position error",
        transformer: "Transformer temperature high",
        plant: "Grid export limit approaching",
      };
      const createdAt = pastDate(30 + n * 47);

      alerts.push({
        id,
        plantId: plant.id,
        plantName: plant.name,
        deviceType,
        deviceName,
        title: titles[deviceType] ?? "Anomaly detected",
        message: `${titles[deviceType] ?? "Anomaly detected"} on ${deviceName} at ${plant.name}.`,
        severity,
        status,
        assignedTo: status === "assigned" ? "Rohan Mehta" : null,
        createdAt,
        acknowledgedAt: status !== "open" ? pastDate(30 + n * 47 - 5) : null,
        resolvedAt: status === "resolved" || status === "closed" ? pastDate(30 + n * 47 - 20) : null,
      });

      history.push({
        id: randomUUID(),
        alertId: id,
        timestamp: createdAt,
        actor: "System",
        action: "Alert raised",
        note: null,
        sortOrder: "0",
      });
      if (status !== "open") {
        history.push({
          id: randomUUID(),
          alertId: id,
          timestamp: pastDate(30 + n * 47 - 5),
          actor: "Vikram Sethi",
          action: "Acknowledged",
          note: null,
          sortOrder: "1",
        });
      }
      if (status === "resolved" || status === "closed") {
        history.push({
          id: randomUUID(),
          alertId: id,
          timestamp: pastDate(30 + n * 47 - 20),
          actor: "Rohan Mehta",
          action: "Resolved",
          note: "Verified in the field, reading back to normal.",
          sortOrder: "2",
        });
      }
    }
  }
  return { alerts, history };
}

function buildWorkOrderSeed() {
  const orders: (typeof workOrdersTable.$inferInsert)[] = [];
  const priorities = ["low", "medium", "high", "critical"] as const;
  const statuses = ["open", "assigned", "in_progress", "resolved", "verified", "closed"] as const;
  let n = 0;
  for (const plant of PLANTS.slice(0, 3)) {
    for (let i = 0; i < 3; i++) {
      n++;
      const status = statuses[n % statuses.length]!;
      const dueAt = pastDate(-60 * 24 * (n % 5));
      orders.push({
        id: `wo-${n}`,
        plantId: plant.id,
        plantName: plant.name,
        equipment: `Inverter ${(n % plant.inverterCount) + 1}`,
        faultDescription: "DC ground fault reported, isolation resistance below limit.",
        priority: priorities[n % priorities.length]!,
        status,
        assignedTo: status === "open" ? null : "Priya Nair",
        sourceAlertId: null,
        rootCause: status === "resolved" || status === "verified" || status === "closed" ? "Cable insulation damage from rodent activity." : null,
        resolutionNotes: status === "verified" || status === "closed" ? "Replaced damaged cable section and re-tested insulation resistance." : null,
        slaBreached: dueAt.getTime() < Date.now() && status !== "closed" && status !== "verified",
        dueAt,
        createdAt: pastDate(60 * 24 + n * 200),
        updatedAt: pastDate(n * 40),
        closedAt: status === "closed" ? pastDate(n * 10) : null,
      });
    }
  }
  return orders;
}

export async function ensureSeedData(): Promise<void> {
  const existingUsers = await db.select().from(usersTable).limit(1);
  if (existingUsers.length === 0) {
    await db.insert(rolesTable).values(ROLE_SEED);
    await db.insert(usersTable).values(
      USER_SEED.map((u) => ({ ...u, lastLoginAt: pastDate(Math.random() * 1000) })),
    );
    logger.info("Seeded roles and users");
  }

  const existingAlerts = await db.select().from(alertsTable).limit(1);
  if (existingAlerts.length === 0) {
    const { alerts, history } = buildAlertSeed();
    await db.insert(alertsTable).values(alerts);
    await db.insert(alertHistoryTable).values(history);
    logger.info({ count: alerts.length }, "Seeded alerts");
  }

  const existingWorkOrders = await db.select().from(workOrdersTable).limit(1);
  if (existingWorkOrders.length === 0) {
    const orders = buildWorkOrderSeed();
    await db.insert(workOrdersTable).values(orders);
    logger.info({ count: orders.length }, "Seeded work orders");
  }
}
