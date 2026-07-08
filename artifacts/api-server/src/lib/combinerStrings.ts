/**
 * Domain helper: aggregate all strings across every inverter that feeds
 * a given combiner box, grouped by inverter.
 */

import {
  type PlantConfig,
  inverterId,
  inverterHealth,
  stringReadings as rawStringReadings,
} from "./simulation";

/** Parse the zero-based combiner index from an ID like "plant-thar-comb-2". */
export function combinerIndexFromId(combinerId: string): number {
  const parts = combinerId.split("-comb-");
  return parts.length === 2 ? Number.parseInt(parts[1] ?? "0", 10) : 0;
}

export interface CombinerStringGroup {
  inverterId: string;
  inverterName: string;
  inverterStatus: string;
  strings: {
    id: string;
    label: string;
    currentA: number;
    voltageV: number;
    /** "on" | "off" */
    status: string;
    isDeviating: boolean;
    deviationPct: number;
    medianCurrentA: number;
  }[];
}

export interface CombinerStringsPayload {
  combinerId: string;
  combinerLabel: string;
  plantId: string;
  totalStrings: number;
  faultingStrings: number;
  inverterGroups: CombinerStringGroup[];
}

export function combinerStrings(
  plant: PlantConfig,
  combinerId: string,
  now: Date,
): CombinerStringsPayload {
  const combinerCount = Math.max(2, Math.ceil(plant.inverterCount / 4));
  const combinerIndex = combinerIndexFromId(combinerId);
  const combinerLabel = `Combiner Box ${combinerIndex + 1}`;

  // Inverter i belongs to combiner i % combinerCount
  const groups: CombinerStringGroup[] = [];
  let totalStrings = 0;
  let faultingStrings = 0;

  for (let i = 0; i < plant.inverterCount; i++) {
    if (i % combinerCount !== combinerIndex) continue;

    const invId = inverterId(plant.id, i);
    const { status } = inverterHealth(plant, i, now);
    const readings = rawStringReadings(plant, i, now);

    // Re-compute median for this inverter's string set
    const currents = readings.map((r) => r.currentA).sort((a, b) => a - b);
    const median = currents[Math.floor(currents.length / 2)] ?? 0;

    const strings = readings.map((r) => {
      const deviation =
        median > 0 ? Math.round(((r.currentA - median) / median) * 1000) / 10 : 0;
      const isDeviating = Math.abs(deviation) > 15;
      if (r.status !== "normal" || isDeviating) faultingStrings++;
      totalStrings++;
      return {
        id: r.stringId,
        label: r.label,
        currentA: r.currentA,
        voltageV: r.voltageV,
        status: r.currentA > 0.01 ? ("on" as const) : ("off" as const),
        isDeviating,
        deviationPct: deviation,
        medianCurrentA: Math.round(median * 100) / 100,
      };
    });

    groups.push({
      inverterId: invId,
      inverterName: `Inverter ${i + 1}`,
      inverterStatus: status,
      strings,
    });
  }

  return {
    combinerId,
    combinerLabel,
    plantId: plant.id,
    totalStrings,
    faultingStrings,
    inverterGroups: groups,
  };
}
