import { and, eq, inArray } from "drizzle-orm";
import { db, alertsTable } from "@workspace/db";

export interface AlertCounts {
  critical: number;
  major: number;
  minor: number;
  informational: number;
}

const ACTIVE_STATUSES = ["open", "acknowledged", "assigned"] as const;

/** Active (not resolved/closed) alert counts by severity, grouped per plant. */
export async function activeAlertCountsByPlant(): Promise<Map<string, AlertCounts>> {
  const rows = await db
    .select({ plantId: alertsTable.plantId, severity: alertsTable.severity })
    .from(alertsTable)
    .where(inArray(alertsTable.status, [...ACTIVE_STATUSES]));

  const map = new Map<string, AlertCounts>();
  for (const row of rows) {
    const counts = map.get(row.plantId) ?? { critical: 0, major: 0, minor: 0, informational: 0 };
    if (row.severity in counts) {
      counts[row.severity as keyof AlertCounts]++;
    }
    map.set(row.plantId, counts);
  }
  return map;
}

export async function activeAlertCountsForPlant(plantId: string): Promise<AlertCounts> {
  const rows = await db
    .select({ severity: alertsTable.severity })
    .from(alertsTable)
    .where(and(eq(alertsTable.plantId, plantId), inArray(alertsTable.status, [...ACTIVE_STATUSES])));

  const counts: AlertCounts = { critical: 0, major: 0, minor: 0, informational: 0 };
  for (const row of rows) {
    if (row.severity in counts) {
      counts[row.severity as keyof AlertCounts]++;
    }
  }
  return counts;
}
