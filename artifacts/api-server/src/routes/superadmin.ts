/**
 * Super Admin Portal routes — all mounted under /api/superadmin
 *
 * Every route here requires isSuperAdmin = true (enforced by requireSuperAdmin
 * middleware in routes/index.ts before this router is mounted).
 *
 * GET  /superadmin/stats                     — fleet-wide KPI aggregates
 * GET  /superadmin/orgs                      — list all organisations with computed stats
 * POST /superadmin/orgs                      — create a new organisation (+ default roles)
 * GET  /superadmin/orgs/:orgId               — org detail (users, alerts, audit log)
 * PATCH /superadmin/orgs/:orgId              — update status / plan tier
 * POST /superadmin/orgs/:orgId/impersonate   — set orgOverride in session cookie
 * DELETE /superadmin/impersonate             — clear orgOverride from session cookie
 */

import { Router, type IRouter } from "express";
import { eq, count, desc, and, inArray, not } from "drizzle-orm";
import {
  db,
  organizationsTable,
  usersTable,
  rolesTable,
  alertsTable,
  workOrdersTable,
  auditLogsTable,
} from "@workspace/db";
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "@workspace/permissions";
import { z } from "zod";
import { SESSION_COOKIE, parseSession, type SessionPayload } from "../middleware/authenticate";
import { getOrgPlants, PLANT_ORG_MAP, plantLivePowerKw, plantHealth } from "../lib/simulation";
import { getRetryWorkerState, triggerRetryWorker } from "../lib/retryWorker";
import { getFtpSchedulerState, triggerFtpScheduler } from "../lib/ftpScheduler";
import { getOfflineDetectionState, triggerOfflineDetection } from "../lib/offlineDetection";
import { mailerEnabled, sendTestEmail } from "../lib/mailer";

const router: IRouter = Router();

// ── CSRF protection ───────────────────────────────────────────────────────────
// State-changing superadmin endpoints require a custom header that browsers
// cannot set cross-origin without a preflight (which CORS would reject).
// GET routes are excluded — they are idempotent and read-only.
router.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  // The frontend sets this header on all fetch calls.
  const csrf = req.headers["x-scada-request"];
  if (!csrf) {
    res.status(403).json({ error: "forbidden", message: "Missing required request header" });
    return;
  }
  next();
});

// ── Session helpers ───────────────────────────────────────────────────────────

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sessionCookieOptions() {
  return {
    signed: true,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Seed 4 default roles for a newly-created organisation. */
async function seedOrgRoles(orgId: string) {
  const roleEntries = [
    { id: `${orgId}-role-admin`,       name: "Administrator",            description: "Full access" },
    { id: `${orgId}-role-operator`,    name: "Control Room Operator",    description: "Monitor and acknowledge alerts" },
    { id: `${orgId}-role-technician`,  name: "O&M Technician",           description: "Maintenance and field ops" },
    { id: `${orgId}-role-viewer`,      name: "Viewer",                   description: "Read-only access" },
  ] as const;

  const permMap: Record<string, readonly string[]> = {
    [`${orgId}-role-admin`]:      DEFAULT_ROLE_PERMISSIONS["role-admin"]      ?? [...PERMISSIONS],
    [`${orgId}-role-operator`]:   DEFAULT_ROLE_PERMISSIONS["role-operator"]   ?? [],
    [`${orgId}-role-technician`]: DEFAULT_ROLE_PERMISSIONS["role-technician"] ?? [],
    [`${orgId}-role-viewer`]:     DEFAULT_ROLE_PERMISSIONS["role-viewer"]     ?? [],
  };

  for (const role of roleEntries) {
    const existing = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.id, role.id))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(rolesTable).values({
        id: role.id,
        orgId,
        name: role.name,
        description: role.description,
        permissions: [...(permMap[role.id] ?? [])],
      });
    }
  }
  return `${orgId}-role-admin`;
}

// ── GET /superadmin/stats ─────────────────────────────────────────────────────

