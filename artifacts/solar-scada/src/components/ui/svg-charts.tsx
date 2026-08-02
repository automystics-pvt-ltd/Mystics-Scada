/**
 * Pure SVG chart components — drop-in replacements for Recharts.
 * No external refs, no createRef(): fully compatible with React 19.
 */
import { useEffect, useMemo, useState } from "react";

// ─── Internal layout ──────────────────────────────────────────────────────────

const VW = 400;  // internal viewBox width
const VH = 200;  // internal viewBox height for full charts

interface Pad { top: number; right: number; bottom: number; left: number }

const FULL_PAD: Pad  = { top: 10, right: 8,  bottom: 30, left: 46 };
const MINI_PAD: Pad  = { top: 4,  right: 2,  bottom: 22, left: 32 };

// ─── Shared helpers ───────────────────────────────────────────────────────────

function plotBox(pad: Pad, W = VW, H = VH) {
  return {
    x0: pad.left,
    y0: pad.top,
    w:  W - pad.left - pad.right,
    h:  H - pad.top  - pad.bottom,
  };
}

function yRange(data: Record<string, unknown>[], keys: string[]): [number, number] {
  const vals = data.flatMap((d) =>
    keys.map((k) => (d[k] != null ? Number(d[k]) : NaN)),
  ).filter(isFinite);
  if (vals.length === 0) return [0, 1];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return lo === hi ? [lo - 1, hi + 1] : [Math.min(0, lo), hi * 1.05];
}

function mapY(v: number, lo: number, hi: number, y0: number, h: number) {
  return y0 + h - ((v - lo) / (hi - lo)) * h;
}

function mapX(i: number, n: number, x0: number, w: number) {
  return x0 + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
}

function barX(i: number, n: number, x0: number, w: number, barW: number) {
  const step = w / n;
  return x0 + i * step + (step - barW) / 2;
}

function yTicks(lo: number, hi: number, count = 4): number[] {
  const step = (hi - lo) / (count - 1);
  return Array.from({ length: count }, (_, i) => lo + i * step);
}

/** Returns index-stable {label, idx} pairs so tick placement is always correct,
 *  even when the label list contains duplicate strings. */
function xSubset(labels: string[], maxCount = 6): { label: string; idx: number }[] {
  const all = labels.map((label, idx) => ({ label, idx }));
  if (all.length <= maxCount) return all;
  const step = Math.ceil(all.length / (maxCount - 1));
  return all
    .filter(({ idx }) => idx === 0 || idx % step === 0 || idx === all.length - 1)
    .slice(0, maxCount);
}

