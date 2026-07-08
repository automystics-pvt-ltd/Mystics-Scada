import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import bcrypt from "bcryptjs";
import {
  db,
  organizationsTable,
  usersTable,
  rolesTable,
  notificationConfigsTable,
  auditLogsTable,
} from "@workspace/db";
import { requirePermission } from "../middleware/requirePermission";
import { auditLog } from "../lib/auditLog";
import { validateWebhookUrlStructure, SsrfBlockedError } from "../lib/webhookSsrf";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getOrgId(req: Parameters<typeof auditLog>[0]): string {
  return req.user!.orgId;
}

const NOTIFICATION_EVENTS = [
  "alarm.critical",
  "alarm.major",
  "alarm.minor",
  "report.daily",
  "report.weekly",
] as const;

type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

interface EventConfig {
  enabled: boolean;
  email: string;
}

type NotificationRules = Record<NotificationEvent, EventConfig>;

const defaultRules = (): NotificationRules =>
  Object.fromEntries(
    NOTIFICATION_EVENTS.map((e) => [e, { enabled: false, email: "" }]),
  ) as NotificationRules;

// ── GET /org ──────────────────────────────────────────────────────────────────

router.get("/org", requirePermission("settings.view"), async (req, res) => {
  const orgId = getOrgId(req);
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  if (!org) {
    res.status(404).json({ error: "not_found", message: "Organisation not found" });
    return;
  }
  res.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    planTier: org.planTier,
    status: org.status,
    logoUrl: org.logoUrl,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  });
});

// ── PATCH /org ────────────────────────────────────────────────────────────────

const PatchOrgBody = z.object({
  name:    z.string().min(1).max(120).optional(),
  logoUrl: z.string().max(500).optional().nullable(),
});

router.patch("/org", requirePermission("settings.manage"), async (req, res) => {
  const orgId = getOrgId(req);
  const body = PatchOrgBody.parse(req.body);
  if (!body.name && body.logoUrl === undefined) {
    res.status(400).json({ error: "invalid_request", message: "Provide at least one field to update" });
    return;
  }
  const updates: Partial<typeof organizationsTable.$inferInsert> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name;
  if (body.logoUrl !== undefined) updates.logoUrl = body.logoUrl;

  const [updated] = await db
    .update(organizationsTable)
    .set(updates)
    .where(eq(organizationsTable.id, orgId))
    .returning();

  auditLog(req, "org.update", "organisation", orgId, { changes: body });
  req.log.info({ orgId }, "Org profile updated");
  res.json({ id: updated!.id, name: updated!.name, logoUrl: updated!.logoUrl, updatedAt: updated!.updatedAt });
});

// ── GET /org/users ────────────────────────────────────────────────────────────

router.get("/org/users", requirePermission("users.view"), async (req, res) => {
  const orgId = getOrgId(req);
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      roleId: usersTable.roleId,
      plantIds: usersTable.plantIds,
      status: usersTable.status,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
      isSuperAdmin: usersTable.isSuperAdmin,
    })
    .from(usersTable)
    .where(eq(usersTable.orgId, orgId))
    .orderBy(usersTable.name);

  // Resolve role names in one batch
  const roleIds = [...new Set(rows.map((u) => u.roleId))];
  const roleRows = await db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .where(and(...roleIds.map((id) => eq(rolesTable.id, id))));
  const roleMap = Object.fromEntries(roleRows.map((r) => [r.id, r.name]));

  res.json(
    rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roleId: u.roleId,
      roleName: roleMap[u.roleId] ?? u.roleId,
      plantIds: u.plantIds,
      status: u.status,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      isSuperAdmin: u.isSuperAdmin,
    })),
  );
});

// ── POST /org/users/invite ────────────────────────────────────────────────────

const InviteUserBody = z.object({
  name:     z.string().min(1).max(120),
  email:    z.string().email(),
  roleId:   z.string().min(1),
  plantIds: z.array(z.string()).optional().default([]),
  tempPassword: z.string().min(8).optional(),
});

