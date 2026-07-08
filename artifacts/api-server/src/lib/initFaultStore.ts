/**
 * Restore persisted faults into the in-memory store on server startup.
 *
 * The function is split into two phases:
 *
 *  CRITICAL (throws on failure):
 *    — load active fault rows from the DB
 *    — restore each into the in-memory store via restoreFaultInMemory()
 *    — re-schedule expiry timers for the remaining duration
 *    — resolve DB alerts for faults that expired while the server was down
 *  If anything in this phase throws, the caller (startServer) receives the
 *  error and does not open the port in an inconsistent state.
 *
 *  BEST-EFFORT (logs errors, never throws):
 *    — prune old expired rows from fault_overrides
 *    — reconcile open "Fault Simulation%" alerts whose fault row no longer exists
 *
 * Intentionally imports from both faultInjection and faultAlerts to avoid
 * creating a circular dependency between those two modules.
 */

import { and, eq, gte, like, lt } from "drizzle-orm";
import { db, faultOverridesTable, alertsTable } from "@workspace/db";
import {
  restoreFaultInMemory,
  attachAlertToFault,
  pruneExpiredFaultRows,
  type FaultTarget,
} from "./faultInjection";
import { resolveFaultAlert } from "./faultAlerts";
import { logger } from "./logger";

export async function initFaultStore(): Promise<void> {
  const now = new Date();

  // ── CRITICAL PHASE — throws on failure ───────────────────────────────────
  // Any DB error here will propagate to startServer(), which will abort startup
  // rather than opening the port with a silently empty fault map.

  // 1a. Find faults that expired during the server's downtime
  const expiredRows = await db
    .select()
    .from(faultOverridesTable)
    .where(lt(faultOverridesTable.expiresAt, now));

  // 1b. Resolve their alerts (fire-and-forget per-row — individual failures are logged)
  for (const row of expiredRows) {
    if (row.alertId) {
      resolveFaultAlert(row.alertId, row.orgId, row.label, "expired").catch((err: unknown) =>
        logger.warn({ err, alertId: row.alertId, key: row.key }, "Failed to resolve expired fault alert on startup"),
      );
    }
  }

  // 2. Load still-active faults
  const activeRows = await db
    .select()
    .from(faultOverridesTable)
    .where(gte(faultOverridesTable.expiresAt, now));

  // 3. Restore each into in-memory store with original timestamps
  for (const row of activeRows) {
    const target = row.targetJson as FaultTarget;
    const injectedAt = row.injectedAt.getTime();
    const expiresAt  = row.expiresAt.getTime();

    // restoreFaultInMemory() uses the exact timestamps from the DB row —
    // it does NOT upsert back to the DB, so expiresAt is never extended.
    restoreFaultInMemory({
      key:      row.key,
      plantId:  row.plantId,
      orgId:    row.orgId,
      target,
      label:    row.label,
      injectedAt,
      expiresAt,
      alertId:  row.alertId ?? undefined,
    });

    // alertId is already set in memory by restoreFaultInMemory() above
    // (it was passed as part of the fault object).  No DB round-trip needed —
    // the row already has the correct alertId persisted.

    // Re-schedule the auto-resolve timer for the remaining duration
    const remainingMs = Math.max(0, expiresAt - Date.now());
    if (row.alertId) {
      const alertId = row.alertId;
      setTimeout(
        () => void resolveFaultAlert(alertId, row.orgId, row.label, "expired"),
        remainingMs + 200,
      );
    }

    logger.info(
      { key: row.key, remainingMs, alertId: row.alertId ?? null },
      "Restored fault from DB",
    );
  }

  logger.info(
    { restored: activeRows.length, expiredHandled: expiredRows.length },
    "Fault store critical restore complete",
  );

  // ── BEST-EFFORT PHASE — errors are caught and logged, never thrown ────────

  // 4. Prune old expired rows (table hygiene)
  pruneExpiredFaultRows();

  // 5. Reconcile orphaned fault-simulation alerts.
  //    If the process crashed between createFaultAlert() and attachAlertToFault(),
  //    the fault row has alertId=null but the alert row is still open.
  //    Find open "Fault Simulation%" alerts with no live fault row pointing at them.
  try {
    const openFaultAlerts = await db
      .select({ id: alertsTable.id, orgId: alertsTable.orgId, title: alertsTable.title })
      .from(alertsTable)
      .where(
        and(
          like(alertsTable.title, "Fault Simulation%"),
          eq(alertsTable.status, "open"),
        ),
      );

    let orphanedResolved = 0;
    for (const alert of openFaultAlerts) {
      const [linkedFault] = await db
        .select({ key: faultOverridesTable.key })
        .from(faultOverridesTable)
        .where(
          and(
            eq(faultOverridesTable.alertId, alert.id),
            gte(faultOverridesTable.expiresAt, now),
          ),
        )
        .limit(1);

      if (!linkedFault) {
        resolveFaultAlert(alert.id, alert.orgId, alert.title, "expired").catch((err: unknown) =>
          logger.warn({ err, alertId: alert.id }, "Failed to resolve orphaned fault alert"),
        );
        orphanedResolved++;
        logger.info({ alertId: alert.id }, "Resolved orphaned fault simulation alert on startup");
      }
    }

    if (orphanedResolved > 0) {
      logger.info({ orphanedResolved }, "Orphaned fault alert reconciliation complete");
    }
  } catch (err) {
    logger.warn({ err }, "Orphaned fault alert reconciliation failed — skipping");
  }
}
