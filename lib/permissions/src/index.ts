/**
 * @workspace/permissions
 *
 * Single source of truth for the RBAC permission strings, display labels,
 * category groupings, and default role→permission mappings.
 * Shared by the API server (enforcement) and the frontend (UI).
 */

// ── Permission constants ───────────────────────────────────────────────────

export const PERMISSIONS = [
  "dashboard.view",
  "plant.view",
  "plant.manage",
  "device.view",
  "device.manage",
  "alarm.view",
  "alarm.acknowledge",
  "alarm.manage",
  "maintenance.view",
  "maintenance.manage",
  "reports.view",
  "reports.export",
  "reports.schedule",
  "analytics.view",
  "users.view",
  "users.manage",
  "settings.view",
  "settings.manage",
  "notifications.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// ── Human-readable labels ─────────────────────────────────────────────────

export const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard.view":        "View dashboard",
  "plant.view":            "View plants",
  "plant.manage":          "Manage plants & fault injection",
  "device.view":           "View devices",
  "device.manage":         "Manage devices",
  "alarm.view":            "View alarms",
  "alarm.acknowledge":     "Acknowledge & resolve alarms",
  "alarm.manage":          "Manage alarm rules & escalations",
  "maintenance.view":      "View work orders",
  "maintenance.manage":    "Create & update work orders",
  "reports.view":          "View reports",
  "reports.export":        "Generate & export reports",
  "reports.schedule":      "Create & manage recurring report schedules",
  "analytics.view":        "View analytics",
  "users.view":            "View users & roles",
  "users.manage":          "Manage users & roles",
  "settings.view":         "View settings",
  "settings.manage":       "Edit org settings",
  "notifications.manage":  "Manage notification rules",
};

// ── Category groupings (for the permission matrix UI) ─────────────────────

export const PERMISSION_CATEGORIES: { label: string; permissions: Permission[] }[] = [
  { label: "Dashboard",      permissions: ["dashboard.view"] },
  { label: "Plants",         permissions: ["plant.view", "plant.manage"] },
  { label: "Devices",        permissions: ["device.view", "device.manage"] },
  { label: "Alarms",         permissions: ["alarm.view", "alarm.acknowledge", "alarm.manage"] },
  { label: "Maintenance",    permissions: ["maintenance.view", "maintenance.manage"] },
  { label: "Reports",        permissions: ["reports.view", "reports.export", "reports.schedule"] },
  { label: "Analytics",      permissions: ["analytics.view"] },
  { label: "Users & Roles",  permissions: ["users.view", "users.manage"] },
  { label: "Settings",       permissions: ["settings.view", "settings.manage"] },
  { label: "Notifications",  permissions: ["notifications.manage"] },
];

// ── Default role permission sets ──────────────────────────────────────────

/** Org Admin: unrestricted access. */
export const ROLE_ADMIN_PERMISSIONS: Permission[] = [...PERMISSIONS];

/** Plant Manager: all operational permissions; cannot manage users/settings/notifications. */
export const ROLE_PLANT_MANAGER_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (p) => !["users.manage", "settings.manage", "notifications.manage"].includes(p),
);

/** SCADA Operator: live monitoring, alarm acknowledge, read-only reporting. */
export const ROLE_SCADA_OPERATOR_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "plant.view",
  "device.view",
  "alarm.view",
  "alarm.acknowledge",
  "maintenance.view",
  "reports.view",
  "analytics.view",
  "users.view",
  "settings.view",
];

/** Maintenance Engineer: field work orders + device access, no user management. */
export const ROLE_MAINTENANCE_ENGINEER_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "plant.view",
  "device.view",
  "device.manage",
  "alarm.view",
  "maintenance.view",
  "maintenance.manage",
  "reports.view",
  "settings.view",
];

/** Read-Only: can view everything, change nothing. */
export const ROLE_READONLY_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "plant.view",
  "device.view",
  "alarm.view",
  "maintenance.view",
  "reports.view",
  "analytics.view",
  "users.view",
  "settings.view",
];

/** Canonical mapping from built-in role IDs to their default permissions. */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  "role-admin":       ROLE_ADMIN_PERMISSIONS,
  "role-operator":    ROLE_SCADA_OPERATOR_PERMISSIONS,
  "role-technician":  ROLE_MAINTENANCE_ENGINEER_PERMISSIONS,
  "role-viewer":      ROLE_READONLY_PERMISSIONS,
};
