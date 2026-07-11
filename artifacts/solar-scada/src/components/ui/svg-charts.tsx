/**
 * Pure SVG chart components — drop-in replacements for Recharts.
 * No external refs, no createRef(): fully compatible with React 19.
 */
import { useMemo } from "react";

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

export function SvgAreaChart({
  data, xKey, series, height = 180, yFmt, refX,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: AreaSeries[];
  height?: number;
  yFmt?: (v: number) => string;
  refX?: string;  // vertical reference line at this x label
}) {
  const H      = VH;
  const pad    = FULL_PAD;
  const { x0, y0, w, h } = plotBox(pad);
  const labels = data.map((d) => String(d[xKey] ?? ""));
  const [lo, hi] = useMemo(() => yRange(data, series.map((s) => s.key)), [data, series]);

  if (data.length === 0) return null;

  return (
    <svg viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height }} aria-hidden>
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
    </svg>
  );
}

// ─── SvgComposedChart (bars + lines) ─────────────────────────────────────────

export interface BarSpec  { key: string; name: string; color: string }
export interface LineSeries { key: string; name: string; color: string; dashed?: boolean }

export function SvgComposedChart({
  data, xKey, bars = [], lines = [], height = 280, yFmt,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  bars?: BarSpec[];
  lines?: LineSeries[];
  height?: number;
  yFmt?: (v: number) => string;
}) {
  const H      = VH;
  const pad    = FULL_PAD;
  const { x0, y0, w, h } = plotBox(pad);
  const labels  = data.map((d) => String(d[xKey] ?? ""));
  const allKeys = [...bars.map((b) => b.key), ...lines.map((l) => l.key)];
  const [lo, hi] = useMemo(() => yRange(data, allKeys), [data, allKeys]);

  const barW = bars.length > 0 ? Math.max(2, (w / data.length) * 0.6) : 0;

  if (data.length === 0) return null;

  return (
    <svg viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height }} aria-hidden>
      <defs>
        {bars.map((b) => <AreaGrad key={b.key} id={`bar-grd-${b.key}`} color={b.color} />)}
      </defs>
      <Axes pad={pad} labels={labels} lo={lo} hi={hi} yFmt={yFmt} />

      {/* Bars */}
      {bars.map((b) =>
        data.map((d, i) => {
          const val = Number(d[b.key] ?? 0);
          const bx  = barX(i, data.length, x0, w, barW);
          const by  = mapY(val, lo, hi, y0, h);
          const bh  = (y0 + h) - by;
          return (
            <rect key={`${b.key}-${i}`}
              x={bx} y={by} width={barW} height={Math.max(0, bh)}
              fill={b.color} rx={1} opacity={0.85} />
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
