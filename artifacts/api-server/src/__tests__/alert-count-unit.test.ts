/**
 * Unit tests for alertCounts.ts (Task #66)
 *
 * Verifies that activeAlertCountsByPlant and activeAlertCountsForPlant
 * correctly aggregate the rows returned by the database:
 *
 *   • Empty result → empty map / zeroed counts.
 *   • Single and multiple alerts per plant are summed correctly.
 *   • Alerts for different plants are kept in separate buckets.
 *   • Rows with unrecognised severity values are silently ignored
 *     (avoids inflating any counter on bad data).
 *   • All four severity keys are always present in every map entry.
 *
 * What this layer cannot test
 * ───────────────────────────
 * The SQL WHERE clause that restricts results to active statuses
 * (open / acknowledged / assigned) and to a specific orgId lives inside
 * the Drizzle query built by activeAlertCountsByPlant. Because the DB is
 * mocked here, that filtering is covered by the HTTP integration tests in
 * alert-count-accuracy.test.ts which spy on the call arguments.
 */

// ── 1. Hoisted mutable store — lets each test inject different rows ───────────
const alertRows = vi.hoisted(
  () => ({ current: [] as Array<{ plantId: string; severity: string }> }),
);

// ── 2. Mock @workspace/db BEFORE any imports ──────────────────────────────────
vi.mock("@workspace/db", () => {
  function makeChain(rows: unknown[]) {
    return Object.assign(Promise.resolve(rows), {
      from:  () => makeChain(rows),
      where: () => makeChain(rows),
      limit: (n: number) => Promise.resolve((rows as unknown[]).slice(0, n)),
    });
  }
  return {
    db: {
      select: () => makeChain(alertRows.current),
      insert: () => makeChain([]),
      update: () => makeChain([]),
      delete: () => makeChain([]),
    },
    alertsTable: {},
    usersTable:  {},
    rolesTable:  {},
  };
});

// ── 3. Imports ────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  activeAlertCountsByPlant,
  activeAlertCountsForPlant,
  ACTIVE_STATUSES,
} from "../lib/alertCounts";

// ── activeAlertCountsByPlant ──────────────────────────────────────────────────

describe("activeAlertCountsByPlant", () => {
  beforeEach(() => {
    alertRows.current = [];
  });

  it("returns an empty map when no alerts exist", async () => {
    const result = await activeAlertCountsByPlant("org-1");
    expect(result.size).toBe(0);
  });

  it("returns an empty map when called with null orgId and no rows", async () => {
    const result = await activeAlertCountsByPlant(null);
    expect(result.size).toBe(0);
  });

  it("counts a single critical alert for one plant", async () => {
    alertRows.current = [{ plantId: "plant-thar", severity: "critical" }];
    const result = await activeAlertCountsByPlant("org-1");
    const counts = result.get("plant-thar")!;
    expect(counts).toBeDefined();
    expect(counts.critical).toBe(1);
    expect(counts.major).toBe(0);
    expect(counts.minor).toBe(0);
    expect(counts.informational).toBe(0);
  });

  it("counts a single major alert", async () => {
    alertRows.current = [{ plantId: "p1", severity: "major" }];
    const result = await activeAlertCountsByPlant("org-1");
    expect(result.get("p1")!.major).toBe(1);
    expect(result.get("p1")!.critical).toBe(0);
  });

  it("counts a single minor alert", async () => {
    alertRows.current = [{ plantId: "p1", severity: "minor" }];
    const result = await activeAlertCountsByPlant("org-1");
    expect(result.get("p1")!.minor).toBe(1);
  });

  it("counts a single informational alert", async () => {
    alertRows.current = [{ plantId: "p1", severity: "informational" }];
    const result = await activeAlertCountsByPlant("org-1");
    expect(result.get("p1")!.informational).toBe(1);
  });

  it("accumulates multiple alerts of the same severity for one plant", async () => {
    alertRows.current = [
      { plantId: "p1", severity: "critical" },
      { plantId: "p1", severity: "critical" },
      { plantId: "p1", severity: "critical" },
    ];
    const result = await activeAlertCountsByPlant("org-1");
    expect(result.get("p1")!.critical).toBe(3);
  });

  it("accumulates mixed severities for one plant", async () => {
    alertRows.current = [
      { plantId: "p1", severity: "critical" },
      { plantId: "p1", severity: "critical" },
      { plantId: "p1", severity: "major" },
      { plantId: "p1", severity: "informational" },
    ];
    const result = await activeAlertCountsByPlant("org-1");
    const c = result.get("p1")!;
    expect(c.critical).toBe(2);
    expect(c.major).toBe(1);
    expect(c.minor).toBe(0);
    expect(c.informational).toBe(1);
  });

  it("keeps separate counts for distinct plants", async () => {
    alertRows.current = [
      { plantId: "plant-a", severity: "critical" },
      { plantId: "plant-b", severity: "major" },
      { plantId: "plant-b", severity: "minor" },
    ];
    const result = await activeAlertCountsByPlant("org-1");
    expect(result.size).toBe(2);
    expect(result.get("plant-a")).toMatchObject({ critical: 1, major: 0, minor: 0, informational: 0 });
    expect(result.get("plant-b")).toMatchObject({ critical: 0, major: 1, minor: 1, informational: 0 });
  });

  it("does not create entries for plants that have no matching alerts", async () => {
    alertRows.current = [{ plantId: "plant-a", severity: "critical" }];
    const result = await activeAlertCountsByPlant("org-1");
    expect(result.has("plant-b")).toBe(false);
  });

  it("silently ignores rows with unknown severity values", async () => {
    alertRows.current = [
      { plantId: "p1", severity: "critical" },
      { plantId: "p1", severity: "RESOLVED" },    // not in allowlist
      { plantId: "p1", severity: "closed" },       // not in allowlist
      { plantId: "p1", severity: "" },             // empty string
    ];
    const result = await activeAlertCountsByPlant("org-1");
    const c = result.get("p1")!;
    // Only the "critical" row should have been counted
    expect(c.critical).toBe(1);
    expect(c.major + c.minor + c.informational).toBe(0);
  });

  it("every map entry has all four severity keys", async () => {
    alertRows.current = [{ plantId: "p1", severity: "minor" }];
    const result = await activeAlertCountsByPlant("org-1");
    const c = result.get("p1")!;
    expect(c).toHaveProperty("critical");
    expect(c).toHaveProperty("major");
    expect(c).toHaveProperty("minor");
    expect(c).toHaveProperty("informational");
    expect(typeof c.critical).toBe("number");
    expect(typeof c.major).toBe("number");
    expect(typeof c.minor).toBe("number");
    expect(typeof c.informational).toBe("number");
  });
});

