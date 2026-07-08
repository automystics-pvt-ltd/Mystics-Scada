---
name: Plant drill-down hierarchy (frontend)
description: Zone/Array grouping logic, health score formula, and control room mode implementation details.
---

# Plant Drill-Down Hierarchy

## Grouping rules
- **Zone** = every 5 consecutive inverters → Zone A (inv 0-4), Zone B (inv 5-9), …
- **Array** = every 4 consecutive strings within an inverter → Array 1 (str 0-3), Array 2 (str 4-7), …
- Both groupings are computed purely client-side from `inverterCount` and `stringsPerInverter`; no API changes needed.

## String count per plant (not in API response)
Stored in `src/lib/plantHierarchy.ts` as `PLANT_STRINGS_PER_INVERTER` map. Avoids API schema change.
- plant-thar: 20 · plant-sundarbans: 16 · plant-deccan: 14 · plant-coastal: 18

## Health Score formula (plantHierarchy.ts)
`score = min(40, pr/85×40) + min(30, avail/100×30) + max(0, 20 − crit×5 − maj×2) + 10`
All inputs normalised (availability capped at 100 before weighting); output clamped to 0-100.

## Hook signature: string readings
`useListStringReadings(inverterId, options)` — NOT `(plantId, inverterId, options)`.
`getListStringReadingsQueryKey(inverterId)` — 1 arg only.

## Control Room Mode
- `ControlRoomProvider` wraps the whole app (outside QueryClientProvider but inside ThemeProvider)
- Esc key exits; `isActive` controls data fetching (enabled: isActive guards)
- Auto-cycle: `setInterval(30s)` advances `activePlantIdx` in context
- Overlay uses inline `<style>` for `@keyframes cr-ticker` and `cr-progress`

## Route order (wouter — specific before catch-all)
Array detail must come before arrays which comes before zone detail which comes before zones list — otherwise partial matches win.
```
/plants/:id/zones/:zoneId/arrays/:arrayId  ← first
/plants/:id/zones/:zoneId/arrays
/plants/:id/zones/:zoneId
/plants/:id/zones
```

## ArrayCard polling issue (known, tracked)
Each `ArrayCard` in `plant-zone-arrays.tsx` subscribes to `useListStringReadings(inverterId)` — React Query deduplicates network calls but creates per-card subscriptions. Refactor to fetch once in parent and pass sliced strings as prop.
**Why:** medium perf issue flagged in code review; acceptable at current scale.
