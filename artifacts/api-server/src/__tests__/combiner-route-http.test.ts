/**
 * Combiner strings route — HTTP integration tests (Task #57)
 *
 * Fires real HTTP requests through the Express app via supertest so that the
 * full middleware stack is exercised:
 *   cookie-parser → authenticate → resolveOrgId → plantsRouter
 *
 * Three contracts are verified:
 *  1. GET /api/plants/:plantId/combiners/:combinerId/strings
 *     → 200 with a valid JSON body for every real plant + combiner combo.
 *  2. Unauthenticated request (no session cookie)
 *     → 401 { error: "unauthenticated" }
 *  3. Plant that does not belong to the authenticated user's org
 *     → 404 { error: "not_found" }
 *
 * The @workspace/db module is mocked so no real database is needed.
 * SESSION_SECRET is set to a fixed test value so signed cookies can be
 * constructed deterministically with Node's built-in `crypto`.
 */

// SESSION_SECRET is injected via vitest.config.ts test.env so it is present
// before app.ts is imported (app.ts throws at load time when it is absent).

import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import request, { type Test as SupertestTest } from "supertest";
import { calcCombinerCount } from "../lib/combinerUtils";

// ── 1. Mock @workspace/db ─────────────────────────────────────────────────────
// The authenticate middleware runs a drizzle query:
//   db.select({...}).from(usersTable).where(...).limit(1)
// We return a fake org-1 operator for any session that carries userId "u-test".

vi.mock("@workspace/db", () => {
  const fakeUser = {
    id: "u-test",
    orgId: "org-1",
    roleId: "role-operator",
    name: "Test Operator",
    email: "test@example.com",
    isSuperAdmin: false,
  };

  // Drizzle query builder is chainable; each method returns an object with the
  // next method, and .limit() resolves to the row array.
  const makeLimitStub = (rows: unknown[]) => ({
    limit: vi.fn().mockResolvedValue(rows),
  });
  const makeWhereStub = (rows: unknown[]) => ({
    where: vi.fn().mockReturnValue(makeLimitStub(rows)),
    // Some callers omit .where() before .limit(); cover that too.
    limit: vi.fn().mockResolvedValue(rows),
  });
  const makeFromStub = (rows: unknown[]) => ({
    from: vi.fn().mockReturnValue(makeWhereStub(rows)),
  });

  const db = {
    select: vi.fn().mockReturnValue(makeFromStub([fakeUser])),
  };

  return {
    db,
    usersTable: {},
    rolesTable: {},
    eq: vi.fn(),
  };
});

// ── 2. Import app after mocks + env are in place ──────────────────────────────
// Dynamic import ensures the hoisted vi.mock() calls land first.
import app from "../app";
import { PLANTS } from "../lib/simulation";

// ── 3. Cookie helper ──────────────────────────────────────────────────────────
/**
 * Build a cookie-parser-compatible signed cookie value.
 *
 * cookie-parser uses the `cookie-signature` algorithm:
 *   signed = "s:" + val + "." + HMAC-SHA256(val, secret).base64.trimEnd("=")
 */
function signedCookieValue(value: string, secret: string): string {
  const sig = crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("base64")
    .replace(/=+$/, "");
  return `s:${value}.${sig}`;
}

const SESSION_COOKIE = "scada_session";
const TEST_SECRET = process.env["SESSION_SECRET"]!;

/** Session payload that matches the mocked DB user (org-1). */
const validSession = JSON.stringify({ userId: "u-test", orgId: "org-1", roleId: "role-operator" });
const validCookieValue = signedCookieValue(validSession, TEST_SECRET);

/** Helper: attach the valid signed session cookie to a supertest Test request. */
function withAuth(req: SupertestTest) {
  return req.set("Cookie", `${SESSION_COOKIE}=${encodeURIComponent(validCookieValue)}`);
}