router.get("/superadmin/stats", async (req, res) => {
  const now = new Date();

  // Org counts
  const [{ total: totalOrgs }] = await db
    .select({ total: count() })
    .from(organizationsTable);

  const [{ active: activeOrgs }] = await db
    .select({ active: count() })
    .from(organizationsTable)
    .where(eq(organizationsTable.status, "active")) as [{ active: number }];

  // Plant stats from simulation
  const allPlants = getOrgPlants(null);
  const totalPlants = allPlants.length;
  const fleetPowerKw = allPlants.reduce(
    (sum, p) => sum + plantLivePowerKw(p, now),
    0,
  );

  // Active alert counts by severity
  const ACTIVE_STATUSES = ["open", "acknowledged", "assigned"] as const;
  const alertRows = await db
    .select({ severity: alertsTable.severity })
    .from(alertsTable)
    .where(inArray(alertsTable.status, [...ACTIVE_STATUSES]));

  const alertsBySeverity: Record<string, number> = {
    critical: 0,
    major: 0,
    minor: 0,
    informational: 0,
  };
  for (const row of alertRows) {
    if (row.severity in alertsBySeverity) alertsBySeverity[row.severity]++;
  }

  // Active work orders
  const [{ activeWO }] = await db
    .select({ activeWO: count() })
    .from(workOrdersTable)
    .where(not(inArray(workOrdersTable.status, ["closed", "verified"]))) as [{ activeWO: number }];

  // Total users
  const [{ totalUsers }] = await db
    .select({ totalUsers: count() })
    .from(usersTable) as [{ totalUsers: number }];

  res.json({
    totalOrgs,
    activeOrgs,
    totalPlants,
    fleetPowerMw: Math.round(fleetPowerKw / 10) / 100,
    alerts: alertsBySeverity,
    activeWorkOrders: activeWO,
    totalUsers,
  });
});

// ── GET /superadmin/orgs ──────────────────────────────────────────────────────

router.get("/superadmin/orgs", async (req, res) => {
  const now = new Date();

  const orgs = await db
    .select()
    .from(organizationsTable)
    .orderBy(desc(organizationsTable.createdAt));

  // Augment with stats
  const results = await Promise.all(
    orgs.map(async (org) => {
      const [{ userCount }] = await db
        .select({ userCount: count() })
        .from(usersTable)
        .where(eq(usersTable.orgId, org.id)) as [{ userCount: number }];

      const plants = getOrgPlants(org.id);
      const plantCount = plants.length;
      const powerKw = plants.reduce((s, p) => s + plantLivePowerKw(p, now), 0);

      // Worst health across plants for this org
      const healths = plants.map((p) => plantHealth(p, now));
      const rank: Record<string, number> = { normal: 0, warning: 1, fault: 2, offline: 3 };
      const worstHealth = healths.reduce(
        (w, h) => (rank[h] ?? 0) > (rank[w] ?? 0) ? h : w,
        "normal" as string,
      );

      const ACTIVE_STATUSES = ["open", "acknowledged", "assigned"] as const;
      const [{ alertCount }] = await db
        .select({ alertCount: count() })
        .from(alertsTable)
        .where(and(
          eq(alertsTable.orgId, org.id),
          inArray(alertsTable.status, [...ACTIVE_STATUSES]),
        )) as [{ alertCount: number }];

      return {
        ...org,
        userCount,
        plantCount,
        powerMw: Math.round(powerKw / 10) / 100,
        worstHealth,
        activeAlerts: alertCount,
      };
    }),
  );

  res.json(results);
});

// ── POST /superadmin/orgs ─────────────────────────────────────────────────────

const CreateOrgBody = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  planTier: z.enum(["starter", "professional", "enterprise"]).default("starter"),
  adminName: z.string().min(2).max(100).optional(),
  adminEmail: z.string().email().optional(),
});

