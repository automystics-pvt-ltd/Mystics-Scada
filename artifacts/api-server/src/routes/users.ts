import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, rolesTable } from "@workspace/db";
import { ListUsersResponse, InviteUserBody, InviteUserResponse, UpdateUserBody, UpdateUserResponse, ListRolesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

async function roleNameById(roleId: string): Promise<string> {
  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, roleId));
  return role?.name ?? roleId;
}

async function roleIdByName(roleName: string): Promise<string | null> {
  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.name, roleName));
  return role?.id ?? null;
}

router.get("/users", async (_req, res) => {
  const rows = await db.select().from(usersTable);
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

router.post("/users", async (req, res) => {
  const body = InviteUserBody.parse(req.body);
  const roleId = await roleIdByName(body.role);
  if (!roleId) {
    res.status(400).json({ error: "invalid_request", message: `Unknown role: ${body.role}` });
    return;
  }
  const now = new Date();
  const [created] = await db
    .insert(usersTable)
    .values({
      id: randomUUID(),
      orgId: req.user!.orgId,
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

router.patch("/users/:userId", async (req, res) => {
  const userId = req.params["userId"] ?? "";
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!existing) {
    res.status(404).json({ error: "not_found", message: "User not found" });
    return;
  }

  const body = UpdateUserBody.parse(req.body);
  if (!body.role && !body.plantIds && !body.status) {
    res.status(400).json({ error: "invalid_request", message: "At least one of role, plantIds, or status must be provided" });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (body.role) {
    const roleId = await roleIdByName(body.role);
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

router.get("/roles", async (_req, res) => {
  const roles = await db.select().from(rolesTable);
  const users = await db.select().from(usersTable);
  const data = roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permissions: r.permissions,
    userCount: users.filter((u) => u.roleId === r.id).length,
  }));
  res.json(ListRolesResponse.parse(data));
});

export default router;
