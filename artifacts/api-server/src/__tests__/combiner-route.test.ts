/**
 * HTTP route-level tests for the combiner strings endpoint (Task #22).
 *
 * Uses supertest against a minimal Express app that mounts the real plants
 * router with a user-injection middleware in place of authenticate().
 * @workspace/db is mocked so tests run without a database connection.
 *
 * Covers:
 *  - Valid combiner IDs for every plant → 200 with correct shape + totalStrings
 *  - Malformed combiner IDs → 404
 *  - SLD response combiner node detailPath format → parseable and valid
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Mock @workspace/db BEFORE any route imports execute ──────────────────────
// vi.mock() is hoisted to the top of the file, so it runs before imports.
// We replace the real DB module (which needs DATABASE_URL at load time) with
// an in-memory chain that satisfies all Drizzle call patterns used by the
// routes under test.

vi.mock("@workspace/db", () => {
  /** A chain object that is both awaitable (Promise<[]>) and supports every
   *  Drizzle builder method used in faultInjection / alertCounts. */
  function makeChain(): any {
    return Object.assign(Promise.resolve([]), {
      from: () => makeChain(),
      where: () => makeChain(),
      values: () => makeChain(),
      set: () => makeChain(),
      onConflictDoUpdate: () => makeChain(),
      limit: () => makeChain(),
    });
  }

  return {
    db: {
      select: () => makeChain(),
      insert: () => makeChain(),
      update: () => makeChain(),
      delete: () => makeChain(),
    },
    faultOverridesTable: {},
    alertsTable:         {},
    // Other named exports referenced by schema index
    organizationsTable:  {},
    usersTable:          {},
    rolesTable:          {},
  };
});

// ── Imports (after mock is set up) ───────────────────────────────────────────

import express from "express";
import supertest from "supertest";
import plantsRouter from "../routes/plants";
import { PLANTS, type PlantConfig } from "../lib/simulation";
import { calcCombinerCount } from "../lib/combinerUtils";

// ── Minimal test Express app ─────────────────────────────────────────────────

/**
 * Build a minimal app: inject a user so resolveOrgId() returns "org-1",
 * then mount the real plants router.  No DB-backed authenticate middleware.
 */
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Simulate a logged-in regular user belonging to org-1
    (req as any).user = { id: "u-test", orgId: "org-1", isSuperAdmin: false };
    next();
  });
  app.use(plantsRouter);
  return app;
}

let request: ReturnType<typeof supertest>;

beforeAll(() => {
  request = supertest(makeApp());
});

// ── Helpers (same as combiner-drill-down.test.ts) ────────────────────────────

function combinerCount(plant: PlantConfig): number {
  return calcCombinerCount(plant.inverterCount);
}

function expectedTotalStrings(plant: PlantConfig, combinerIndex: number): number {
  const count = combinerCount(plant);
  let total = 0;
  for (let i = 0; i < plant.inverterCount; i++) {
    if (i % count === combinerIndex) total += plant.stringsPerInverter;
  }
  return total;
}

// ── 1. Valid combiner IDs return 200 with correct payload ────────────────────

describe("GET /plants/:plantId/combiners/:combinerId/strings — valid IDs", () => {
  for (const plant of PLANTS) {
    const count = combinerCount(plant);

    describe(`${plant.name} (${plant.id})`, () => {
      for (let c = 0; c < count; c++) {
        const combinerId = `${plant.id}-comb-${c}`;
        const expectedStrings = expectedTotalStrings(plant, c);
        const combIdx = c;

        it(`GET /plants/${plant.id}/combiners/${combinerId}/strings → 200`, async () => {
          const res = await request.get(
            `/plants/${plant.id}/combiners/${combinerId}/strings`,
          );

          expect(res.status).toBe(200);

          // Shape
          expect(res.body).toMatchObject({
            combinerId,
            plantId: plant.id,
            combinerLabel: `Combiner Box ${combIdx + 1}`,
          });

          // Correct string count
          expect(res.body.totalStrings).toBe(expectedStrings);

          // Non-empty inverter groups, each string has required fields
          expect(res.body.inverterGroups.length).toBeGreaterThan(0);
          for (const group of res.body.inverterGroups) {
            expect(group.inverterId).toMatch(new RegExp(`^${plant.id}-inv-\\d+$`));
            expect(group.strings.length).toBe(plant.stringsPerInverter);
            for (const str of group.strings) {
              expect(typeof str.currentA).toBe("number");
              expect(typeof str.voltageV).toBe("number");
              expect(typeof str.isDeviating).toBe("boolean");
              expect(typeof str.deviationPct).toBe("number");
            }
          }
        });
      }
    });
  }
});

