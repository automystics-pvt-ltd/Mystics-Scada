---
name: Recharts 2.x + React 19 ref incompatibility
description: Recharts 2.x crashes React 19 at runtime; replace with pure SVG. xSubset helper must return {label,idx} pairs, not raw strings, to avoid duplicate-label tick-placement bugs.
---

## Rule
Do not use recharts in a React 19 app. Replace all chart usage with pure SVG. When building an xSubset helper for chart axis labels, return `{label: string; idx: number}[]` so tick placement uses the original array index, not a potentially-wrong `indexOf` lookup.

**Why:**
recharts 2.x (including 2.15.4) uses `React.createRef()` on internal `<path>` SVG elements. React 19 enforces stricter ref validation — refs must be a function, a createRef/useRef object, or null/undefined. This causes an unhandled runtime error:

> "Expected ref to be a function, an object returned by React.createRef(), or undefined/null."

The crash also propagates as "Invalid hook call" and only manifests when recharts renders with real data after an HMR reconnect or fresh page load — not always on first render, making it intermittent and hard to reproduce.

**Secondary issue:** any `xSubset(labels)` helper that returns raw strings causes `labels.indexOf(lbl)` to silently return the wrong index when duplicate label strings exist (e.g., two time series entries at the same hour). Fix: return `{label, idx}[]` and use `idx` directly for `mapX()`.

**How to apply:**
- Replace all recharts components with pure SVG. See `svg-charts.tsx` for `SvgAreaChart`, `SvgComposedChart`, `SvgLineChart`, `MiniBarChart`, `MiniAreaChart`, `MiniLineChart`.
- Delete any shadcn/ui `chart.tsx` (which wraps recharts) — even if unused, Vite's optimizer may scan it and pre-bundle recharts into the browser bundle.
- In every pure-SVG axis label renderer, destructure `{label, idx}` from `xSubset`; never call `indexOf` on the label list.
- Flat/constant-value data in a sparkline must render at mid-height: `range === 0 ? H * 0.5 : H - ((v - min) / range) * scale`.