router.post("/superadmin/orgs", async (req, res) => {
  const body = CreateOrgBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_request", issues: body.error.issues });
    return;
  }

  const { name, slug, planTier, adminName, adminEmail } = body.data;

  // Check slug uniqueness
  const [existing] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, slug))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "conflict", message: `Slug '${slug}' is already in use` });
    return;
  }

  const orgId = `org-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const now = new Date();

  await db.insert(organizationsTable).values({
    id: orgId,
    name,
    slug,
    planTier,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  // Seed default roles for the new org
  const adminRoleId = await seedOrgRoles(orgId);

  // Optionally create the initial admin user
  let initialUser = null;
  if (adminName && adminEmail) {
    const userId = `user-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await db.insert(usersTable).values({
      id: userId,
      orgId,
      name: adminName,
      email: adminEmail.toLowerCase(),
      roleId: adminRoleId,
      plantIds: [],
      status: "invited",
      createdAt: now,
    });
    initialUser = { id: userId, email: adminEmail, name: adminName };
  }

  req.log.info({ orgId, slug }, "Super admin created org");

  res.status(201).json({
    id: orgId,
    name,
    slug,
    planTier,
    status: "active",
    createdAt: now,
    initialUser,
  });
});

// ── GET /superadmin/orgs/:orgId ───────────────────────────────────────────────

router.get("/superadmin/orgs/:orgId", async (req, res) => {
  const orgId = (req.params["orgId"] as string) ?? "";

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  if (!org) {
    res.status(404).json({ error: "not_found", message: "Organisation not found" });
    return;
  }

  // Users in this org with their role names
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      status: usersTable.status,
      roleId: usersTable.roleId,
      roleName: rolesTable.name,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(eq(usersTable.orgId, orgId))
    .orderBy(desc(usersTable.createdAt));

  // Plants for this org
  const plants = getOrgPlants(orgId).map((p) => ({
    id: p.id,
    name: p.name,
    capacityMw: p.capacityMw,
    inverterCount: p.inverterCount,
  }));

  // Active alert summary
  const ACTIVE_STATUSES = ["open", "acknowledged", "assigned"] as const;
  const alertRows = await db
    .select({ severity: alertsTable.severity, status: alertsTable.status })
    .from(alertsTable)
    .where(and(
      eq(alertsTable.orgId, orgId),
      inArray(alertsTable.status, [...ACTIVE_STATUSES]),
    ));

  const alertSummary = { critical: 0, major: 0, minor: 0, informational: 0, total: 0 };
  for (const row of alertRows) {
    if (row.severity in alertSummary) alertSummary[row.severity as keyof typeof alertSummary]++;
    alertSummary.total++;
  }

  // Recent audit log entries
  const auditLog = await db
    .select({
      id: auditLogsTable.id,
      userId: auditLogsTable.userId,
      action: auditLogsTable.action,
      resourceType: auditLogsTable.resourceType,
      resourceId: auditLogsTable.resourceId,
      createdAt: auditLogsTable.createdAt,
    })
    .from(auditLogsTable)
    .where(eq(auditLogsTable.orgId, orgId))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(20);

  res.json({ org, users, plants, alertSummary, auditLog });
});

// ── PATCH /superadmin/orgs/:orgId ─────────────────────────────────────────────

const UpdateOrgBody = z.object({
  status: z.enum(["active", "suspended"]).optional(),
  planTier: z.enum(["starter", "professional", "enterprise"]).optional(),
  name: z.string().min(2).max(100).optional(),
});

router.patch("/superadmin/orgs/:orgId", async (req, res) => {
  const orgId = (req.params["orgId"] as string) ?? "";

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  if (!org) {
    res.status(404).json({ error: "not_found", message: "Organisation not found" });
    return;
  }

  const body = UpdateOrgBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_request", issues: body.error.issues });
    return;
  }

  const updates: Partial<typeof org> = { updatedAt: new Date() };
  if (body.data.status !== undefined) updates.status = body.data.status;
  if (body.data.planTier !== undefined) updates.planTier = body.data.planTier;
  if (body.data.name !== undefined) updates.name = body.data.name;

  const [updated] = await db
    .update(organizationsTable)
    .set(updates)
    .where(eq(organizationsTable.id, orgId))
    .returning();

  req.log.info({ orgId, updates: body.data }, "Super admin updated org");

  res.json(updated);
});

// ── POST /superadmin/orgs/:orgId/impersonate ──────────────────────────────────

