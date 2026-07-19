/**
 * Org-scope resolution — the single place that decides which orgId filter to
 * apply to a request.
 *
 * Normal users  → always their own orgId (cannot be overridden).
 * Super admins  → orgOverride (impersonation) → ?orgId= query param
 *                 → their own orgId → null (no filter, all orgs).
 *
 * Falling back to the super admin's own orgId means they can use org-scoped
 * features (Connect Source, Devices, etc.) directly within their own tenant
 * without having to explicitly impersonate it first.
 */

import type { Request } from "express";
import type { SQL } from "drizzle-orm";
import { eq } from "drizzle-orm";

/**
 * Returns the org-id to use as a WHERE filter, or `null` for a super-admin
 * request with no specific org scope (meaning the query should return all
 * organisations).
 */
export function resolveOrgId(req: Request): string | null {
  if (req.user!.isSuperAdmin) {
    // Priority: explicit impersonation → ?orgId= param → own orgId → null
    return (
      req.user!.orgOverride ??
      (req.query["orgId"] as string | undefined) ??
      req.user!.orgId ??
      null
    );
  }
  return req.user!.orgId;
}

/**
 * Builds a Drizzle `eq(col, orgId)` condition, or `undefined` when the caller
 * is a super-admin with no org filter (return all rows).
 */
export function orgCondition<T>(
  col: Parameters<typeof eq>[0],
  orgId: string | null,
): SQL | undefined {
  return orgId ? eq(col, orgId) : undefined;
}
