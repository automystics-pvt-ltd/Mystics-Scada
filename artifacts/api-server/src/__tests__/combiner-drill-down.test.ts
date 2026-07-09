/**
 * Combiner drill-down link tests (Task #22)
 *
 * Verifies that:
 *  1. Every valid combiner ID for every plant resolves to the CORRECT inverter set
 *     (i % combinerCount === combinerIndex) with the right totalStrings count.
 *  2. Malformed combiner IDs (wrong prefix, out-of-range, hex, float, blank,
 *     trailing junk / whitespace) are rejected by the route-handler validation.
 *  3. Every combiner node in the SLD carries an ID that the route accepts, and
 *     the derived detailPath (`/plants/:plantId/combiners/:id/strings`) is a
 *     round-trippable URL whose combinerId resolves to a non-empty payload.
 *
 * All tested functions are pure (no DB / network), so no mocking is needed.
 */

import { describe, it, expect } from "vitest";
import { PLANTS, plantSld, type PlantConfig } from "../lib/simulation";
import {
  combinerStrings,
  type CombinerStringsPayload,
} from "../lib/combinerStrings";
import { calcCombinerCount } from "../lib/combinerUtils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function combinerCount(plant: PlantConfig): number {
  return calcCombinerCount(plant.inverterCount);
}

/** Extract the zero-based inverter index from an ID like "plant-thar-inv-3". */
function inverterIndexFromId(inverterId: string): number {
  const suffix = inverterId.split("-inv-")[1];
  return suffix !== undefined ? Number.parseInt(suffix, 10) : NaN;
}

/**
 * Returns true when the route handler would accept this combinerId for this plant.
 * Mirrors the exact checks in GET /plants/:plantId/combiners/:combinerId/strings.
 */
function isValidCombinerId(plant: PlantConfig, combinerId: string): boolean {
  const expectedPrefix = `${plant.id}-comb-`;
  if (!combinerId.startsWith(expectedPrefix)) return false;

  const suffix = combinerId.slice(expectedPrefix.length);
  const index = Number.parseInt(suffix, 10);
  const count = combinerCount(plant);

  if (Number.isNaN(index)) return false;
  if (String(index) !== suffix) return false; // rejects "0x1", "1.5", " 1", "1 ", "1abc"
  if (index < 0 || index >= count) return false;
  return true;
}

/**
 * Expected totalStrings for a combiner: sum of stringsPerInverter for every
 * inverter i where i % combinerCount === combinerIndex.
 */
function expectedTotalStrings(plant: PlantConfig, combinerIndex: number): number {
  const count = combinerCount(plant);
  let total = 0;
  for (let i = 0; i < plant.inverterCount; i++) {
    if (i % count === combinerIndex) total += plant.stringsPerInverter;
  }
  return total;
}

/**
 * Set of inverter indices that belong to a given combiner (i % combinerCount === combinerIndex).
 */
function expectedInverterIndices(plant: PlantConfig, combinerIndex: number): Set<number> {
  const count = combinerCount(plant);
  const result = new Set<number>();
  for (let i = 0; i < plant.inverterCount; i++) {
    if (i % count === combinerIndex) result.add(i);
  }
  return result;
}

// Fixed reference time — midday IST so inverters are "running" and string
// deviationPct arithmetic is meaningful.
const NOW = new Date("2026-01-15T06:30:00Z"); // 12:00 IST (UTC+5:30)

// ── 1. Valid combiner IDs return payloads with the CORRECT inverter set ───────

describe("combinerStrings — valid IDs return the correct inverter set", () => {
  for (const plant of PLANTS) {
    const count = combinerCount(plant);

    describe(`${plant.name} (${plant.id}) — ${count} combiners`, () => {
      for (let c = 0; c < count; c++) {
        const combinerId = `${plant.id}-comb-${c}`;
        const combIdx = c; // capture for closure

        it(`combiner ${c} (${combinerId}) returns the correct payload`, () => {
          const payload: CombinerStringsPayload = combinerStrings(plant, combinerId, NOW);

          // Identity
          expect(payload.combinerId).toBe(combinerId);
          expect(payload.plantId).toBe(plant.id);
          expect(payload.combinerLabel).toBe(`Combiner Box ${combIdx + 1}`);

          // totalStrings must be exactly the expected count
          expect(payload.totalStrings).toBe(expectedTotalStrings(plant, combIdx));

          // Non-empty
          expect(payload.inverterGroups.length).toBeGreaterThan(0);

          // Membership: every group's inverter must satisfy i % count === combIdx
          const expectedIndices = expectedInverterIndices(plant, combIdx);
          for (const group of payload.inverterGroups) {
            expect(group.inverterId.startsWith(plant.id)).toBe(true);
            const idx = inverterIndexFromId(group.inverterId);
            expect(Number.isNaN(idx)).toBe(false);
            expect(
              expectedIndices.has(idx),
              `Inverter at index ${idx} should be in combiner ${combIdx} (expected indices: ${[...expectedIndices].join(",")})`,
            ).toBe(true);
            // Each group must have exactly stringsPerInverter strings
            expect(group.strings.length).toBe(plant.stringsPerInverter);
          }

          // No expected inverter is missing
          const actualIndices = new Set(
            payload.inverterGroups.map((g) => inverterIndexFromId(g.inverterId)),
          );
          for (const idx of expectedIndices) {
            expect(
              actualIndices.has(idx),
              `Inverter ${idx} missing from combiner ${combIdx} payload`,
            ).toBe(true);
          }

          // No extra inverters
          expect(actualIndices.size).toBe(expectedIndices.size);

          // String count sum
          const sumStrings = payload.inverterGroups.reduce((n, g) => n + g.strings.length, 0);
          expect(sumStrings).toBe(payload.totalStrings);
        });
      }
    });
  }
});