router.post("/superadmin/orgs/:orgId/impersonate", async (req, res) => {
  const orgId = (req.params["orgId"] as string) ?? "";

  // Validate the target org exists before persisting it in the session cookie.
  // Without this check an invalid orgOverride would silently scope all queries
  // to a non-existent org, producing confusing empty-tenant behavior.
  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  if (!org) {
    res.status(404).json({ error: "not_found", message: "Organisation not found" });
    return;
  }

  const raw = req.signedCookies?.[SESSION_COOKIE];
  const session = parseSession(raw);
  if (!session) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const newSession: SessionPayload = { ...session, orgOverride: orgId };
  res.cookie(SESSION_COOKIE, JSON.stringify(newSession), sessionCookieOptions());

  req.log.info({ superAdminId: req.user!.id, impersonatingOrg: orgId, orgName: org.name }, "Super admin impersonating org");
  res.json({ ok: true, orgOverride: orgId, orgName: org.name });
});

// ── DELETE /superadmin/impersonate ────────────────────────────────────────────

router.delete("/superadmin/impersonate", (req, res) => {
  const raw = req.signedCookies?.[SESSION_COOKIE];
  const session = parseSession(raw);
  if (!session) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const { orgOverride: _removed, ...rest } = session;
  res.cookie(SESSION_COOKIE, JSON.stringify(rest), sessionCookieOptions());

  req.log.info({ superAdminId: req.user!.id }, "Super admin exited impersonation");
  res.json({ ok: true });
});

// ── In-memory feature flag store ─────────────────────────────────────────────

interface FeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  category: string;
  orgOverrides: Record<string, boolean>;
}

const featureFlags = new Map<string, FeatureFlag>([
  ["ai_insights",            { key: "ai_insights",            description: "AI-powered anomaly detection",    enabled: true,  category: "features", orgOverrides: {} }],
  ["advanced_reporting",     { key: "advanced_reporting",     description: "PDF/CSV report generation",       enabled: true,  category: "features", orgOverrides: {} }],
  ["edge_gateway",           { key: "edge_gateway",           description: "Edge gateway agent support",      enabled: true,  category: "features", orgOverrides: {} }],
  ["maintenance_automation", { key: "maintenance_automation", description: "Auto work order creation",         enabled: false, category: "beta",     orgOverrides: {} }],
  ["multi_site_dashboard",   { key: "multi_site_dashboard",   description: "Cross-site analytics",            enabled: false, category: "beta",     orgOverrides: {} }],
  ["modbus_rtu",             { key: "modbus_rtu",             description: "Modbus RTU driver support",       enabled: true,  category: "drivers",  orgOverrides: {} }],
  ["bacnet",                 { key: "bacnet",                 description: "BACnet/IP driver support",        enabled: true,  category: "drivers",  orgOverrides: {} }],
  ["opcua",                  { key: "opcua",                  description: "OPC-UA driver support",           enabled: true,  category: "drivers",  orgOverrides: {} }],
]);

router.get("/superadmin/feature-flags", (_req, res) => {
  res.json(Array.from(featureFlags.values()));
});

router.patch("/superadmin/feature-flags/:key", (req, res) => {
  const key = (req.params["key"] as string) ?? "";
  const flag = featureFlags.get(key);
  if (!flag) { res.status(404).json({ error: "not_found" }); return; }
  const { enabled, orgId } = req.body as { enabled?: boolean; orgId?: string };
  if (orgId) {
    if (enabled === undefined) {
      delete flag.orgOverrides[orgId];
    } else {
      flag.orgOverrides[orgId] = enabled;
    }
  } else if (enabled !== undefined) {
    flag.enabled = enabled;
  }
  req.log.info({ key, enabled, orgId }, "Super admin toggled feature flag");
  res.json(flag);
});

router.delete("/superadmin/feature-flags/:key/org/:orgId", (req, res) => {
  const key   = (req.params["key"]   as string) ?? "";
  const orgId = (req.params["orgId"] as string) ?? "";
  const flag  = featureFlags.get(key);
  if (!flag) { res.status(404).json({ error: "not_found" }); return; }
  delete flag.orgOverrides[orgId];
  res.json(flag);
});

