/**
 * Role management API — org-scoped CRUD for roles.
 *
 * GET    /api/roles            list org's roles (public to org members)
 * GET    /api/roles/:roleId    get single role
 * POST   /api/roles            create custom role        [users.manage]
 * PATCH  /api/roles/:roleId    update role name/perms    [users.manage]
 * DELETE /api/roles/:roleId    delete role               [users.manage]
 */

import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, ne, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, rolesTable, usersTable } from "@workspace/db";
import { PERMISSIONS } from "@workspace/permissions";
import { resolveOrgId, orgCondition } from "../lib/orgScope";
import { requirePermission, invalidateRoleCache } from "../middleware/requirePermission";

const router: IRouter = Router();

// Zod schema for permission arrays — only known permission strings are accepted
const knownPerms = new Set<string>(PERMISSIONS);
const permissionsSchema = z
  .array(
    z.string().refine((p: string): p is (typeof PERMISSIONS)[number] => knownPerms.has(p), {
      message: "Unknown permission string",
    }),
  )
  .min(1, "A role must have at least one permission");

const CreateRoleBody = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  permissions: permissionsSchema,
});

const UpdateRoleBody = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: permissionsSchema.optional(),
});

// ── GET /roles ──────────────────────────────────────────────────────────────

router.get("/roles", requirePermission("users.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const conditions: SQL[] = [];
  const oc = orgCondition(rolesTable.orgId, orgId);
  if (oc) conditions.push(oc);

  const roles = await db
    .select()
    .from(rolesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  // Count users per role (scoped to same org)
  const userConditions: SQL[] = [];
  const uc = orgCondition(usersTable.orgId, orgId);
  if (uc) userConditions.push(uc);
  const users = await db
    .select({ roleId: usersTable.roleId })
    .from(usersTable)
    .where(userConditions.length > 0 ? and(...userConditions) : undefined);

  const userCountByRole = new Map<string, number>();
  for (const u of users) {
    userCountByRole.set(u.roleId, (userCountByRole.get(u.roleId) ?? 0) + 1);
  }

  res.json(
    roles.map((r) => ({
      id:          r.id,
      name:        r.name,
      description: r.description,
      permissions: r.permissions,
      userCount:   userCountByRole.get(r.id) ?? 0,
    })),
  );
});

// ── GET /roles/:roleId ──────────────────────────────────────────────────────

router.get("/roles/:roleId", requirePermission("users.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const [role] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.id, (req.params["roleId"] as string) ?? ""));

  if (!role || (orgId !== null && role.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Role not found" });
    return;
  }
  res.json(role);
});

// ── POST /roles ─────────────────────────────────────────────────────────────

router.post("/roles", requirePermission("users.manage"), async (req, res) => {
  const body = CreateRoleBody.parse(req.body);

  // Duplicate name check within this org
  const orgId = req.user!.orgId;
  const [conflict] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(and(eq(rolesTable.orgId, orgId), eq(rolesTable.name, body.name)));
  if (conflict) {
    res.status(409).json({ error: "conflict", message: `A role named "${body.name}" already exists` });
    return;
  }

  const [created] = await db
    .insert(rolesTable)
    .values({
      id:          randomUUID(),
      orgId,
      name:        body.name,
      description: body.description,
      permissions: body.permissions,
    })
    .returning();

  req.log.info({ roleId: created?.id }, "Role created");
  res.status(201).json(created);
});

// ── PATCH /roles/:roleId ────────────────────────────────────────────────────

router.patch("/roles/:roleId", requirePermission("users.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const roleId = (req.params["roleId"] as string) ?? "";
  const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.id, roleId));

  if (!existing || (orgId !== null && existing.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Role not found" });
    return;
  }

  const body = UpdateRoleBody.parse(req.body);

  // Name conflict check (exclude self)
  if (body.name && body.name !== existing.name) {
    const [conflict] = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.orgId, existing.orgId),
          eq(rolesTable.name, body.name),
          ne(rolesTable.id, roleId),
        ),
      );
    if (conflict) {
      res.status(409).json({ error: "conflict", message: `A role named "${body.name}" already exists` });
      return;
    }
  }

  const updates: Partial<typeof rolesTable.$inferInsert> = {};
  if (body.name !== undefined)        updates.name        = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.permissions !== undefined) updates.permissions = body.permissions;

  const [updated] = await db
    .update(rolesTable)
    .set(updates)
    .where(eq(rolesTable.id, roleId))
    .returning();

  invalidateRoleCache(roleId);
  req.log.info({ roleId }, "Role updated");
  res.json(updated);
});

// ── DELETE /roles/:roleId ───────────────────────────────────────────────────

router.delete("/roles/:roleId", requirePermission("users.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const roleId = (req.params["roleId"] as string) ?? "";
  const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.id, roleId));

  if (!existing || (orgId !== null && existing.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "Role not found" });
    return;
  }

  // Guard: cannot delete a role that has users assigned
  const [assignedUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.roleId, roleId))
    .limit(1);

  if (assignedUser) {
    res.status(409).json({
      error: "conflict",
      message: "Cannot delete a role that is assigned to users. Reassign users first.",
    });
    return;
  }

  await db.delete(rolesTable).where(eq(rolesTable.id, roleId));
  invalidateRoleCache(roleId);
  req.log.info({ roleId }, "Role deleted");
  res.status(204).end();
});

export default router;
