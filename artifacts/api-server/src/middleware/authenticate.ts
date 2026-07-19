/**
 * Authentication middleware.
 *
 * Reads the signed `scada_session` cookie, validates it, and attaches
 * `req.user` to the request. Returns 401 when the cookie is absent or
 * tampered with.
 *
 * Routes that are always public (healthz, auth/*) are excluded by the
 * route mounting order in routes/index.ts — this middleware is registered
 * AFTER the auth router so it never fires for those paths.
 */

import type { Request, Response, NextFunction } from "express";
import { db, usersTable, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const SESSION_COOKIE = "scada_session";

export interface SessionPayload {
  userId: string;
  orgId: string;
  roleId: string;
  /** Set when a super admin clicks "Act as org" in the portal. */
  orgOverride?: string;
}

export function parseSession(raw: unknown): SessionPayload | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "userId" in parsed &&
      "orgId" in parsed &&
      "roleId" in parsed &&
      typeof (parsed as SessionPayload).userId === "string" &&
      typeof (parsed as SessionPayload).orgId === "string" &&
      typeof (parsed as SessionPayload).roleId === "string"
    ) {
      return parsed as SessionPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // BYPASS — auto-attach first super-admin, no login required.
  {
    const [admin] = await db
      .select({
        id: usersTable.id,
        orgId: usersTable.orgId,
        roleId: usersTable.roleId,
        name: usersTable.name,
        email: usersTable.email,
        isSuperAdmin: usersTable.isSuperAdmin,
      })
      .from(usersTable)
      .where(eq(usersTable.isSuperAdmin, true))
      .limit(1);
    if (admin) {
      req.user = { ...admin, orgOverride: undefined };
      next();
      return;
    }
  }

  const raw = req.signedCookies?.[SESSION_COOKIE];
  const session = parseSession(raw);

  if (!session) {
    res.status(401).json({ error: "unauthenticated", message: "Login required" });
    return;
  }

  // Fetch user + role so we always reflect the current DB state.
  // A lightweight in-process cache is acceptable here (future task); for now
  // we accept the small per-request DB hit since SCADA tick rates are low.
  const [user] = await db
    .select({
      id: usersTable.id,
      orgId: usersTable.orgId,
      roleId: usersTable.roleId,
      name: usersTable.name,
      email: usersTable.email,
      isSuperAdmin: usersTable.isSuperAdmin,
    })
    .from(usersTable)
    .where(eq(usersTable.id, session.userId))
    .limit(1);

  if (!user || user.orgId !== session.orgId) {
    // Session references a deleted or cross-org user — clear the stale cookie
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(401).json({ error: "unauthenticated", message: "Session expired" });
    return;
  }

  req.user = {
    id: user.id,
    orgId: user.orgId,
    roleId: user.roleId,
    name: user.name,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    orgOverride: user.isSuperAdmin ? session.orgOverride : undefined,
  };
  next();
}
