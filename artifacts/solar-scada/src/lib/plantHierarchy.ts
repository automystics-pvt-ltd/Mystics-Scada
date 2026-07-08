/**
 * Client-side plant hierarchy helpers.
 * All groupings are derived purely from inverterCount / stringsPerInverter
 * so no extra API calls are needed.
 */

export interface Zone {
  id: string;          // "zone-a", "zone-b"
  name: string;        // "Zone A", "Zone B"
  letter: string;      // "A", "B"
  startIdx: number;
  endIdx: number;
  inverterIndices: number[];
  inverterIds: string[];
}

export interface InverterArray {
  id: string;          // "{inverterId}-arr-{n}"
  name: string;        // "Array 1", "Array 2"
  startStringIdx: number;
  endStringIdx: number;
  stringIndices: number[];
}

/** Number of inverters per zone. */
const ZONE_SIZE = 5;
/** Number of strings per array. */
const ARRAY_SIZE = 4;

/**
 * Derive the zone list for a plant from its inverter count.
 * Zone A = inverters 0–4, Zone B = inverters 5–9, …
 */
export function getPlantZones(inverterCount: number, plantId: string): Zone[] {
  const count = Math.ceil(inverterCount / ZONE_SIZE);
  return Array.from({ length: count }, (_, z) => {
    const start = z * ZONE_SIZE;
    const end = Math.min(start + ZONE_SIZE - 1, inverterCount - 1);
    const indices = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const letter = String.fromCharCode(65 + z); // A, B, C…
    return {
      id: `zone-${letter.toLowerCase()}`,
      name: `Zone ${letter}`,
      letter,
      startIdx: start,
      endIdx: end,
      inverterIndices: indices,
      inverterIds: indices.map((i) => `${plantId}-inv-${i}`),
    };
  });
}

/**
 * Parse a zoneId like "zone-a" → zone index 0, "zone-b" → 1 …
 */
export function zoneIdToIndex(zoneId: string): number {
  const letter = zoneId.replace("zone-", "");
  return letter.charCodeAt(0) - 97; // 'a' = 0
}

/**
 * Derive array groupings for an inverter from its string count.
 * Array 1 = strings 0–3, Array 2 = strings 4–7, …
 */
export function getInverterArrays(stringsPerInverter: number, inverterId: string): InverterArray[] {
  const count = Math.ceil(stringsPerInverter / ARRAY_SIZE);
  return Array.from({ length: count }, (_, a) => {
    const start = a * ARRAY_SIZE;
    const end = Math.min(start + ARRAY_SIZE - 1, stringsPerInverter - 1);
    return {
      id: `${inverterId}-arr-${a}`,
      name: `Array ${a + 1}`,
      startStringIdx: start,
      endStringIdx: end,
      stringIndices: Array.from({ length: end - start + 1 }, (_, s) => start + s),
    };
  });
}

/**
 * Parse an arrayId like "{inverterId}-arr-{n}" into its parts.
 * inverterId format: "{plantId}-inv-{idx}"
 */
export function parseArrayId(arrayId: string): { inverterId: string; arrayIndex: number } | null {
  const match = arrayId.match(/^(.+)-arr-(\d+)$/);
  if (!match) return null;
  return { inverterId: match[1]!, arrayIndex: parseInt(match[2]!, 10) };
}

/**
 * Weighted Plant Health Score (0–100).
 * PR 40% | Availability 30% | Fault impact 20% | Base 10%
 */
export function computeHealthScore(
  pr: number,
  availabilityPct: number,
  alertCounts: { critical: number; major: number },
): number {
  const prScore = Math.min(40, (Math.max(0, pr) / 85) * 40);
  // Cap availability at 100 before weighting to keep the 30-pt max strict
  const availScore = (Math.min(100, Math.max(0, availabilityPct)) / 100) * 30;
  const faultScore = Math.max(0, 20 - alertCounts.critical * 5 - alertCounts.major * 2);
  const baseScore = 10;
  return Math.min(100, Math.max(0, Math.round(prScore + availScore + faultScore + baseScore)));
}

/** Score → colour */
export function healthScoreColor(score: number): string {
  if (score >= 80) return "hsl(142 71% 45%)";
  if (score >= 60) return "hsl(45 93% 47%)";
  if (score >= 40) return "hsl(38 92% 50%)";
  return "hsl(0 84% 60%)";
}

/** Score → label */
export function healthScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Poor";
}

/** Per-plant string count — derived from simulation config. Avoids requiring an API schema change. */
export const PLANT_STRINGS_PER_INVERTER: Record<string, number> = {
  "plant-thar":       20,
  "plant-sundarbans": 16,
  "plant-deccan":     14,
  "plant-coastal":    18,
};

export function getStringsPerInverter(plantId: string): number {
  return PLANT_STRINGS_PER_INVERTER[plantId] ?? 16;
}

/** Synthetic 24-point sparkline from a capacity+status seed (no extra API call). */
export function syntheticSparkline(capacityKw: number, prPct: number): { v: number }[] {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  return Array.from({ length: 24 }, (_, h) => {
    const solar = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
    const jitter = (Math.sin(capacityKw + h * 7) + 1) / 2;
    const v = h <= hour ? solar * capacityKw * (prPct / 100) * (0.85 + jitter * 0.12) : 0;
    return { v: Math.round(v) };
  });
}