// ── GET /superadmin/system-health ─────────────────────────────────────────────

router.get("/superadmin/system-health", async (_req, res) => {
  const t0 = Date.now();
  let dbConnected = false;
  let dbLatencyMs = -1;
  try {
    const { sql: sqlTag } = await import("drizzle-orm");
    await db.execute(sqlTag`SELECT 1`);
    dbConnected = true;
    dbLatencyMs = Date.now() - t0;
  } catch { dbConnected = false; }

  const mem = process.memoryUsage();
  res.json({
    uptime:      process.uptime(),
    memory:      { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external },
    nodeVersion: process.version,
    platform:    process.platform,
    env:         process.env["NODE_ENV"] ?? "development",
    db:          { connected: dbConnected, latencyMs: dbLatencyMs },
    timestamp:   new Date().toISOString(),
  });
});

// ── GET /superadmin/users ─────────────────────────────────────────────────────

import { ilike, or } from "drizzle-orm";

router.get("/superadmin/users", async (req, res) => {
  const { orgId, status, search } = req.query as Record<string, string>;
  const limit  = Math.min(200, parseInt(req.query["limit"]  as string) || 50);
  const offset = Math.max(0,   parseInt(req.query["offset"] as string) || 0);

  const { usersTable: ut, rolesTable: rt, organizationsTable: ot } = await import("@workspace/db");

  let query = db
    .select({
      id:          ut.id,
      name:        ut.name,
      email:       ut.email,
      status:      ut.status,
      roleId:      ut.roleId,
      roleName:    rt.name,
      orgId:       ut.orgId,
      orgName:     ot.name,
      lastLoginAt: ut.lastLoginAt,
      createdAt:   ut.createdAt,
    })
    .from(ut)
    .leftJoin(rt, eq(ut.roleId, rt.id))
    .leftJoin(ot, eq(ut.orgId, ot.id))
    .$dynamic();

  const conditions = [];
  if (orgId)   conditions.push(eq(ut.orgId, orgId));
  if (status)  conditions.push(eq(ut.status, status as "active" | "invited" | "suspended"));
  if (search)  conditions.push(or(ilike(ut.name, `%${search}%`), ilike(ut.email, `%${search}%`))!);
  if (conditions.length) query = query.where(and(...conditions));

  const rows = await query.orderBy(desc(ut.createdAt)).limit(limit).offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(ut) as [{ total: number }];

  res.json({ users: rows, total });
});

// ── GET /superadmin/audit-logs ────────────────────────────────────────────────

router.get("/superadmin/audit-logs", async (req, res) => {
  const { orgId, userId, action, resourceType } = req.query as Record<string, string>;
  const limit  = Math.min(500, parseInt(req.query["limit"]  as string) || 100);
  const offset = Math.max(0,   parseInt(req.query["offset"] as string) || 0);

  const conditions = [];
  if (orgId)        conditions.push(eq(auditLogsTable.orgId, orgId));
  if (userId)       conditions.push(eq(auditLogsTable.userId, userId));
  if (action)       conditions.push(eq(auditLogsTable.action, action));
  if (resourceType) conditions.push(eq(auditLogsTable.resourceType, resourceType));

  const rows = await db
    .select({
      id:           auditLogsTable.id,
      orgId:        auditLogsTable.orgId,
      userId:       auditLogsTable.userId,
      actorName:    usersTable.name,
      actorEmail:   usersTable.email,
      action:       auditLogsTable.action,
      resourceType: auditLogsTable.resourceType,
      resourceId:   auditLogsTable.resourceId,
      metadata:     auditLogsTable.metadata,
      createdAt:    auditLogsTable.createdAt,
    })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(auditLogsTable) as [{ total: number }];

  res.json({ logs: rows, total });
});

// ── GET /superadmin/billing ───────────────────────────────────────────────────

