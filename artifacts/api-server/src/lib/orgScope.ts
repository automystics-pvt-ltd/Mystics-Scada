/**
 * Org-scope resolution — the single place that decides which orgId filter to
 * apply to a request.
 *
 * Normal users  → always their own orgId (cannot be overridden).
 * Super admins  → the `?orgId=` query param when provided, otherwise `null`
 *                 which means "no filter" (see all orgs).
 */

import type { Request } from "express";
import type { SQL } from "drizzle-orm";
import { eq } from "drizzle-orm";

/**
 * Returns the org-id to use as a WHERE filter, or `null` for a super-admin
 * request with no specific org override (meaning the query should return all
 * organisations).
 */
export function resolveOrgId(req: Request): string | null {
  if (req.user!.isSuperAdmin) {
    // orgOverride (set via impersonation) takes precedence over the ?orgId= query param
    return req.user!.orgOverride ?? (req.query["orgId"] as string | undefined) ?? null;
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
