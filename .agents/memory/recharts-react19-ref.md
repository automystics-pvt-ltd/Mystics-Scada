---
name: Recharts 2.x + React 19 ref incompatibility
description: recharts 2.x uses legacy React.createRef() on internal <path> SVG elements, triggering React 19's strict ref validation when combined with Vite HMR reconnects.
---

## Rule
Never use recharts `<AreaChart>` / `<ResponsiveContainer>` on pages that render many chart instances simultaneously. Replace with pure SVG for sparklines.

**Why:** recharts 2.x (including 2.15.4) uses `React.createRef()` patterns internally on `<path>` SVG elements. React 19 enforces stricter ref validation — refs must be a function, a createRef/useRef object, or null/undefined. After Vite HMR reconnects create a stale module boundary, recharts' internal ref callbacks arrive with an invalid value, triggering:
- "Expected ref to be a function, an object returned by React.createRef(), or undefined/null." (unhandled error on `<path>`)
- "Invalid hook call." (React diagnostic that fires alongside the ref error)

The bug is intermittent because it only manifests when recharts first renders with real data AFTER multiple HMR reconnects — not on every render.

**Secondary bug fixed at the same time:** Inline sparklines with hardcoded `<linearGradient id="ps">` across multiple SVG elements collide in the DOM (same ID rendered 4+ times).

**How to apply:**
- For simple area/sparkline charts: implement as pure SVG (`<polyline>` + `<path>` for fill area). Compute min/max from the data array, map to SVG coordinates, generate a unique gradient ID per color variant.
- If recharts is unavoidable (complex chart types), wrap it in an error boundary and add `recharts` to `vite.config.ts → optimizeDeps.include` to prevent HMR boundary separation.
- The fix is in `artifacts/solar-scada/src/pages/portfolio.tsx` — `_Sparkline` is now a pure SVG component.
