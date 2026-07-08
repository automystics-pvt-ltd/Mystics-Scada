export * from "./generated/api";
export * from "./generated/types";

// Orval emits a colliding `<Op>Params` name for operations that mix path
// and query params: `generated/api.ts` uses it for the path-params zod
// schema, while `generated/types` uses it for the client's combined query
// params type. Explicitly re-export the zod schema version to resolve the
// ambiguity (see .local/skills/pnpm-workspace/references/openapi.md).
export { GetInverterTrendParams, GetPlantYieldParams } from "./generated/api";