function fmtNum(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`;
  if (Math.abs(v) >= 10)   return v.toFixed(0);
  return v.toFixed(1);
}

// ─── Gradient defs helper ─────────────────────────────────────────────────────

function AreaGrad({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%"  stopColor={color} stopOpacity={0.28} />
      <stop offset="95%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  );
}

// ─── Axes ─────────────────────────────────────────────────────────────────────

function Axes({
  pad, labels, lo, hi, yFmt, W = VW, H = VH,
}: {
  pad: Pad; labels: string[]; lo: number; hi: number;
  yFmt?: (v: number) => string; W?: number; H?: number;
}) {
  const { x0, y0, w, h } = plotBox(pad, W, H);
  const ticks   = yTicks(lo, hi);
  const xLabels = xSubset(labels);
  const fmt     = yFmt ?? fmtNum;

  return (
    <g>
      {/* Gridlines */}
      {ticks.map((t) => {
        const y = mapY(t, lo, hi, y0, h);
        return (
          <line key={t} x1={x0} x2={x0 + w} y1={y} y2={y}
            stroke="hsl(var(--border))" strokeOpacity={0.5} strokeDasharray="3 3" />
        );
      })}
      {/* Y-axis labels */}
      {ticks.map((t) => {
        const y = mapY(t, lo, hi, y0, h);
        return (
          <text key={t} x={x0 - 4} y={y + 4} textAnchor="end"
            fontSize={9} fill="hsl(var(--muted-foreground))">
            {fmt(t)}
          </text>
        );
      })}
      {/* X-axis labels — use pre-computed idx to avoid indexOf duplicate-label bugs */}
      {xLabels.map(({ label, idx }) => {
        const x = mapX(idx, labels.length, x0, w);
        return (
          <text key={idx} x={x} y={y0 + h + 14} textAnchor="middle"
            fontSize={9} fill="hsl(var(--muted-foreground))">
            {label}
          </text>
        );
      })}
    </g>
  );
}

// ─── SvgAreaChart ─────────────────────────────────────────────────────────────

export interface AreaSeries {
  key: string; name: string; color: string; dashed?: boolean;
}

export interface AreaTooltipExtra {
  key: string; name: string; color?: string;
  fmt?: (v: number) => string;
}

export function SvgAreaChart({
  data, xKey, series, height = 180, yFmt, tooltipFmt, tooltipExtras, refX,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: AreaSeries[];
  height?: number;
  yFmt?: (v: number) => string;
  /** Separate formatter used only inside the hover tooltip (defaults to 2 d.p.). */
  tooltipFmt?: (v: number) => string;
  /** Extra data rows shown in the hover tooltip but not rendered as chart lines. */
  tooltipExtras?: AreaTooltipExtra[];
  refX?: string;  // vertical reference line at this x label
}) {
  const H      = VH;
  const pad    = FULL_PAD;
  const { x0, y0, w, h } = plotBox(pad);
  const labels = data.map((d) => String(d[xKey] ?? ""));
  const [lo, hi] = useMemo(() => yRange(data, series.map((s) => s.key)), [data, series]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Dismiss tooltip on any touch — capture phase fires before any child stopPropagation.
  // The hit-rect handler then re-sets to the correct index in the same event flush.
  useEffect(() => {
    const dismiss = () => setHoveredIdx(null);
    document.addEventListener("touchstart", dismiss, { capture: true });
    return () => document.removeEventListener("touchstart", dismiss, { capture: true });
  }, []);

  // Tooltip uses its own precise formatter; axis labels use the coarser yFmt.
  const ttFmt = tooltipFmt ?? ((v: number) => v.toFixed(2));
  const step  = data.length > 0 ? w / data.length : w;

  // ── Tooltip content ────────────────────────────────────────────────────────
  const hoveredData = hoveredIdx !== null ? (data[hoveredIdx] ?? null) : null;
  const ttW = 140; const ttPad = 8; const ttLineH = 13;

  const tooltipContent = useMemo(() => {
    if (hoveredData == null) return null;
    const label = String(hoveredData[xKey] ?? "");
    const rows: { name: string; color: string; value: string }[] = [
      ...series.map((s) => ({
        name: s.name,
        color: s.color,
        value: ttFmt(Number(hoveredData[s.key] ?? 0)),
      })),
      ...(tooltipExtras ?? []).map((e) => ({
        name: e.name,
        color: e.color ?? "hsl(var(--muted-foreground))",
        value: (e.fmt ?? ttFmt)(Number(hoveredData[e.key] ?? 0)),
      })),
    ];
    return { label, rows };
  }, [hoveredData, xKey, series, ttFmt, tooltipExtras]);

  if (data.length === 0) return null;

  return (
    <svg viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height }} aria-hidden
      onMouseLeave={() => setHoveredIdx(null)}>
      <defs>
        {series.map((s) => <AreaGrad key={s.key} id={`area-${s.key}`} color={s.color} />)}
      </defs>
      <Axes pad={pad} labels={labels} lo={lo} hi={hi} yFmt={yFmt} />

      {/* Reference vertical line */}
      {refX && (() => {
        const idx = labels.indexOf(refX);
        if (idx < 0) return null;
        const x = mapX(idx, labels.length, x0, w);
        return (
          <g key="refx">
            <line x1={x} x2={x} y1={y0} y2={y0 + h}
              stroke="hsl(var(--primary))" strokeOpacity={0.5} strokeDasharray="4 2" />
            <text x={x + 2} y={y0 + 8} fontSize={8} fill="hsl(var(--muted-foreground))">Now</text>
          </g>
        );
      })()}

      {/* Series */}
      {series.map((s) => {
        const pts = data.map((d, i) => ({
          x: mapX(i, data.length, x0, w),
          y: mapY(Number(d[s.key] ?? 0), lo, hi, y0, h),
        }));
        const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        const area = `${line} L${pts[pts.length - 1]!.x.toFixed(1)},${(y0 + h).toFixed(1)} L${x0.toFixed(1)},${(y0 + h).toFixed(1)} Z`;
        return (
          <g key={s.key}>
            <path d={area} fill={`url(#area-${s.key})`} />
            <path d={line} fill="none" stroke={s.color}
              strokeWidth={s.dashed ? 1.5 : 2}
              strokeDasharray={s.dashed ? "5 3" : undefined} />
          </g>
        );
      })}

      {/* Hover hit-areas — transparent full-height column rects */}
      {data.map((_, i) => (
        <rect key={`hit-${i}`}
          x={x0 + i * step} y={y0} width={step} height={h}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onMouseEnter={() => setHoveredIdx(i)}
          onTouchStart={() => setHoveredIdx(i)}
        />
      ))}

      {/* Tooltip overlay */}
      {hoveredIdx !== null && tooltipContent && (() => {
        const { label, rows } = tooltipContent;
        const ttH = ttPad * 2 + 12 + rows.length * ttLineH + 2;
        // Center the guide on the actual data point x position
        const ptX = mapX(hoveredIdx, data.length, x0, w);

        // Flip left when in the right half of the plot area
        const ttX = ptX > x0 + w / 2
          ? ptX - ttW - 6
          : ptX + 6;
        const ttY = Math.max(y0 + 2, y0 + h / 2 - ttH / 2);

        return (
          <g key="tt" style={{ pointerEvents: "none" }}>
            {/* Vertical guide */}
            <line x1={ptX} x2={ptX} y1={y0} y2={y0 + h}
              stroke="hsl(var(--border))" strokeOpacity={0.7} strokeDasharray="3 2" />
            {/* Dot on each series line */}
            {series.map((s) => {
              const cy = mapY(Number(data[hoveredIdx]?.[s.key] ?? 0), lo, hi, y0, h);
              return (
                <circle key={s.key} cx={ptX} cy={cy} r={3}
                  fill={s.color} stroke="hsl(var(--background))" strokeWidth={1.5} />
              );
            })}
            {/* Box shadow (faux drop-shadow) */}
            <rect x={ttX + 1} y={ttY + 1} width={ttW} height={ttH}
              fill="hsl(var(--background))" rx={2} opacity={0.3} />
            {/* Box */}
            <rect x={ttX} y={ttY} width={ttW} height={ttH}
              fill="hsl(var(--background))" stroke="hsl(var(--border))"
              strokeWidth={0.6} rx={2} opacity={0.97} />
            {/* Time label */}
            <text x={ttX + ttPad} y={ttY + ttPad + 8}
              fontSize={8.5} fontWeight="700" fontFamily="monospace"
              fill="hsl(var(--foreground))">{label}</text>
            {/* Divider */}
            <line x1={ttX + ttPad} x2={ttX + ttW - ttPad}
              y1={ttY + ttPad + 13} y2={ttY + ttPad + 13}
              stroke="hsl(var(--border))" strokeOpacity={0.5} />
            {/* Series rows */}
            {rows.map((row, ri) => {
              const ry = ttY + ttPad + 22 + ri * ttLineH;
              return (
                <g key={ri}>
                  <rect x={ttX + ttPad} y={ry - 5} width={6} height={6}
                    fill={row.color} rx={1} />
                  <text x={ttX + ttPad + 10} y={ry}
                    fontSize={7.5} fontFamily="monospace"
                    fill="hsl(var(--muted-foreground))">{row.name}</text>
                  <text x={ttX + ttW - ttPad} y={ry}
                    fontSize={7.5} fontFamily="monospace" textAnchor="end"
                    fill="hsl(var(--foreground))">{row.value}</text>
                </g>
              );
            })}
          </g>
        );
      })()}
    </svg>
  );
}