router.get("/superadmin/billing", async (_req, res) => {
  const MRR: Record<string, number> = { starter: 99, professional: 299, enterprise: 999 };
  const orgs = await db
    .select({
      id:        organizationsTable.id,
      name:      organizationsTable.name,
      slug:      organizationsTable.slug,
      planTier:  organizationsTable.planTier,
      status:    organizationsTable.status,
      createdAt: organizationsTable.createdAt,
    })
    .from(organizationsTable)
    .orderBy(desc(organizationsTable.createdAt));

  const enriched = await Promise.all(
    orgs.map(async (org) => {
      const [{ userCount }] = await db.select({ userCount: count() }).from(usersTable).where(eq(usersTable.orgId, org.id)) as [{ userCount: number }];
      const plants = getOrgPlants(org.id);
      return { ...org, userCount, plantCount: plants.length, mrr: MRR[org.planTier] ?? 0 };
    })
  );

  const activeOrgs  = enriched.filter((o) => o.status === "active");
  const totalMrr    = activeOrgs.reduce((s, o) => s + o.mrr, 0);
  const byTier      = { starter: 0, professional: 0, enterprise: 0, suspended: 0 };
  for (const o of enriched) {
    if (o.status === "suspended") byTier.suspended++;
    else byTier[o.planTier as keyof typeof byTier] = (byTier[o.planTier as keyof typeof byTier] ?? 0) + 1;
  }

  res.json({ summary: { ...byTier, totalMrr }, orgs: enriched });
});

// ── GET /superadmin/jobs ──────────────────────────────────────────────────────

router.get("/superadmin/jobs", (_req, res) => {
  res.json([
    {
      id: "retry-worker",
      name: "Ingestion Retry Worker",
      description: "Retries failed telemetry writes with exponential back-off (max 2 h).",
      ...getRetryWorkerState(),
    },
    {
      id: "ftp-scheduler",
      name: "FTP / SFTP Scheduler",
      description: "Polls configured FTP and SFTP sources every minute for new data files.",
      ...getFtpSchedulerState(),
    },
    {
      id: "offline-detection",
      name: "Offline Detection Sweep",
      description: "Marks devices offline when silent beyond 3× their polling interval (60 s sweep).",
      ...getOfflineDetectionState(),
    },
  ]);
});

// ── POST /superadmin/jobs/:jobId/trigger ──────────────────────────────────────

router.post("/superadmin/jobs/:jobId/trigger", (req, res) => {
  const jobId = (req.params["jobId"] as string) ?? "";
  switch (jobId) {
    case "retry-worker":      triggerRetryWorker();      break;
    case "ftp-scheduler":     triggerFtpScheduler();     break;
    case "offline-detection": triggerOfflineDetection(); break;
    default:
      res.status(404).json({ error: "not_found", message: `Unknown job: ${jobId}` });
      return;
  }
  req.log.info({ jobId }, "Super admin triggered job manually");
  res.json({ ok: true, jobId, triggeredAt: new Date().toISOString() });
});

// ── GET/PATCH /superadmin/system-config ───────────────────────────────────────

interface SystemConfig {
  security: {
    sessionTimeoutDays: number;
    maxFailedLogins: number;
    accountLockoutMinutes: number;
    mfaRequired: boolean;
    captchaEnabled: boolean;
  };
  rateLimits: {
    maxRequestsPerMinute: number;
    maxLoginAttemptsPerHour: number;
  };
  ipWhitelist: string[];
}

const _systemConfig: SystemConfig = {
  security: {
    sessionTimeoutDays: 7,
    maxFailedLogins: 5,
    accountLockoutMinutes: 30,
    mfaRequired: false,
    captchaEnabled: false,
  },
  rateLimits: {
    maxRequestsPerMinute: 200,
    maxLoginAttemptsPerHour: 10,
  },
  ipWhitelist: [],
};

router.get("/superadmin/system-config", (_req, res) => {
  res.json({
    ..._systemConfig,
    smtp: {
      host:    process.env["SMTP_HOST"]?.trim() ?? null,
      port:    process.env["SMTP_PORT"]?.trim() ?? null,
      from:    process.env["SMTP_FROM"]?.trim() ?? null,
      user:    process.env["SMTP_USER"] ? `${process.env["SMTP_USER"].slice(0, 3)}•••` : null,
      enabled: mailerEnabled,
    },
  });
});

