/**
 * Seeds a password-capable admin user on every server startup.
 * Idempotent — safe to run multiple times.
 *
 * Target: automystics.com@gmail.com / Automystics@2026$
 * If the user already exists their passwordHash is refreshed.
 * If the user doesn't exist they are created in the first available org.
 */

import bcrypt from "bcryptjs";
import { db, usersTable, organizationsTable, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SEED_EMAIL    = "automystics.com@gmail.com";
const SEED_PASSWORD = "Automystics@2026$";
const SEED_NAME     = "Automystics Admin";

export async function seedPasswordUser(): Promise<void> {
  const hash = bcrypt.hashSync(SEED_PASSWORD, 10);

  const [existing] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, SEED_EMAIL))
    .limit(1);

  if (existing) {
    await db
      .update(usersTable)
      .set({ passwordHash: hash, status: "active", isSuperAdmin: true })
      .where(eq(usersTable.id, existing.id));
    console.log(`[Auth] ✅ Password refreshed for ${SEED_EMAIL}`);
    return;
  }

  // User doesn't exist — attach to first available org with admin role
  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable)
    .limit(1);

  if (!org) {
    console.warn("[Auth] ⚠ No org found — password user seed skipped");
    return;
  }

  const roles = await db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .where(eq(rolesTable.orgId, org.id));

  const role =
    roles.find((r) => r.name.toLowerCase().includes("admin")) ?? roles[0];

  if (!role) {
    console.warn("[Auth] ⚠ No role found for org — password user seed skipped");
    return;
  }

  await db.insert(usersTable).values({
    id: `user-pwd-seed-${Date.now()}`,
    orgId: org.id,
    name: SEED_NAME,
    email: SEED_EMAIL,
    roleId: role.id,
    plantIds: [],
    status: "active",
    passwordHash: hash,
    isSuperAdmin: true,
  });

  console.log(`[Auth] ✅ Created password user ${SEED_EMAIL} in org "${org.name}"`);
}