// ─── SvgComposedChart (bars + lines) ─────────────────────────────────────────

export interface BarSpec  { key: string; name: string; color: string }
export interface LineSeries { key: string; name: string; color: string; dashed?: boolean }

export function SvgComposedChart({
  data, xKey, bars = [], lines = [], height = 280, yFmt, partialDataKey,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  bars?: BarSpec[];
  lines?: LineSeries[];
  height?: number;
  yFmt?: (v: number) => string;
  /** Name of a boolean field in each data row — when truthy that bar is rendered
   *  with a diagonal stripe to indicate an in-progress (partial) period. */
  partialDataKey?: string;
}) {
  const H      = VH;
  const pad    = FULL_PAD;
  const { x0, y0, w, h } = plotBox(pad);
  const labels  = data.map((d) => String(d[xKey] ?? ""));
  const allKeys = [...bars.map((b) => b.key), ...lines.map((l) => l.key)];
  const [lo, hi] = useMemo(() => yRange(data, allKeys), [data, allKeys]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Dismiss tooltip on any touch — capture phase fires before any child stopPropagation.
  // The hit-rect handler then re-sets to the correct index in the same event flush.
  useEffect(() => {
    const dismiss = () => setHoveredIdx(null);
    document.addEventListener("touchstart", dismiss, { capture: true });
    return () => document.removeEventListener("touchstart", dismiss, { capture: true });
  }, []);

  const barW   = data.length > 0 && bars.length > 0 ? Math.max(2, (w / data.length) * 0.6) : 0;
  const step   = data.length > 0 ? w / data.length : w;
  const fmt    = yFmt ?? fmtNum;

  // ── Tooltip content (must be before any early returns — Rules of Hooks) ───
  const hoveredData = hoveredIdx !== null ? (data[hoveredIdx] ?? null) : null;
  const ttW = 128;
  const ttPad = 8;
  const ttLineH = 13;

  const tooltipContent = useMemo(() => {
    if (hoveredData == null) return null;
    const label = String(hoveredData[xKey] ?? "");
    const rows: { name: string; color: string; value: string }[] = [
      ...bars.map((b) => ({
        name: b.name,
        color: b.color,
        value: fmt(Number(hoveredData[b.key] ?? 0)),
      })),
      ...lines.map((l) => ({
        name: l.name,
        color: l.color,
        value: fmt(Number(hoveredData[l.key] ?? 0)),
      })),
    ];
    // Performance ratio row (only when both bar and line are present)
    const actual   = bars[0]  ? Number(hoveredData[bars[0].key]  ?? 0) : 0;
    const expected = lines[0] ? Number(hoveredData[lines[0].key] ?? 0) : 0;
    if (expected > 0) {
      rows.push({
        name: "Perf Ratio",
        color: "hsl(var(--muted-foreground))",
        value: `${(actual / expected * 100).toFixed(1)}%`,
      });
    }
    return { label, rows };
  }, [hoveredData, xKey, bars, lines, fmt]);

  if (data.length === 0) return null;

  return (
    <svg viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height }} aria-hidden
      onMouseLeave={() => setHoveredIdx(null)}>
      <defs>
        {bars.map((b) => <AreaGrad key={b.key} id={`bar-grd-${b.key}`} color={b.color} />)}
        {/* Diagonal stripe pattern for partial (in-progress) bars */}
        {bars.map((b) => (
          <pattern key={`stripe-${b.key}`} id={`stripe-${b.key}`}
            patternUnits="userSpaceOnUse" width={6} height={6}
            patternTransform="rotate(45 0 0)">
            <rect width={3} height={6} fill={b.color} opacity={0.55} />
            <rect x={3} width={3} height={6} fill={b.color} opacity={0.2} />
          </pattern>
        ))}
      </defs>
      <Axes pad={pad} labels={labels} lo={lo} hi={hi} yFmt={yFmt} />

      {/* Bars */}
      {bars.map((b) =>
        data.map((d, i) => {
          const val     = Number(d[b.key] ?? 0);
          const bx      = barX(i, data.length, x0, w, barW);
          const by      = mapY(val, lo, hi, y0, h);
          const bh      = (y0 + h) - by;
          const isPartial = partialDataKey ? Boolean(d[partialDataKey]) : false;
          const baseOpacity = hoveredIdx === i ? 1 : 0.85;
          return (
            <g key={`${b.key}-${i}`}>
              <rect x={bx} y={by} width={barW} height={Math.max(0, bh)}
                fill={isPartial ? `url(#stripe-${b.key})` : b.color}
                rx={1} opacity={isPartial ? 1 : baseOpacity} />
              {/* Thin top border on partial bars to make them clearly visible */}
              {isPartial && bh > 1 && (
                <line x1={bx} x2={bx + barW} y1={by} y2={by}
                  stroke={b.color} strokeWidth={1.5} strokeOpacity={0.9} />
              )}
            </g>
          );
        })
      )}

      {/* Lines */}
      {lines.map((s) => {
        const pts = data.map((d, i) => ({
          x: mapX(i, data.length, x0, w),
          y: mapY(Number(d[s.key] ?? 0), lo, hi, y0, h),
        }));
        const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        return (
          <path key={s.key} d={line} fill="none" stroke={s.color}
            strokeWidth={s.dashed ? 1.5 : 2}
            strokeDasharray={s.dashed ? "5 3" : undefined} />
        );
      })}

      {/* Hover hit-areas — transparent full-height column rects */}
      {data.map((_, i) => (
        <rect key={`hit-${i}`}
          x={x0 + i * step} y={y0} width={step} height={h}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onMouseEnter={() => setHoveredIdx(i)}
          onTouchStart={() => setHoveredIdx(i)}
        />
      ))}

      {/* Tooltip overlay */}
      {hoveredIdx !== null && tooltipContent && (() => {
        const { label, rows } = tooltipContent;
        const ttH = ttPad * 2 + 12 + rows.length * ttLineH + 2;
        const colCx = x0 + hoveredIdx * step + step / 2;

        // Flip left when in the right half of the plot area
        const ttX = colCx > x0 + w / 2
          ? colCx - ttW - 6
          : colCx + 6;
        const ttY = Math.max(y0 + 2, y0 + h / 2 - ttH / 2);

        return (
          <g key="tt" style={{ pointerEvents: "none" }}>
            {/* Vertical guide */}
            <line x1={colCx} x2={colCx} y1={y0} y2={y0 + h}
              stroke="hsl(var(--border))" strokeOpacity={0.7} strokeDasharray="3 2" />
            {/* Box shadow (faux drop-shadow) */}
            <rect x={ttX + 1} y={ttY + 1} width={ttW} height={ttH}
              fill="hsl(var(--background))" rx={2} opacity={0.3} />
            {/* Box */}
            <rect x={ttX} y={ttY} width={ttW} height={ttH}
              fill="hsl(var(--background))" stroke="hsl(var(--border))"
              strokeWidth={0.6} rx={2} opacity={0.97} />
            {/* Date label */}
            <text x={ttX + ttPad} y={ttY + ttPad + 8}
              fontSize={8.5} fontWeight="700" fontFamily="monospace"
              fill="hsl(var(--foreground))">{label}</text>
            {/* Divider */}
            <line x1={ttX + ttPad} x2={ttX + ttW - ttPad}
              y1={ttY + ttPad + 13} y2={ttY + ttPad + 13}
              stroke="hsl(var(--border))" strokeOpacity={0.5} />
            {/* Series rows */}
            {rows.map((row, ri) => {
              const ry = ttY + ttPad + 22 + ri * ttLineH;
              return (
                <g key={ri}>
                  <rect x={ttX + ttPad} y={ry - 5} width={6} height={6}
                    fill={row.color} rx={1} />
                  <text x={ttX + ttPad + 10} y={ry}
                    fontSize={7.5} fontFamily="monospace"
                    fill="hsl(var(--muted-foreground))">{row.name}</text>
                  <text x={ttX + ttW - ttPad} y={ry}
                    fontSize={7.5} fontFamily="monospace" textAnchor="end"
                    fill="hsl(var(--foreground))">{row.value}</text>
                </g>
              );
            })}
          </g>
        );
      })()}

      {/* Legend */}
      {[...bars, ...lines].map((s, i) => {
        const isDashed = "dashed" in s && s.dashed;
        return (
          <g key={s.key} transform={`translate(${x0 + i * 110}, ${VH - 6})`}>
            {isDashed ? (
              <line x1={0} x2={14} y1={0} y2={0} stroke={s.color} strokeWidth={1.5} strokeDasharray="4 2" />
            ) : (
              <rect x={0} y={-4} width={14} height={8} fill={s.color} rx={1} opacity={0.85} />
            )}
            <text x={18} y={4} fontSize={9} fill="hsl(var(--muted-foreground))">{s.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── SvgLineChart ─────────────────────────────────────────────────────────────

export function SvgLineChart({
  data, xKey, lines, height = 240, xFmt, yFmt,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  lines: LineSeries[];
  height?: number;
  xFmt?: (v: string) => string;
  yFmt?: (v: number) => string;
}) {
  const H   = VH;
  const pad = FULL_PAD;
  const { x0, y0, w, h } = plotBox(pad);
  const rawLabels = data.map((d) => String(d[xKey] ?? ""));
  const labels    = xFmt ? rawLabels.map(xFmt) : rawLabels;
  const [lo, hi]  = useMemo(() => yRange(data, lines.map((l) => l.key)), [data, lines]);

  if (data.length === 0) return null;

  return (
    <svg viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height }} aria-hidden>
      <Axes pad={pad} labels={labels} lo={lo} hi={hi} yFmt={yFmt} />

      {lines.map((s) => {
        const pts = data.map((d, i) => ({
          x: mapX(i, data.length, x0, w),
          y: mapY(Number(d[s.key] ?? 0), lo, hi, y0, h),
        }));
        const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        return (
          <path key={s.key} d={line} fill="none" stroke={s.color}
            strokeWidth={s.dashed ? 1.5 : 2}
            strokeDasharray={s.dashed ? "5 3" : undefined} />
        );
      })}

      {/* Legend */}
      {lines.map((s, i) => (
        <g key={s.key} transform={`translate(${x0 + i * 110}, ${VH - 6})`}>
          <line x1={0} x2={14} y1={0} y2={0} stroke={s.color}
            strokeWidth={s.dashed ? 1.5 : 2}
            strokeDasharray={s.dashed ? "5 3" : undefined} />
          <text x={18} y={4} fontSize={9} fill="hsl(var(--muted-foreground))">{s.name}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── MiniChart (insights sparklines — 70px, all three variants) ───────────────

interface SparkPt { label: string; value: number; ref?: number }

function miniPts(
  points: SparkPt[],
  key: "value" | "ref",
  lo: number, hi: number,
  W: number, H: number, pad: Pad,
): string {
  const { x0, y0, w, h } = plotBox(pad, W, H);
  return points
    .map((p, i) => {
      const v = p[key];
      if (v == null) return null;
      const x = mapX(i, points.length, x0, w);
      const y = mapY(v, lo, hi, y0, h);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");
}

export function MiniLineChart({
  points, color, refColor = "hsl(var(--muted-foreground))", unit = "", metric = "",
}: {
  points: SparkPt[]; color: string; refColor?: string; unit?: string; metric?: string;
}) {
  const W = 260; const H = 70;
  const pad = MINI_PAD;
  const { x0, y0, w, h } = plotBox(pad, W, H);
  const vals = points.flatMap((p) => [p.value, p.ref ?? NaN]).filter(isFinite);
  const lo   = Math.min(...vals);
  const hi   = Math.max(...vals) * 1.05 || 1;
  const labels = xSubset(points.map((p) => p.label), 4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: H }} aria-hidden>
      {/* light gridline */}
      <line x1={x0} x2={x0 + w} y1={y0 + h / 2} y2={y0 + h / 2}
        stroke="hsl(var(--border))" strokeOpacity={0.4} strokeDasharray="3 3" />
      {labels.map(({ label, idx }) => (
        <text key={idx} x={mapX(idx, points.length, x0, w)} y={H - 2}
          textAnchor="middle" fontSize={8} fill="hsl(var(--muted-foreground))">{label}</text>
      ))}
      {points[0]?.ref !== undefined && (
        <path d={miniPts(points, "ref", lo, hi, W, H, pad)} fill="none"
          stroke={refColor} strokeWidth={1} strokeDasharray="3 2" />
      )}
      <path d={miniPts(points, "value", lo, hi, W, H, pad)} fill="none"
        stroke={color} strokeWidth={2} />
    </svg>
  );
}

export function MiniBarChart({
  points, color, refColor = "hsl(var(--muted-foreground))", unit = "", metric = "",
}: {
  points: SparkPt[]; color: string; refColor?: string; unit?: string; metric?: string;
}) {
  const W = 260; const H = 70;
  const pad = MINI_PAD;
  const { x0, y0, w, h } = plotBox(pad, W, H);
  const vals = points.map((p) => p.value);
  const lo   = 0;
  const hi   = Math.max(...vals, points[0]?.ref ?? 0) * 1.1 || 1;
  const barW = Math.max(2, (w / points.length) * 0.6);
  const labels = xSubset(points.map((p) => p.label), 4);
  const refY   = points[0]?.ref !== undefined ? mapY(points[0].ref, lo, hi, y0, h) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: H }} aria-hidden>
      {refY !== null && (
        <line x1={x0} x2={x0 + w} y1={refY} y2={refY}
          stroke={refColor} strokeWidth={1} strokeDasharray="3 2" />
      )}
      {labels.map(({ label, idx }) => (
        <text key={idx} x={mapX(idx, points.length, x0, w)} y={H - 2}
          textAnchor="middle" fontSize={8} fill="hsl(var(--muted-foreground))">{label}</text>
      ))}
      {points.map((p, i) => {
        const bx = barX(i, points.length, x0, w, barW);
        const by = mapY(p.value, lo, hi, y0, h);
        const bh = Math.max(0, (y0 + h) - by);
        return <rect key={i} x={bx} y={by} width={barW} height={bh} fill={color} rx={1} opacity={0.85} />;
      })}
    </svg>
  );
}

export function MiniAreaChart({
  points, color, refColor = "hsl(var(--muted-foreground))", unit = "", metric = "",
}: {
  points: SparkPt[]; color: string; refColor?: string; unit?: string; metric?: string;
}) {
  const W = 260; const H = 70;
  const pad = MINI_PAD;
  const { x0, y0, w, h } = plotBox(pad, W, H);
  const vals = points.flatMap((p) => [p.value, p.ref ?? NaN]).filter(isFinite);
  const lo   = Math.min(0, ...vals);
  const hi   = Math.max(...vals) * 1.1 || 1;
  const gradId = `mini-area-${color.replace(/[^a-z0-9]/gi, "")}`;
  const labels = xSubset(points.map((p) => p.label), 4);

  const valueLine = miniPts(points, "value", lo, hi, W, H, pad);
  const areaPath  = `${valueLine} L${(x0 + w).toFixed(1)},${(y0 + h).toFixed(1)} L${x0.toFixed(1)},${(y0 + h).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: H }} aria-hidden>
      <defs><AreaGrad id={gradId} color={color} /></defs>
      {labels.map(({ label, idx }) => (
        <text key={idx} x={mapX(idx, points.length, x0, w)} y={H - 2}
          textAnchor="middle" fontSize={8} fill="hsl(var(--muted-foreground))">{label}</text>
      ))}
      {points[0]?.ref !== undefined && (
        <path d={miniPts(points, "ref", lo, hi, W, H, pad)} fill="none"
          stroke={refColor} strokeWidth={1} strokeDasharray="3 2" />
      )}
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={valueLine} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

export interface DonutSlice { label: string; value: number; color: string; }

/** Simple SVG donut chart with a center label and a legend. No external refs. */
export function DonutChart({
  slices, centerLabel, centerSubLabel, size = 140,
}: {
  slices: DonutSlice[]; centerLabel?: string; centerSubLabel?: string; size?: number;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = size / 2;
  const strokeW = r * 0.32;
  const innerR = r - strokeW / 2;
  const circumference = 2 * Math.PI * innerR;

  let cumulative = 0;
  const segments = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const fraction = total > 0 ? s.value / total : 0;
      const dash = fraction * circumference;
      const offset = -cumulative * circumference;
      cumulative += fraction;
      return { ...s, dash, offset };
    });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        {total === 0 ? (
          <circle cx={r} cy={r} r={innerR} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeW} />
        ) : (
          <g transform={`rotate(-90 ${r} ${r})`}>
            {segments.map((s, i) => (
              <circle
                key={i}
                cx={r} cy={r} r={innerR}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeW}
                strokeDasharray={`${dashLen(s.dash)} ${dashLen(circumference)}`}
                strokeDashoffset={dashLen(s.offset)}
                strokeLinecap="butt"
              />
            ))}
          </g>
        )}
        {centerLabel && (
          <text x={r} y={centerSubLabel ? r - 4 : r + 5} textAnchor="middle" fontSize={size * 0.16} fontWeight={700} fill="hsl(var(--foreground))">
            {centerLabel}
          </text>
        )}
        {centerSubLabel && (
          <text x={r} y={r + 14} textAnchor="middle" fontSize={size * 0.08} fill="hsl(var(--muted-foreground))">
            {centerSubLabel}
          </text>
        )}
      </svg>
      <div className="space-y-1.5">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-semibold tabular-nums ml-auto">{s.value}</span>
          </div>
        ))}
        {slices.length === 0 && <span className="text-xs text-muted-foreground">No data</span>}
      </div>
    </div>
  );
}

function dashLen(n: number): string {
  return n.toFixed(2);
}
