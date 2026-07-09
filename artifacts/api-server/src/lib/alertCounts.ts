import { and, eq, inArray, type SQL } from "drizzle-orm";
import { db, alertsTable } from "@workspace/db";

export interface AlertCounts {
  critical: number;
  major: number;
  minor: number;
  informational: number;
}

/** Exported so test suites can assert the exact set of statuses that count as "active". */
export const ACTIVE_STATUSES = ["open", "acknowledged", "assigned"] as const;

/** Active (not resolved/closed) alert counts by severity, grouped per plant.
 *  Pass `orgId` to scope to a single organisation; pass `null` for all orgs
 *  (super-admin use). */
export async function activeAlertCountsByPlant(orgId: string | null): Promise<Map<string, AlertCounts>> {
  const conditions: SQL[] = [inArray(alertsTable.status, [...ACTIVE_STATUSES])];
  if (orgId) conditions.push(eq(alertsTable.orgId, orgId));

  const rows = await db
    .select({ plantId: alertsTable.plantId, severity: alertsTable.severity })
    .from(alertsTable)
    .where(and(...conditions));

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
