---
name: AI Insights Engine Architecture
description: How the rule-based insights engine works — rules, IDs, dismissal, and org scoping.
---

# AI Insights Engine

## Rule activation
All rules except `health_decline` are irradiance-gated (require >200–300 W/m²). At nighttime (IST ~18:30–06:00), only the health_decline rule fires. This is intentional — irradiance-dependent rules would produce false positives at low light. See task #43 for a planned cache to show last daytime findings overnight.

## Insight IDs
IDs are day-scoped: `${type}__${plantId}__${deviceId ?? 'plant'}__${YYYY-MM-DD}`. This means:
- Dismissed insights expire at midnight (reappear next day)
- Same condition on the same day always produces the same ID (stable)
- **Why day-scoped and not stable forever:** prevents permanent suppression of real recurring faults

## Dismissal storage
Dismissals stored in `usersTable.userPreferences.dismissedInsights: string[]`. Shape defined in `artifacts/api-server/src/lib/userPreferences.ts`. Dismiss endpoints are under `/org/` so `requireOrgScopeForWrites` exempts them.

## Work order creation security
`POST /org/insights/:id/work-order` requires `maintenance.manage` permission. plantId is validated server-side against org's plants (rejects cross-tenant IDs). Plant name is derived server-side — client-supplied name is ignored.

## Performance
Engine runs synchronously over all org plants (~4 plants × 20 inverters = 80 inverters max). Acceptable for current scale. The `inverterTrend('hour', now)` call is the most expensive (60 points per inverter). Cap at 2–3 inverters per rule.

## Route locations
- GET /insights, GET /insights/summary → `artifacts/api-server/src/routes/insights.ts`
- Engine logic → `artifacts/api-server/src/lib/insightsEngine.ts`
- Dismiss/WO under /org/** for middleware compliance
