import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, type SQL } from "drizzle-orm";
import { db, usersTable, rolesTable } from "@workspace/db";
import { ListUsersResponse, InviteUserBody, InviteUserResponse, UpdateUserBody, UpdateUserResponse } from "@workspace/api-zod";
import { resolveOrgId, orgCondition } from "../lib/orgScope";
import { requirePermission } from "../middleware/requirePermission";

const router: IRouter = Router();

async function roleNameById(roleId: string): Promise<string> {
  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, roleId));
  return role?.name ?? roleId;
}

async function roleIdByName(roleName: string, orgId: string): Promise<string | null> {
  // Look up role by name scoped to the user's org (custom roles may shadow global names)
  const [role] = await db
    .select()
    .from(rolesTable)
    .where(and(eq(rolesTable.orgId, orgId), eq(rolesTable.name, roleName)));
  return role?.id ?? null;
}

router.get("/users", requirePermission("users.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const conditions: SQL[] = [];
  const oc = orgCondition(usersTable.orgId, orgId);
  if (oc) conditions.push(oc);

  const rows = await db
    .select()
    .from(usersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const data = await Promise.all(
    rows.map(async (u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: await roleNameById(u.roleId),
      plantIds: u.plantIds,
      status: u.status,
      lastLogin: u.lastLoginAt,
    })),
  );
  res.json(ListUsersResponse.parse(data));
});

router.post("/users", requirePermission("users.manage"), async (req, res) => {
  const body = InviteUserBody.parse(req.body);
  const orgId = req.user!.orgId;

  // Accept either roleId (direct, with org-ownership check) or role name
  const directRoleIdOnCreate = (req.body as { roleId?: string }).roleId;
  let roleId: string | null;
  if (directRoleIdOnCreate) {
    const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, directRoleIdOnCreate));
    if (!role || role.orgId !== orgId) {
      res.status(400).json({ error: "invalid_request", message: "Unknown or cross-org role" });
      return;
    }
    roleId = directRoleIdOnCreate;
  } else {
    roleId = await roleIdByName(body.role, orgId);
  }
  if (!roleId) {
    res.status(400).json({ error: "invalid_request", message: `Unknown role: ${body.role}` });
    return;
  }

  const now = new Date();
  const [created] = await db
    .insert(usersTable)
    .values({
      id: randomUUID(),
      orgId,
      name: body.name,
      email: body.email,
      roleId,
      plantIds: body.plantIds ?? [],
      status: "invited",
      lastLoginAt: null,
      createdAt: now,
    })
    .returning();

  req.log.info({ userId: created?.id }, "User invited");
  res.status(201).json(
    InviteUserResponse.parse({
      id: created!.id,
      name: created!.name,
      email: created!.email,
      role: body.role,
      plantIds: created!.plantIds,
      status: created!.status,
      lastLogin: created!.lastLoginAt,
    }),
  );
});

router.patch("/users/:userId", requirePermission("users.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const userId = (req.params["userId"] as string) ?? "";
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!existing || (orgId !== null && existing.orgId !== orgId)) {
    res.status(404).json({ error: "not_found", message: "User not found" });
    return;
  }

  const body = UpdateUserBody.parse(req.body);
  // Also accept direct roleId from UI
  const directRoleId = (req.body as { roleId?: string }).roleId;
  if (!body.role && !body.plantIds && !body.status && !directRoleId) {
    res.status(400).json({ error: "invalid_request", message: "At least one of role, roleId, plantIds, or status must be provided" });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (directRoleId) {
    // Verify the roleId belongs to the same org
    const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, directRoleId));
    if (!role || role.orgId !== existing.orgId) {
      res.status(400).json({ error: "invalid_request", message: "Unknown or cross-org role" });
      return;
    }
    updates.roleId = directRoleId;
  } else if (body.role) {
    const roleId = await roleIdByName(body.role, existing.orgId);
    if (!roleId) {
      res.status(400).json({ error: "invalid_request", message: `Unknown role: ${body.role}` });
      return;
    }
    updates.roleId = roleId;
  }
  if (body.plantIds) updates.plantIds = body.plantIds;
  if (body.status) updates.status = body.status;

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  req.log.info({ userId, updates: body }, "User updated");
  res.json(
    UpdateUserResponse.parse({
      id: updated!.id,
      name: updated!.name,
      email: updated!.email,
      role: await roleNameById(updated!.roleId),
      plantIds: updated!.plantIds,
      status: updated!.status,
      lastLogin: updated!.lastLoginAt,
    }),
  );
});

export default router;
