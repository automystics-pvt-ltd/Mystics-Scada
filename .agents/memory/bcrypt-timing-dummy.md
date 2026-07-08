---
name: bcrypt timing dummy hash
description: Prevent timing-based account enumeration by using a pre-computed valid bcrypt hash as the fallback when a user is not found.
---

## Rule
For constant-time login rejection (unknown email), always compare against a **real, valid** bcrypt hash — not a hand-crafted invalid string. An invalid hash (e.g. `"$2b$10$invalidhash..."`) causes `bcrypt.compare()` to return almost immediately, leaking account existence via timing.

**Why:** bcrypt.compare() validates the hash format before doing work. A malformed hash fails the format check in microseconds; a valid hash takes the full cost-10 computation (~80-100ms). Attackers can distinguish the two by measuring response latency.

**How to apply:**
```ts
// Module level — computed once at startup (blocking is acceptable here)
const TIMING_DUMMY_HASH: string = bcrypt.hashSync("__app_timing_dummy_v1__", 10);

// In login handler:
const hashToCheck = user?.passwordHash ?? TIMING_DUMMY_HASH;
const ok = await bcrypt.compare(password, hashToCheck);
if (!user || !ok || !user.passwordHash) { /* reject */ }
```

Also: gate any demo/seed credentials strictly on `NODE_ENV !== 'production'` to prevent hardcoded backdoors surviving to production deployments.
