/**
 * Authentication routes — login, logout, and current-user.
 *
 * These routes are mounted BEFORE the global `authenticate` middleware so
 * they are always accessible without a session cookie.
 *
 * POST /auth/login  — verify email + bcrypt password, set signed session cookie
 * POST /auth/logout — clear the session cookie
 * GET  /auth/me     — return the currently signed-in user
 */

import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, rolesTable, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, parseSession, type SessionPayload } from "../middleware/authenticate";

// Pre-computed at module load time (blocking, runs once). Provides a valid
// bcrypt hash so that failed logins (unknown email) spend the same ~100 ms as
// successful ones, preventing timing-based account enumeration.
const TIMING_DUMMY_HASH: string = bcrypt.hashSync("__scada_timing_dummy_v1__", 10);

const router: IRouter = Router();

/** Milliseconds for 7 days — cookie Max-Age */
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

// ── POST /auth/login ─────────────────────────────────────────────────────────

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: unknown; password?: unknown };

  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "invalid_body", message: "email is required" });
    return;
  }
  if (typeof password !== "string" || !password) {
    res.status(400).json({ error: "invalid_body", message: "password is required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.trim().toLowerCase()))
    .limit(1);

  // Constant-time rejection — always run a full bcrypt.compare regardless of
  // whether the user exists. TIMING_DUMMY_HASH is a real, valid bcrypt hash
  // pre-computed at startup so the comparison takes the same ~100 ms whether
  // the email is known or not, preventing timing-based account enumeration.
  const hashToCheck = user?.passwordHash ?? TIMING_DUMMY_HASH;
  const passwordMatches = await bcrypt.compare(password, hashToCheck);

  if (!user || !passwordMatches || !user.passwordHash) {
    res.status(401).json({ error: "invalid_credentials", message: "Incorrect email or password" });
    return;
  }

  if (user.status === "invited") {
    res.status(403).json({ error: "account_pending", message: "Account is pending activation" });
    return;
  }

  // Block login for users whose org has been suspended by the platform admin.
  // Super admins are exempt so they can still access the portal.
  if (!user.isSuperAdmin) {
    const [org] = await db
      .select({ status: organizationsTable.status })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, user.orgId))
      .limit(1);
    if (org?.status === "suspended") {
      res.status(403).json({ error: "org_suspended", message: "Your organisation has been suspended. Contact your platform administrator." });
      return;
    }
  }

  const payload: SessionPayload = {
    userId: user.id,
    orgId: user.orgId,
    roleId: user.roleId,
  };

  res.cookie(SESSION_COOKIE, JSON.stringify(payload), sessionCookieOptions());

  // Update last-login timestamp (fire-and-forget, don't block the response)
  db.update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .catch(() => {/* non-fatal */});

  const [role] = await db
    .select({ name: rolesTable.name })
    .from(rolesTable)
    .where(eq(rolesTable.id, user.roleId))
    .limit(1);

  req.log.info({ userId: user.id, orgId: user.orgId }, "User logged in");

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    orgId: user.orgId,
    roleId: user.roleId,
    roleName: role?.name ?? user.roleId,
    isSuperAdmin: user.isSuperAdmin,
  });
});

// ── POST /auth/logout ────────────────────────────────────────────────────────

router.post("/auth/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

// ── GET /auth/me ─────────────────────────────────────────────────────────────

router.get("/auth/me", async (req, res) => {
  const raw = req.signedCookies?.[SESSION_COOKIE];
  const session = parseSession(raw);

  if (!session) {
    res.status(401).json({ error: "unauthenticated", message: "Not logged in" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.userId))
    .limit(1);

  if (!user || user.orgId !== session.orgId) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(401).json({ error: "unauthenticated", message: "Session expired" });
    return;
  }

  const [role] = await db
    .select({ name: rolesTable.name })
    .from(rolesTable)
    .where(eq(rolesTable.id, user.roleId))
    .limit(1);

  // Fetch permissions separately so the /auth/me select can be updated independently
  const [roleWithPerms] = await db
    .select({ permissions: rolesTable.permissions })
    .from(rolesTable)
    .where(eq(rolesTable.id, user.roleId))
    .limit(1);

  // When a super admin is impersonating an org, include that context so the
  // frontend can show the "Acting as [OrgName]" banner.
  let orgOverride: string | undefined;
  let orgOverrideName: string | undefined;
  if (user.isSuperAdmin && session.orgOverride) {
    const [overrideOrg] = await db
      .select({ id: organizationsTable.id, name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, session.orgOverride))
      .limit(1);
    if (overrideOrg) {
      orgOverride = overrideOrg.id;
      orgOverrideName = overrideOrg.name;
    }
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    orgId: user.orgId,
    roleId: user.roleId,
    roleName: role?.name ?? user.roleId,
    permissions: roleWithPerms?.permissions ?? [],
    plantIds: user.plantIds,
    isSuperAdmin: user.isSuperAdmin,
    orgOverride,
    orgOverrideName,
  });
});

export default router;