router.post("/org/users/invite", requirePermission("users.manage"), async (req, res) => {
  const orgId = getOrgId(req);
  const body = InviteUserBody.parse(req.body);

  // Verify role belongs to this org
  const [role] = await db
    .select()
    .from(rolesTable)
    .where(and(eq(rolesTable.id, body.roleId), eq(rolesTable.orgId, orgId)))
    .limit(1);
  if (!role) {
    res.status(400).json({ error: "invalid_request", message: "Unknown role for this organisation" });
    return;
  }

  // Email uniqueness within org
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.orgId, orgId), eq(usersTable.email, body.email)))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "conflict", message: "A user with that email already exists in this org" });
    return;
  }

  let passwordHash: string | null = null;
  const generatedTempPassword = body.tempPassword ?? (randomUUID().slice(0, 12) + "!A1");
  passwordHash = bcrypt.hashSync(generatedTempPassword, 10);

  const now = new Date();
  const [created] = await db
    .insert(usersTable)
    .values({
      id: randomUUID(),
      orgId,
      name: body.name,
      email: body.email,
      roleId: body.roleId,
      plantIds: body.plantIds,
      status: "invited",
      passwordHash,
      isSuperAdmin: false,
      lastLoginAt: null,
      createdAt: now,
    })
    .returning();

  auditLog(req, "user.invite", "user", created!.id, { email: body.email, role: role.name });
  req.log.info({ userId: created!.id }, "User invited via org portal");
  res.status(201).json({
    id: created!.id,
    name: created!.name,
    email: created!.email,
    roleId: created!.roleId,
    roleName: role.name,
    status: created!.status,
    tempPassword: generatedTempPassword,
  });
});

// ── PATCH /org/users/:userId ──────────────────────────────────────────────────

const UpdateUserBody = z.object({
  name:     z.string().min(1).max(120).optional(),
  roleId:   z.string().min(1).optional(),
  plantIds: z.array(z.string()).optional(),
  status:   z.enum(["active", "invited", "disabled"]).optional(),
});

router.patch("/org/users/:userId", requirePermission("users.manage"), async (req, res) => {
  const orgId = getOrgId(req);
  const userId = (req.params["userId"] as string) ?? "";
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.orgId, orgId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "not_found", message: "User not found" });
    return;
  }
  // Prevent editing super admins
  if (existing.isSuperAdmin) {
    res.status(403).json({ error: "forbidden", message: "Cannot edit super admin accounts through the org portal" });
    return;
  }

  const body = UpdateUserBody.parse(req.body);

  // Block self-disable: an admin cannot lock themselves out
  if (body.status === "disabled" && existing.id === req.user!.id) {
    res.status(400).json({ error: "invalid_request", message: "You cannot disable your own account" });
    return;
  }
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (body.name) updates.name = body.name;
  if (body.roleId) {
    const [role] = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(and(eq(rolesTable.id, body.roleId), eq(rolesTable.orgId, orgId)))
      .limit(1);
    if (!role) {
      res.status(400).json({ error: "invalid_request", message: "Unknown role" });
      return;
    }
    updates.roleId = body.roleId;
  }
  if (body.plantIds) updates.plantIds = body.plantIds;
  if (body.status) updates.status = body.status;

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  auditLog(req, "user.update", "user", userId, { changes: body });
  req.log.info({ userId }, "User updated via org portal");

  const [role] = await db.select({ name: rolesTable.name }).from(rolesTable).where(eq(rolesTable.id, updated!.roleId)).limit(1);
  res.json({
    id: updated!.id,
    name: updated!.name,
    email: updated!.email,
    roleId: updated!.roleId,
    roleName: role?.name ?? updated!.roleId,
    status: updated!.status,
    plantIds: updated!.plantIds,
    lastLoginAt: updated!.lastLoginAt,
  });
});