// ── ACTIVE_STATUSES constant — the SQL filter contract ────────────────────────
//
// The DB WHERE clause that excludes resolved/closed alerts is built from this
// constant.  Verifying it here ensures that a refactor cannot accidentally
// add "resolved" or "closed" to the active set, or drop one of the three
// required statuses, without a failing test.
//
// NOTE: The WHERE clause itself is tested at the SQL level by the constant;
// the DB is mocked in these unit tests so only the row-aggregation path is
// exercised end-to-end.  A future task with a real test DB could cover the
// full query path.

describe("ACTIVE_STATUSES — status filter contract", () => {
  it("includes exactly the three statuses that count as active", () => {
    const statuses = [...ACTIVE_STATUSES];
    expect(statuses).toContain("open");
    expect(statuses).toContain("acknowledged");
    expect(statuses).toContain("assigned");
    expect(statuses).toHaveLength(3);
  });

  it("does NOT include statuses that should be excluded from counts", () => {
    const statuses: string[] = [...ACTIVE_STATUSES];
    expect(statuses).not.toContain("resolved");
    expect(statuses).not.toContain("closed");
    expect(statuses).not.toContain("dismissed");
    expect(statuses).not.toContain("suppressed");
  });

  it("all entries are non-empty strings", () => {
    for (const s of ACTIVE_STATUSES) {
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(0);
    }
  });
});

// ── activeAlertCountsForPlant ─────────────────────────────────────────────────

describe("activeAlertCountsForPlant", () => {
  beforeEach(() => {
    alertRows.current = [];
  });

  it("returns zero counts when no alerts exist", async () => {
    const counts = await activeAlertCountsForPlant("plant-x");
    expect(counts).toEqual({ critical: 0, major: 0, minor: 0, informational: 0 });
  });

  it("accumulates counts from multiple rows", async () => {
    alertRows.current = [
      { plantId: "plant-x", severity: "critical" },
      { plantId: "plant-x", severity: "major" },
      { plantId: "plant-x", severity: "major" },
    ];
    const counts = await activeAlertCountsForPlant("plant-x");
    expect(counts.critical).toBe(1);
    expect(counts.major).toBe(2);
    expect(counts.minor).toBe(0);
    expect(counts.informational).toBe(0);
  });

  it("ignores unknown severity values", async () => {
    alertRows.current = [
      { plantId: "plant-x", severity: "critical" },
      { plantId: "plant-x", severity: "not_a_severity" },
    ];
    const counts = await activeAlertCountsForPlant("plant-x");
    expect(counts.critical).toBe(1);
    expect(counts.major + counts.minor + counts.informational).toBe(0);
  });
});
