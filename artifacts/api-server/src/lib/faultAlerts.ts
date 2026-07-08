/**
 * DB helpers for the alert lifecycle driven by fault injection.
 *
 * Each fault injection creates a `critical` alert row so operators see it in
 * the Alert Center.  The alert auto-resolves when the fault timer fires or
 * when the operator manually clears the fault.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, alertsTable, alertHistoryTable } from "@workspace/db";
import { createNotification } from "./createNotification";
import { logger } from "./logger";
import type { ActiveFault } from "./faultInjection";

/**
 * Write a critical alert row for a newly injected fault.
 * Returns the new alert's ID so it can be stored back on the fault.
 * Fire-and-forget errors are logged; callers should not await failures.
 */
export async function createFaultAlert(
  fault: ActiveFault,
  plantName: string,
): Promise<string> {
  const id = randomUUID();
  const now = new Date();

  const deviceType = fault.target.kind === "plant" ? "plant" : "inverter";
  const deviceName =
    fault.target.kind === "plant"
      ? "All Inverters"
      : `Inverter #${
          fault.target.inverterId.split("-inv-")[1] !== undefined
            ? Number(fault.target.inverterId.split("-inv-")[1]) + 1
            : fault.target.inverterId
        }`;

  const title =
    fault.target.kind === "plant"
      ? "Fault Simulation: Full Plant Grid Disconnect"
      : `Fault Simulation: Inverter Offline`;

  const message =
    `Operator-triggered fault simulation — ${fault.label}. ` +
    `This is a synthetic fault that will auto-clear after the simulation window expires.`;

  try {
    await db.insert(alertsTable).values({
      id,
      orgId: fault.orgId,
      plantId: fault.plantId,
      plantName,
      deviceType,
      deviceName,
      title,
      message,
      severity: "critical",
      status: "open",
      createdAt: now,
    });

    // Write initial history entry
    await db.insert(alertHistoryTable).values({
      id: randomUUID(),
      orgId: fault.orgId,
      alertId: id,
      timestamp: now,
      actor: "Fault Injection System",
      action: "Alert created by fault simulation",
      note: `Fault key: ${fault.key}. Auto-resolves at ${new Date(fault.expiresAt).toISOString()}.`,
      sortOrder: now.getTime().toString(),
    });

    // Notify operators in the bell
    createNotification({
      orgId: fault.orgId,
      type: "alarm.critical",
      title,
      message: `${plantName} — ${deviceName}: ${fault.label}`,
      resourceType: "alert",
      resourceId: id,
      resourceUrl: `/alerts`,
    });

    logger.info({ alertId: id, faultKey: fault.key, plantId: fault.plantId }, "Fault alert created");
  } catch (err) {
    logger.error({ err, faultKey: fault.key }, "Failed to create fault alert");
  }

  return id;
}

/**
 * Resolve a fault alert when its fault is cleared (manually or by expiry).
 * Idempotent — safe to call even if already resolved.
 */
export async function resolveFaultAlert(
  alertId: string,
  orgId: string,
  label: string,
  reason: "expired" | "manual" = "expired",
): Promise<void> {
  const now = new Date();
  try {
    const [existing] = await db
      .select({ id: alertsTable.id, status: alertsTable.status })
      .from(alertsTable)
      .where(eq(alertsTable.id, alertId));

    if (!existing || existing.status === "resolved" || existing.status === "closed") {
      return; // already resolved, nothing to do
    }

    await db
      .update(alertsTable)
      .set({ status: "resolved", resolvedAt: now })
      .where(eq(alertsTable.id, alertId));

    await db.insert(alertHistoryTable).values({
      id: randomUUID(),
      orgId,
      alertId,
      timestamp: now,
      actor: "Fault Injection System",
      action: reason === "expired"
        ? "Auto-resolved: fault simulation window expired"
        : "Resolved: fault manually cleared by operator",
      note: `Fault: ${label}`,
      sortOrder: now.getTime().toString(),
    });

    logger.info({ alertId, reason }, "Fault alert resolved");
  } catch (err) {
    logger.error({ err, alertId }, "Failed to resolve fault alert");
  }
}
