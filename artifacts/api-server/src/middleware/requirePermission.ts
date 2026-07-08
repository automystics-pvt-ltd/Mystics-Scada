/**
 * RBAC permission enforcement middleware.
 *
 * Usage:
 *   router.post("/work-orders", requirePermission("maintenance.manage"), handler);
 *
 * Super admins (req.user.isSuperAdmin) bypass all permission checks.
 * Returns 403 { error: "forbidden", required: "<permission>" } on failure.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Permission } from "@workspace/permissions";

/** In-process cache: roleId → { permissions, expiresAt } */
const cache = new Map<string, { perms: Set<string>; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

/** Invalidate a role's cached permissions (call after role update/delete). */
export function invalidateRoleCache(roleId: string) {
  cache.delete(roleId);
}

/** Invalidate ALL cached role permissions (e.g. after bulk seed). */
export function invalidateAllRoleCache() {
  cache.clear();
}

async function getRolePermissions(roleId: string): Promise<Set<string>> {
  const cached = cache.get(roleId);
  if (cached && cached.expiresAt > Date.now()) return cached.perms;

  const [role] = await db
    .select({ permissions: rolesTable.permissions })
    .from(rolesTable)
    .where(eq(rolesTable.id, roleId))
    .limit(1);

  const perms = new Set(role?.permissions ?? []);
  cache.set(roleId, { perms, expiresAt: Date.now() + CACHE_TTL_MS });
  return perms;
}

/**
 * Returns an Express middleware that enforces the given permission.
 * Super admins bypass all checks.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user!;

    // Super admins bypass RBAC entirely
    if (user.isSuperAdmin) {
      next();
      return;
    }

    try {
      const perms = await getRolePermissions(user.roleId);
      if (perms.has(permission)) {
        next();
        return;
      }
      res.status(403).json({
        error: "forbidden",
        message: `Permission required: ${permission}`,
        required: permission,
      });
    } catch (err) {
      // On DB error, fail closed (deny access)
      req.log?.error({ err, permission }, "RBAC permission check failed");
      res.status(403).json({
        error: "forbidden",
        message: "Permission check unavailable",
        required: permission,
      });
    }
  };
}