// ── 4. Combiner count helper ──────────────────────────────────────────────────
function combinerCount(inverterCount: number): number {
  return calcCombinerCount(inverterCount);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/plants/:plantId/combiners/:combinerId/strings — HTTP contract", () => {
  // ── 4a. Unauthenticated → 401 ─────────────────────────────────────────────
  describe("unauthenticated request", () => {
    it("returns 401 with error=unauthenticated when no session cookie is sent", async () => {
      // Use the first plant + first combiner as a stable target
      const plant = PLANTS[0]!;
      const combinerId = `${plant.id}-comb-0`;

      const res = await request(app)
        .get(`/api/plants/${plant.id}/combiners/${combinerId}/strings`)
        .expect(401);

      expect(res.body).toMatchObject({ error: "unauthenticated" });
    });

    it("returns 401 when the session cookie has an invalid signature", async () => {
      const plant = PLANTS[0]!;
      const combinerId = `${plant.id}-comb-0`;

      // Tamper: append extra chars to the signature
      const tamperedCookie = `${SESSION_COOKIE}=${encodeURIComponent(validCookieValue + "TAMPERED")}`;

      const res = await request(app)
        .get(`/api/plants/${plant.id}/combiners/${combinerId}/strings`)
        .set("Cookie", tamperedCookie)
        .expect(401);

      expect(res.body).toMatchObject({ error: "unauthenticated" });
    });
  });

  // ── 4b. Cross-org plant → 404 ─────────────────────────────────────────────
  describe("cross-org access", () => {
    it("returns 404 when the plant does not belong to the authenticated user's org", async () => {
      // "plant-other-org" is not in the PLANT_ORG_MAP for org-1, so
      // getOrgPlants('org-1') will not include it → plant lookup fails → 404.
      const res = await withAuth(
        request(app).get("/api/plants/plant-other-org/combiners/plant-other-org-comb-0/strings"),
      ).expect(404);

      expect(res.body).toMatchObject({ error: "not_found" });
    });
  });

  // ── 4c. Valid combiner IDs → 200 with correct JSON shape ─────────────────
  describe("authenticated requests — all plants and combiner IDs", () => {
    for (const plant of PLANTS) {
      const count = combinerCount(plant.inverterCount);

      describe(`${plant.name} (${plant.id}) — ${count} combiners`, () => {
        for (let c = 0; c < count; c++) {
          const combinerId = `${plant.id}-comb-${c}`;

          it(`GET /api/plants/${plant.id}/combiners/${combinerId}/strings → 200 with valid body`, async () => {
            const res = await withAuth(
              request(app).get(
                `/api/plants/${plant.id}/combiners/${combinerId}/strings`,
              ),
            ).expect(200);

            const body = res.body as Record<string, unknown>;

            // Identity fields
            expect(body["plantId"]).toBe(plant.id);
            expect(body["combinerId"]).toBe(combinerId);
            expect(typeof body["combinerLabel"]).toBe("string");
            expect((body["combinerLabel"] as string).length).toBeGreaterThan(0);

            // Numeric totals
            expect(typeof body["totalStrings"]).toBe("number");
            expect((body["totalStrings"] as number)).toBeGreaterThan(0);

            // inverterGroups array
            expect(Array.isArray(body["inverterGroups"])).toBe(true);
            const groups = body["inverterGroups"] as Array<Record<string, unknown>>;
            expect(groups.length).toBeGreaterThan(0);

            // Each group has the required fields
            for (const group of groups) {
              expect(typeof group["inverterId"]).toBe("string");
              expect(typeof group["inverterName"]).toBe("string");
              expect(typeof group["inverterStatus"]).toBe("string");
              expect(Array.isArray(group["strings"])).toBe(true);
              expect((group["strings"] as unknown[]).length).toBeGreaterThan(0);

              // Each string entry has required numeric/string fields
              for (const s of group["strings"] as Array<Record<string, unknown>>) {
                expect(typeof s["id"]).toBe("string");
                expect(typeof s["label"]).toBe("string");
                expect(typeof s["currentA"]).toBe("number");
                expect(typeof s["voltageV"]).toBe("number");
                expect(typeof s["deviationPct"]).toBe("number");
                // status is "on" | "off"
                expect(["on", "off"]).toContain(s["status"]);
                expect(typeof s["isDeviating"]).toBe("boolean");
              }
            }

            // totalStrings must equal the sum of all strings across groups
            const sumStrings = groups.reduce(
              (n, g) => n + (g["strings"] as unknown[]).length,
              0,
            );
            expect(sumStrings).toBe(body["totalStrings"]);
          });
        }
      });
    }
  });

  // ── 4d. Out-of-range combiner ID → 404 ───────────────────────────────────
  describe("invalid combiner IDs → 404", () => {
    const plant = PLANTS[0]!;
    const count = combinerCount(plant.inverterCount);

    const badIds: [string, string][] = [
      [`${plant.id}-comb-${count}`, "index == combinerCount (out of range)"],
      [`${plant.id}-comb-9999`, "index far out of range"],
      [`${plant.id}-comb-abc`, "non-numeric suffix"],
      [`${plant.id}-comb-0x1`, "hex suffix"],
      [`${plant.id}-comb-`, "blank suffix"],
      [`wrong-prefix-comb-0`, "wrong plant prefix"],
    ];

    for (const [badId, reason] of badIds) {
      it(`returns 404 for "${badId}" (${reason})`, async () => {
        const res = await withAuth(
          request(app).get(`/api/plants/${plant.id}/combiners/${badId}/strings`),
        ).expect(404);

        expect(res.body).toMatchObject({ error: "not_found" });
      });
    }
  });
});
