---
name: Platform-admin self-provision
description: adminSession() must upsert a super-admin user on first use; seedPasswordUser has a production guard that silently skips isSuperAdmin patching.
---

## Rule
`adminSession()` (in `platform-admin-auth.ts`) must never hard-fail with 500 when no `isSuperAdmin=true` user exists. It must self-provision one.

## Why
`seedPasswordUser()` exits immediately at the top with `if NODE_ENV === "production" → return`. On VPS/production installs the seed guard prevents the `isSuperAdmin` flag from ever being set. Without a self-provision fallback, every passcode login returns 500 `no_admin_user`.

## How to apply
The self-provision logic in `adminSession()`:
1. Query `usersTable WHERE isSuperAdmin = true LIMIT 1` — return if found.
2. If not found: find first org (`organizationsTable`), find `role-admin` role (fallback to any role).
3. INSERT `user-platform-admin` with `isSuperAdmin=true` using `onConflictDoUpdate`.
4. Return the payload.

Also: `seedPasswordUser()` was patched to run the `isSuperAdmin=true` patch loop BEFORE the production guard, but the self-provision in `adminSession()` is the final safety net that makes login work even on completely fresh installs.