// ── DELETE /org/users/:userId (disable) ───────────────────────────────────────

router.delete("/org/users/:userId", requirePermission("users.manage"), async (req, res) => {
  const orgId = getOrgId(req);
  const userId = (req.params["userId"] as string) ?? "";
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.orgId, orgId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "not_found", message: "User not found" });
    return;
  }
  if (existing.isSuperAdmin) {
    res.status(403).json({ error: "forbidden", message: "Cannot disable super admin accounts" });
    return;
  }
  if (existing.id === req.user!.id) {
    res.status(400).json({ error: "invalid_request", message: "You cannot disable your own account" });
    return;
  }

  await db.update(usersTable).set({ status: "disabled" }).where(eq(usersTable.id, userId));
  auditLog(req, "user.disable", "user", userId, { email: existing.email });
  req.log.info({ userId }, "User disabled via org portal");
  res.json({ ok: true, userId, status: "disabled" });
});

// ── GET /org/notifications ────────────────────────────────────────────────────

router.get("/org/notifications", requirePermission("settings.view"), async (req, res) => {
  const orgId = getOrgId(req);
  const [row] = await db
    .select()
    .from(notificationConfigsTable)
    .where(and(eq(notificationConfigsTable.orgId, orgId), eq(notificationConfigsTable.channel, "email")))
    .limit(1);

  const rules: NotificationRules = row
    ? { ...defaultRules(), ...(row.rules as Partial<NotificationRules>) }
    : defaultRules();

  res.json({
    channel: "email",
    events: rules,
    updatedAt: row?.updatedAt ?? null,
  });
});

// ── PUT /org/notifications ────────────────────────────────────────────────────

const EventConfigSchema = z.object({
  enabled: z.boolean(),
  email:   z.string().max(200).optional().default(""),
});

const PutNotificationsBody = z.object({
  events: z.record(z.enum(NOTIFICATION_EVENTS), EventConfigSchema),
});

router.put("/org/notifications", requirePermission("notifications.manage"), async (req, res) => {
  const orgId = getOrgId(req);
  const body = PutNotificationsBody.parse(req.body);
  const now = new Date();

  await db
    .insert(notificationConfigsTable)
    .values({ orgId, channel: "email", rules: body.events as Record<string, unknown>, updatedAt: now })
    .onConflictDoUpdate({
      target: [notificationConfigsTable.orgId, notificationConfigsTable.channel],
      set: { rules: body.events as Record<string, unknown>, updatedAt: now },
    });

  auditLog(req, "notifications.update", "notification_config", `${orgId}:email`, {});
  req.log.info({ orgId }, "Notification config updated");
  res.json({ ok: true, channel: "email", events: body.events, updatedAt: now });
});

// ── GET /org/notifications/webhook ───────────────────────────────────────────

router.get("/org/notifications/webhook", requirePermission("settings.view"), async (req, res) => {
  const orgId = getOrgId(req);
  const [row] = await db
    .select()
    .from(notificationConfigsTable)
    .where(and(eq(notificationConfigsTable.orgId, orgId), eq(notificationConfigsTable.channel, "webhook")))
    .limit(1);

  const config = row?.rules ?? {};
  res.json({
    url: (config as Record<string, unknown>)["url"] ?? "",
    secret: (config as Record<string, unknown>)["secret"] ? "••••••••" : "",
    hasSecret: !!((config as Record<string, unknown>)["secret"]),
    enabledEvents: (config as Record<string, unknown>)["enabledEvents"] ?? ["alarm.critical", "alarm.major"],
    updatedAt: row?.updatedAt ?? null,
  });
});

// ── PUT /org/notifications/webhook ───────────────────────────────────────────

const PutWebhookBody = z.object({
  url:           z.string().url().max(500).or(z.literal("")),
  secret:        z.string().max(200).optional(),
  enabledEvents: z.array(z.string()).optional().default(["alarm.critical", "alarm.major"]),
});

