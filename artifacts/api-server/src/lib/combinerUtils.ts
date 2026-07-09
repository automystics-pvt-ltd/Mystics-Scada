/**
 * Shared formula for the number of combiner boxes in a plant.
 *
 * Rule: at least 2 combiners, one per every 4 inverters (rounded up).
 * All three call sites — simulation.ts (plantSld), combinerStrings.ts,
 * and routes/plants.ts — import this so the formula stays in sync.
 */
export function calcCombinerCount(inverterCount: number): number {
  return Math.max(2, Math.ceil(inverterCount / 4));
}
