---
name: Orval Params-type collision fix
description: Fixes a TS2308 name collision in orval-generated zod client code for operations mixing path and query params.
---

When an OpenAPI operation has both path params and query params (e.g. `GET /plants/{plantId}/yield?range=...`), orval's zod generator produces two differently-scoped types with the same exported name:
- `generated/api.ts` exports a `<Op>Params` zod schema for the **path** params.
- `generated/types/<op>Params.ts` exports a `<Op>Params` type for the **query** params.

Both get re-exported from the `lib/api-zod` barrel (`src/index.ts`), causing TS2308 "Module has already exported a member named X".

**Why:** This is a real orval codegen quirk, not a project mistake — it recurs any time a new operation mixes path+query params.

**How to apply:** In `lib/api-zod/src/index.ts`, add an explicit disambiguating re-export per TS2308's own suggested fix, e.g.:
```ts
export { GetInverterTrendParams, GetPlantYieldParams } from "./generated/api";
```
This picks the path-params version explicitly and resolves the barrel-file collision. Rerun codegen + `pnpm -w run typecheck:libs` after adding new mixed path+query operations to check whether this needs updating.