router.put("/org/notifications/webhook", requirePermission("notifications.manage"), async (req, res) => {
  const orgId = getOrgId(req);
  const body = PutWebhookBody.parse(req.body);

  // SSRF guard: validate URL structure before persisting (allows only https,
  // rejects loopback / private ranges / internal hostnames)
  if (body.url) {
    try {
      validateWebhookUrlStructure(body.url);
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        res.status(400).json({ error: "invalid_webhook_url", message: err.message });
        return;
      }
      throw err;
    }
  }
  const now = new Date();

  // If secret is omitted/empty string, keep existing secret (don't overwrite with blank)
  let secretToStore: string | undefined;
  if (body.secret && body.secret !== "••••••••") {
    secretToStore = body.secret;
  } else if (body.secret === undefined || body.secret === "") {
    // Fetch existing secret to preserve it
    const [existing] = await db
      .select()
      .from(notificationConfigsTable)
      .where(and(eq(notificationConfigsTable.orgId, orgId), eq(notificationConfigsTable.channel, "webhook")))
      .limit(1);
    secretToStore = (existing?.rules as Record<string, unknown>)?.["secret"] as string | undefined;
  }

  const rules: Record<string, unknown> = {
    url: body.url,
    enabledEvents: body.enabledEvents,
    ...(secretToStore ? { secret: secretToStore } : {}),
  };

  await db
    .insert(notificationConfigsTable)
    .values({ orgId, channel: "webhook", rules, updatedAt: now })
    .onConflictDoUpdate({
      target: [notificationConfigsTable.orgId, notificationConfigsTable.channel],
      set: { rules, updatedAt: now },
    });

  auditLog(req, "notifications.update", "notification_config", `${orgId}:webhook`, { url: body.url });
  res.json({ ok: true, url: body.url, enabledEvents: body.enabledEvents, updatedAt: now });
});

// ── GET /org/audit-log ────────────────────────────────────────────────────────

router.get("/org/audit-log", requirePermission("settings.view"), async (req, res) => {
  const orgId = getOrgId(req);
  const {
    page = "1",
    limit = "50",
    userId: filterUserId,
    resourceType: filterResourceType,
    from: filterFrom,
    to: filterTo,
    format,
  } = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions: SQL[] = [eq(auditLogsTable.orgId, orgId)];
  if (filterUserId) conditions.push(eq(auditLogsTable.userId, filterUserId));
  if (filterResourceType) conditions.push(eq(auditLogsTable.resourceType, filterResourceType));
  if (filterFrom) conditions.push(gte(auditLogsTable.createdAt, new Date(filterFrom)));
  if (filterTo) conditions.push(lte(auditLogsTable.createdAt, new Date(filterTo)));

  const where = and(...conditions);

  // Fetch users for display names
  const [rows, userRows] = await Promise.all([
    db
      .select()
      .from(auditLogsTable)
      .where(where)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(format === "csv" ? 10000 : limitNum)
      .offset(format === "csv" ? 0 : offset),
    db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.orgId, orgId)),
  ]);

  const userMap = Object.fromEntries(userRows.map((u) => [u.id, `${u.name} <${u.email}>`]));

  if (format === "csv") {
    const header = "Timestamp,User,Action,Resource Type,Resource ID\n";
    const lines = rows.map((r) =>
      [
        r.createdAt.toISOString(),
        `"${(userMap[r.userId ?? ""] ?? r.userId ?? "system").replace(/"/g, '""')}"`,
        r.action,
        r.resourceType,
        r.resourceId,
      ].join(","),
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${orgId}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(header + lines.join("\n"));
    return;
  }

  const data = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: userMap[r.userId ?? ""] ?? r.userId ?? "System",
    action: r.action,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    metadata: r.metadata,
    createdAt: r.createdAt,
  }));

  res.json({ data, page: pageNum, limit: limitNum, hasMore: rows.length === limitNum });
});

export default router;