router.patch("/superadmin/system-config", (req, res) => {
  const body = req.body as Partial<SystemConfig>;
  if (body.security)    Object.assign(_systemConfig.security,    body.security);
  if (body.rateLimits)  Object.assign(_systemConfig.rateLimits,  body.rateLimits);
  if (Array.isArray(body.ipWhitelist)) _systemConfig.ipWhitelist = body.ipWhitelist;
  req.log.info({ updates: body }, "Super admin updated system config");
  res.json(_systemConfig);
});

// ── POST /superadmin/notifications/test-email ─────────────────────────────────

router.post("/superadmin/notifications/test-email", async (req, res) => {
  const { to } = req.body as { to?: unknown };
  if (typeof to !== "string" || !to.trim()) {
    res.status(400).json({ error: "invalid_body", message: "Email address required." });
    return;
  }
  if (!mailerEnabled) {
    res.status(503).json({ error: "smtp_unavailable", message: "SMTP is not configured. Set SMTP_HOST in server .env." });
    return;
  }
  try {
    await sendTestEmail(to.trim());
    req.log.info({ to }, "Super admin sent test email");
    res.json({ ok: true, sentTo: to.trim() });
  } catch (err) {
    res.status(500).json({ error: "send_failed", message: err instanceof Error ? err.message : "Failed to send" });
  }
});

// ── GET /superadmin/login-history ─────────────────────────────────────────────

const LOGIN_ACTIONS = ["login", "login_failed", "logout", "otp_sent", "otp_verified", "superadmin_login", "impersonation_started"];

router.get("/superadmin/login-history", async (req, res) => {
  const { orgId, action: actionFilter } = req.query as Record<string, string>;
  const limit  = Math.min(500, parseInt(req.query["limit"]  as string) || 100);
  const offset = Math.max(0,   parseInt(req.query["offset"] as string) || 0);

  const conditions: ReturnType<typeof eq>[] = [
    inArray(auditLogsTable.action, LOGIN_ACTIONS) as unknown as ReturnType<typeof eq>,
  ];
  if (orgId)         conditions.push(eq(auditLogsTable.orgId,   orgId));
  if (actionFilter)  conditions.push(eq(auditLogsTable.action,  actionFilter));

  const rows = await db
    .select({
      id:          auditLogsTable.id,
      orgId:       auditLogsTable.orgId,
      userId:      auditLogsTable.userId,
      actorName:   usersTable.name,
      actorEmail:  usersTable.email,
      action:      auditLogsTable.action,
      metadata:    auditLogsTable.metadata,
      createdAt:   auditLogsTable.createdAt,
    })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(auditLogsTable)
    .where(inArray(auditLogsTable.action, LOGIN_ACTIONS)) as [{ total: number }];

  res.json({ logs: rows, total });
});

// ── GET /superadmin/security ──────────────────────────────────────────────────

router.get("/superadmin/security", async (_req, res) => {
  const SECURITY_ACTIONS = ["login", "login_failed", "password_changed", "user_created", "user_deleted", "role_changed", "superadmin_login", "impersonation_started"];

  const events = await db
    .select({
      id:           auditLogsTable.id,
      orgId:        auditLogsTable.orgId,
      userId:       auditLogsTable.userId,
      actorName:    usersTable.name,
      actorEmail:   usersTable.email,
      action:       auditLogsTable.action,
      resourceType: auditLogsTable.resourceType,
      resourceId:   auditLogsTable.resourceId,
      metadata:     auditLogsTable.metadata,
      createdAt:    auditLogsTable.createdAt,
    })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id))
    .where(inArray(auditLogsTable.action, SECURITY_ACTIONS))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(200);

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent   = events.filter((e) => new Date(e.createdAt) >= since24h);

  const summary = {
    failedLogins24h:      recent.filter((e) => e.action === "login_failed").length,
    activeUsers24h:       new Set(recent.filter((e) => e.action === "login").map((e) => e.userId)).size,
    superAdminActions24h: recent.filter((e) => e.action === "superadmin_login" || e.action === "impersonation_started").length,
    total:                events.length,
  };

  res.json({ events, summary });
});

export default router;

