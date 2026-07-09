---
name: DB package composite build
description: lib/db uses TypeScript composite project references; new tables won't be visible to dependents until declarations are regenerated.
---

The `lib/db` package uses `"composite": true` + `"emitDeclarationOnly": true` in its tsconfig. When new schema files are added (tables, relations), the API server and other packages that reference it via `tsconfig.references` won't see the new exports until the declaration output is regenerated.

**How to apply:** After adding new tables to `lib/db/src/schema/`, run:

```sh
pnpm --filter @workspace/db exec tsc --build
```

This emits the `.d.ts` files into `lib/db/dist/`. Without this step, TS errors like `Module '"@workspace/db"' has no exported member 'newTable'` appear across all referencing packages even though the source is correct.

**Why:** pnpm workspace packages export their `./src/index.ts` directly (no runtime build), but TypeScript project references require compiled declarations for cross-project type resolution. The `tsc --noEmit` check in a consuming package resolves types from `lib/db/dist/`, not the source `.ts` files.