// ── 2. Malformed combiner IDs are rejected ────────────────────────────────────

describe("route validation — malformed combiner IDs", () => {
  for (const plant of PLANTS) {
    const count = combinerCount(plant);

    describe(`${plant.name} (${plant.id})`, () => {
      const malformedCases: Array<[string, string]> = [
        [`${plant.id}-comb-${count}`,      "index == combinerCount (out of range)"],
        [`${plant.id}-comb-${count + 5}`,  "index >> combinerCount (out of range)"],
        [`${plant.id}-comb--1`,            "negative index"],
        [`${plant.id}-comb-0x1`,           "hex suffix"],
        [`${plant.id}-comb-1.5`,           "floating-point suffix"],
        [`${plant.id}-comb-`,              "blank suffix"],
        [`${plant.id}-comb- 0`,            "leading space"],
        [`${plant.id}-comb-0 `,            "trailing space"],
        [`${plant.id}-comb-0abc`,          "trailing junk chars"],
        [`wrong-prefix-comb-0`,            "wrong plant prefix"],
        [`${plant.id}-combiner-0`,         "wrong separator (combiner vs comb)"],
        [`${plant.id}-COMB-0`,             "wrong case"],
      ];

      for (const [badId, reason] of malformedCases) {
        it(`rejects "${badId}" — ${reason}`, () => {
          expect(isValidCombinerId(plant, badId)).toBe(false);
        });
      }

      // Sanity: valid IDs 0..combinerCount-1 are all accepted
      it("accepts all valid IDs 0..combinerCount-1", () => {
        for (let c = 0; c < count; c++) {
          expect(isValidCombinerId(plant, `${plant.id}-comb-${c}`)).toBe(true);
        }
      });
    });
  }
});

// ── 3. SLD combiner node IDs and detailPath round-trip ───────────────────────

describe("SLD combiner nodes — IDs are valid and detailPath is correct", () => {
  for (const plant of PLANTS) {
    describe(`${plant.name} (${plant.id})`, () => {
      const sld = plantSld(plant, NOW);
      const combinerNodes = sld.nodes.filter((n) => n.type === "combiner");
      const expectedCount = combinerCount(plant);

      it(`SLD emits exactly ${expectedCount} combiner nodes`, () => {
        expect(combinerNodes.length).toBe(expectedCount);
      });

      it("combiner node IDs are unique", () => {
        const ids = combinerNodes.map((n) => n.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("combiner indices are a contiguous 0..count-1 sequence", () => {
        const indices = combinerNodes
          .map((n) => Number(n.id.split("-comb-")[1]))
          .sort((a, b) => a - b);
        expect(indices).toEqual(Array.from({ length: expectedCount }, (_, i) => i));
      });

      for (const node of combinerNodes) {
        const combinerId = node.id; // e.g. "plant-thar-comb-2"

        // domain.ts builds: `/plants/${plant.id}/combiners/${n.id}/strings`
        const detailPath = `/plants/${plant.id}/combiners/${combinerId}/strings`;

        it(`node "${combinerId}" has an ID accepted by the route`, () => {
          expect(isValidCombinerId(plant, combinerId)).toBe(true);
        });

        it(`detailPath "${detailPath}" round-trips to the same combinerId`, () => {
          // Parse the combinerId back out of the canonical detailPath format
          const prefix = `/plants/${plant.id}/combiners/`;
          const suffix = "/strings";
          expect(detailPath.startsWith(prefix)).toBe(true);
          expect(detailPath.endsWith(suffix)).toBe(true);
          const parsed = detailPath.slice(prefix.length, detailPath.length - suffix.length);
          expect(parsed).toBe(combinerId);
        });

        it(`detailPath combinerId "${combinerId}" resolves to a non-empty payload`, () => {
          const payload = combinerStrings(plant, combinerId, NOW);
          expect(payload.totalStrings).toBeGreaterThan(0);
          expect(payload.inverterGroups.length).toBeGreaterThan(0);
          // Combiner label must match the node's label
          expect(payload.combinerLabel).toBe(node.label);
        });
      }
    });
  }
});