// ── 2. Malformed combiner IDs return 404 ─────────────────────────────────────

describe("GET /plants/:plantId/combiners/:combinerId/strings — malformed IDs → 404", () => {
  // Use the first plant for all malformed-ID cases
  const plant = PLANTS[0]!;
  const count = combinerCount(plant);

  const malformedCases: Array<[string, string]> = [
    [`${plant.id}-comb-${count}`,     "index == combinerCount"],
    [`${plant.id}-comb-${count + 5}`, "index >> combinerCount"],
    [`${plant.id}-comb--1`,           "negative index"],
    [`${plant.id}-comb-0x1`,          "hex suffix"],
    [`${plant.id}-comb-1.5`,          "float suffix"],
    [`${plant.id}-comb-`,             "blank suffix"],
    [`${plant.id}-comb-0 `,           "trailing space"],
    [`${plant.id}-comb-0abc`,         "trailing junk"],
    [`wrong-prefix-comb-0`,           "wrong plant prefix"],
    [`${plant.id}-combiner-0`,        "wrong separator"],
  ];

  for (const [badId, reason] of malformedCases) {
    it(`"${badId}" (${reason}) → 404`, async () => {
      const res = await request.get(
        `/plants/${plant.id}/combiners/${encodeURIComponent(badId)}/strings`,
      );
      // The route validates the combinerId prefix and index range.
      // A wrong plant prefix → plant lookup succeeds for plant.id but combinerId
      // prefix check fails → 404.
      expect(res.status).toBe(404);
    });
  }
});

// ── 3. Unknown plantId returns 404 ───────────────────────────────────────────

describe("GET /plants/:plantId/combiners/:combinerId/strings — unknown plant", () => {
  it("unknown plantId → 404", async () => {
    const res = await request.get(
      "/plants/plant-does-not-exist/combiners/plant-does-not-exist-comb-0/strings",
    );
    expect(res.status).toBe(404);
  });
});

// ── 4. SLD endpoint combiner node detailPath is canonical and valid ───────────

describe("GET /plants/:plantId/sld — combiner node detailPath", () => {
  for (const plant of PLANTS) {
    it(`${plant.name}: all combiner detailPaths are canonical /plants/:id/combiners/:id/strings`, async () => {
      const res = await request.get(`/plants/${plant.id}/sld`);
      expect(res.status).toBe(200);

      const combinerNodes = (res.body.nodes as any[]).filter(
        (n: any) => n.type === "combiner",
      );
      const expectedCount = combinerCount(plant);
      expect(combinerNodes.length).toBe(expectedCount);

      for (const node of combinerNodes) {
        // detailPath must follow the canonical format
        const expectedPath = `/plants/${plant.id}/combiners/${node.id}/strings`;
        expect(node.detailPath).toBe(expectedPath);

        // Round-trip: parse the combinerId from detailPath
        const prefix = `/plants/${plant.id}/combiners/`;
        const suffix = "/strings";
        const parsed = node.detailPath.slice(prefix.length, -suffix.length);
        expect(parsed).toBe(node.id);

        // The parsed combinerId must be accepted by the route (verified via real 200)
        const strRes = await request.get(
          `/plants/${plant.id}/combiners/${parsed}/strings`,
        );
        expect(strRes.status).toBe(200);
        expect(strRes.body.totalStrings).toBeGreaterThan(0);
        // combinerLabel in the strings response must match the SLD node label
        expect(strRes.body.combinerLabel).toBe(node.label);
      }
    });
  }
});
