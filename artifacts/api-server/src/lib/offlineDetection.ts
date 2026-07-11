/**
 * Offline detection job (supersedes the earlier stale-status fix).
 *
 * Runs every 60 s. Any device whose last_seen_at is older than
 * (poll_interval_s * 3) is flagged offline: its `devices.status` transitions
 * to "offline", a `device_offline` major alert is created (deduped — only
 * one open alert per device at a time), and a notification is dispatched.
 *
 * Recovery is driven separately: the driver registry calls
 * `resolveDeviceOfflineAlert()` after every successful read, which is a
 * no-op if there's no open device_offline alert for that device.
 */

import { randomUUID } from "node:crypto";
import { and, eq, ne, notInArray } from "drizzle-orm";
import { db, devicesTable, alertsTable, alertHistoryTable, deviceCommLogsTable } from "@workspace/db";
import { createNotification } from "./createNotification.js";
import { logger } from "./logger.js";

const SWEEP_INTERVAL_MS = 60_000;
const OFFLINE_ALERT_TYPE = "device_offline";
const CLOSED_STATUSES = ["resolved", "closed"] as const;

interface DeviceConfigShape {
  pollingIntervalSec?: number;
}

/**
 * Maps a device's free-form `type` (RTU, PLC, gateway, data_logger, ...) to
 * the alert schema's constrained `deviceType` enum
 * ('plant' | 'inverter' | 'string' | 'weather_station' | 'tracker' | 'grid' |
 * 'transformer' | 'security'). Infra devices without a direct match fall
 * back to 'plant' — the most generic category the alert center supports.
 */
function toAlertDeviceType(deviceType: string): string {
  switch (deviceType) {
    case "inverter": return "inverter";
    case "weather_station": return "weather_station";
    case "tracker_controller": return "tracker";
    case "smart_meter": return "grid";
    default: return "plant";
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the periodic offline-detection sweep. Idempotent. */
export function startOfflineDetectionJob(): void {
  if (timer) return;
  timer = setInterval(() => void sweepOnce().catch((err: unknown) => {
    logger.error({ err }, "Offline detection sweep failed");
  }), SWEEP_INTERVAL_MS);
  // Run an initial sweep shortly after boot too.
  void sweepOnce().catch((err: unknown) => logger.error({ err }, "Offline detection initial sweep failed"));
}

export function stopOfflineDetectionJob(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

async function sweepOnce(): Promise<void> {
  const now = new Date();
  const devices = await db
    .select()
    .from(devicesTable)
    .where(and(ne(devicesTable.status, "offline"), ne(devicesTable.status, "maintenance")));

  for (const device of devices) {
    const cfg = (device.config ?? {}) as DeviceConfigShape;
    const pollIntervalS = cfg.pollingIntervalSec ?? 30;
    const staleAfterMs = pollIntervalS * 3 * 1000;
    const lastSeen = device.lastSeenAt;

    // No lastSeenAt at all means the device has never reported — only flag it
    // if it's been long enough since creation that we'd expect a first reading.
    const referenceTime = lastSeen ?? device.createdAt;
    const staleMs = now.getTime() - referenceTime.getTime();
    if (staleMs <= staleAfterMs) continue;

    await transitionOffline(device.id, device.orgId, device.plantId, device.name, device.type, now);
  }
}

async function transitionOffline(
  deviceId: string,
  orgId: string,
  plantId: string,
  deviceName: string,
  deviceTypeRaw: string,
  now: Date,
): Promise<void> {
  try {
    await db.update(devicesTable).set({ status: "offline", updatedAt: now }).where(eq(devicesTable.id, deviceId));

    await db.insert(deviceCommLogsTable).values({
      id: randomUUID(),
      deviceId,
      eventType: "DISCONNECT",
      message: "Device flagged offline — no successful read within 3x polling interval",
      occurredAt: now,
    });

    // Dedup: only create a new alert if there's no existing open device_offline
    // alert for this exact device. Keyed on deviceId (not deviceName) so two
    // devices sharing a display name never collide.
    const existingOpen = await db
      .select({ id: alertsTable.id })
      .from(alertsTable)
      .where(and(
        eq(alertsTable.orgId, orgId),
        eq(alertsTable.title, OFFLINE_ALERT_TITLE),
        eq(alertsTable.deviceId, deviceId),
        notInArray(alertsTable.status, [...CLOSED_STATUSES]),
      ));
    if (existingOpen.length > 0) return;

    const alertId = randomUUID();
    await db.insert(alertsTable).values({
      id: alertId,
      orgId,
      plantId,
      plantName: plantId,
      deviceType: toAlertDeviceType(deviceTypeRaw),
      deviceName,
      deviceId,
      title: OFFLINE_ALERT_TITLE,
      message: `${deviceName} has not reported a successful read in over 3x its polling interval and has been marked offline.`,
      severity: "major",
      status: "open",
      createdAt: now,
    });

    await db.insert(alertHistoryTable).values({
      id: randomUUID(),
      orgId,
      alertId,
      timestamp: now,
      actor: "Offline Detection Job",
      action: "Alert created — device flagged offline",
      note: `deviceId=${deviceId}`,
      sortOrder: now.getTime().toString(),
    });

    createNotification({
      orgId,
      type: OFFLINE_ALERT_TYPE,
      title: OFFLINE_ALERT_TITLE,
      message: `${deviceName} went offline`,
      resourceType: "device",
      resourceId: deviceId,
      resourceUrl: `/devices/${deviceId}`,
    });

    logger.warn({ deviceId, plantId }, "Device transitioned to offline");
  } catch (err) {
    logger.error({ deviceId, err }, "Failed to transition device offline");
  }
}

const OFFLINE_ALERT_TITLE = "Device Offline";

/**
 * Auto-resolves the open device_offline alert for a device (if any) and logs
 * a device_online recovery event. Safe to call on every successful read —
 * it's a cheap no-op when there's nothing to resolve.
 */
export async function resolveDeviceOfflineAlert(deviceId: string, orgId: string, _deviceName: string): Promise<void> {
  const now = new Date();
  try {
    const [open] = await db
      .select({ id: alertsTable.id })
      .from(alertsTable)
      .where(and(
        eq(alertsTable.orgId, orgId),
        eq(alertsTable.title, OFFLINE_ALERT_TITLE),
        eq(alertsTable.deviceId, deviceId),
        notInArray(alertsTable.status, [...CLOSED_STATUSES]),
      ));
    if (!open) return;

    await db.update(alertsTable).set({ status: "resolved", resolvedAt: now }).where(eq(alertsTable.id, open.id));
    await db.insert(alertHistoryTable).values({
      id: randomUUID(),
      orgId,
      alertId: open.id,
      timestamp: now,
      actor: "Offline Detection Job",
      action: "Auto-resolved: device came back online",
      note: `deviceId=${deviceId}`,
      sortOrder: now.getTime().toString(),
    });

    await db.insert(deviceCommLogsTable).values({
      id: randomUUID(),
      deviceId,
      eventType: "CONNECT",
      message: "Device recovered — device_online",
      occurredAt: now,
    });

    logger.info({ deviceId }, "Device recovered — offline alert auto-resolved");
  } catch (err) {
    logger.warn({ deviceId, err }, "Failed to auto-resolve device offline alert (non-critical)");
  }
}
