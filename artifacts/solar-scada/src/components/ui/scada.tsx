import { HealthState, AlertSeverity } from "@workspace/api-client-react";
import {
  CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  TrendingUp, TrendingDown, Minus, ArrowRight,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { computeHealthScore as _computeHealthScore, healthScoreColor, healthScoreLabel } from "@/lib/plantHierarchy";

// Re-export for convenience so callers only need one import
export { computeHealthScore } from "@/lib/plantHierarchy";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── Health / Severity badges ─────────────────────────────────────────── */

export function HealthBadge({ status, className }: { status: HealthState; className?: string }) {
  switch (status) {
    case "normal":
      return (
        <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-status-normal/15 text-status-normal border border-status-normal/30 uppercase tracking-widest", className)}>
          <span className="w-1.5 h-1.5 rounded-full bg-status-normal animate-pulse-subtle shadow-[0_0_5px_hsl(var(--status-normal))]" /> OK
        </div>
      );
    case "warning":
      return (
        <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-status-warning/15 text-status-warning border border-status-warning/30 uppercase tracking-widest", className)}>
          <span className="w-1.5 h-1.5 rounded-full bg-status-warning" /> WARN
        </div>
      );
    case "fault":
      return (
        <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-status-fault/15 text-status-fault border border-status-fault/30 uppercase tracking-widest", className)}>
          <span className="w-1.5 h-1.5 rounded-full bg-status-fault animate-ping-once shadow-[0_0_5px_hsl(var(--status-fault))]" /> FAULT
        </div>
      );
    case "offline":
      return (
        <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-status-offline/15 text-status-offline border border-status-offline/30 uppercase tracking-widest", className)}>
          <span className="w-1.5 h-1.5 rounded-full bg-status-offline" /> OFFLINE
        </div>
      );
    default:
      return null;
  }
}

export function SeverityBadge({ severity, className }: { severity: AlertSeverity; className?: string }) {
  switch (severity) {
    case "critical":
      return <span className={cn("inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-status-fault/15 text-status-fault border border-status-fault/30 uppercase tracking-wider", className)}>Critical</span>;
    case "major":
      return <span className={cn("inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-[#e67e22]/15 text-[#e67e22] border border-[#e67e22]/30 uppercase tracking-wider", className)}>Major</span>;
    case "minor":
      return <span className={cn("inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-status-warning/15 text-status-warning border border-status-warning/30 uppercase tracking-wider", className)}>Minor</span>;
    case "informational":
      return <span className={cn("inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 uppercase tracking-wider", className)}>Info</span>;
    default:
      return null;
  }
}

/* ── Live value display (with optional change-flash) ─────────────────── */

export function LiveValue({
  value, unit, precision = 1, className, valueClassName, flash = false,
}: {
  value: number | undefined | null;
  unit: string;
  precision?: number;
  className?: string;
  valueClassName?: string;
  flash?: boolean;
}) {
  const [flashing, setFlashing] = useState(false);
  const prevRef = useRef<number | null | undefined>(value);

  useEffect(() => {
    if (value === prevRef.current) return;
    prevRef.current = value;
    if (!flash || value == null) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 800);
    return () => clearTimeout(t);
  }, [value, flash]);

  if (value === undefined || value === null)
    return <span className={cn("text-muted-foreground font-mono", className)}>-- <span className="text-xs">{unit}</span></span>;

  return (
    <div className={cn("inline-flex items-baseline gap-1 font-mono", className)}>
      <span className={cn(
        "font-bold tracking-tight text-foreground transition-colors",
        flashing && "animate-data-flash",
        valueClassName,
      )}>
        {value.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}
      </span>
      <span className="text-xs font-semibold text-muted-foreground font-sans">{unit}</span>
    </div>
  );
}

/* ── Sparkline (pure SVG — avoids Recharts createRef on React 19) ────── */

function buildSparklinePath(
  values: number[],
  W = 100,
  H = 100,
): { line: string; area: string } {
  if (values.length < 2) return { line: "", area: "" };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    // Flat/constant series: render at vertical midpoint, not bottom
    const y = range === 0
      ? H * 0.5
      : H - ((v - min) / range) * (H * 0.9) - H * 0.05;
    return [x, y] as [number, number];
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  return { line, area };
}

export function Sparkline({
  data,
  dataKey = "v",
  color = "hsl(var(--accent-brand))",
  className,
}: {
  data: Record<string, number>[];
  dataKey?: string;
  color?: string;
  className?: string;
}) {
  if (!data || data.length === 0) return null;
  const values = data.map((d) => (d[dataKey] as number) ?? 0);
  const gradId = `sg-${dataKey}-${color.replace(/[^a-z0-9]/gi, "")}`;
  const { line, area } = buildSparklinePath(values);
  return (
    <div className={cn("w-full h-12 relative overflow-hidden", className)}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full absolute inset-0">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {values.length > 0 && (
         <div className="absolute right-0 w-2 h-2 rounded-full bg-current shadow-[0_0_8px_currentColor] animate-pulse-subtle" style={{ color, top: `${(1 - (values[values.length - 1] - Math.min(...values)) / (Math.max(...values) - Math.min(...values) || 1)) * 90}%`, transform: 'translate(50%, -50%)' }} />
      )}
    </div>
  );
}

/* ── Generation ring (radial SVG progress) ───────────────────────────── */

export function GenerationRing({
  pct, label, sublabel, size = 120,
  color = "hsl(var(--accent-brand))",
  trackColor = "hsl(var(--muted)/0.4)",
  strokeWidth = 10,
  className,
}: {
  pct: number; label: string; sublabel?: string;
  size?: number; color?: string; trackColor?: string;
  strokeWidth?: number; className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  const center = size / 2;

  return (
    <div className={cn("flex flex-col items-center justify-center relative", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg] filter drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]">
        <circle cx={center} cy={center} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle cx={center} cy={center} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)" }}
          className="drop-shadow-[0_0_6px_currentColor]"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {sublabel && <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">{sublabel}</span>}
        <span className="text-xl font-bold font-mono tracking-tighter text-foreground drop-shadow-md leading-none">{label}</span>
      </div>
    </div>
  );
}

/* ── Stat card (summary header) ─────────────────────────────────────── */

export function StatCard({
  label, value, icon: Icon,
  accent = "default", loading = false, className,
}: {
  label: string; value: string | number | undefined;
  icon?: React.ElementType; accent?: "default" | "danger" | "warning" | "success" | "info" | "brand";
  loading?: boolean; className?: string;
}) {
  const accentCls = {
    default: "border-card-border bg-card",
    danger:  "border-status-fault/30 bg-status-fault/5 shadow-[0_0_15px_hsl(var(--status-fault)/0.05)]",
    warning: "border-[#e67e22]/30 bg-[#e67e22]/5 shadow-[0_0_15px_rgba(230,126,34,0.05)]",
    success: "border-status-normal/30 bg-status-normal/5 shadow-[0_0_15px_hsl(var(--status-normal)/0.05)]",
    info:    "border-blue-500/30 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.05)]",
    brand:   "border-accent-brand/30 bg-accent-brand/5 shadow-[0_0_15px_rgba(20,205,230,0.05)]",
  }[accent];

  const iconCls = {
    default: "text-muted-foreground",
    danger:  "text-status-fault",
    warning: "text-[#e67e22]",
    success: "text-status-normal",
    info:    "text-blue-400",
    brand:   "text-accent-brand",
  }[accent];

  return (
    <div className={cn("rounded-xl px-5 py-4 flex items-center gap-4 border transition-all duration-300 hover:scale-[1.02]", accentCls, className)}>
      {Icon && (
        <div className={cn("p-3 rounded-lg bg-background/50 border border-border/50", iconCls)}>
          <Icon className="w-5 h-5 flex-shrink-0" />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">{label}</div>
        {loading ? (
          <div className="h-7 w-16 bg-muted/40 animate-shimmer rounded mt-1" />
        ) : (
          <div className="text-2xl font-bold font-mono leading-none mt-1.5 text-foreground">{value ?? "--"}</div>
        )}
      </div>
    </div>
  );
}

/* ── KPI Card (with value-change flash) ─────────────────────────────── */

export function KpiCard({
  title, value, unit, precision = 1, icon: Icon,
  trend, sparkline, className, loading = false,
}: {
  title: string; value?: number | null; unit: string; precision?: number;
  icon?: React.ElementType;
  trend?: { value: number; label: string; positive?: boolean };
  sparkline?: Record<string, number>[];
  className?: string; loading?: boolean;
}) {
  const [flashing, setFlashing] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value == null || value === prevValue.current) return;
    prevValue.current = value;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 800);
    return () => clearTimeout(t);
  }, [value]);

  const trendPositive = trend
    ? (trend.positive !== undefined ? trend.positive : trend.value >= 0)
    : false;

  return (
    <div className={cn(
      "bg-card/40 backdrop-blur-md border border-card-border rounded-xl p-5 flex flex-col overflow-hidden transition-all duration-300 relative group hover:bg-card/60 hover:border-border/80 hover:shadow-lg",
      flashing ? "border-accent-brand shadow-[0_0_20px_rgba(20,205,230,0.15)] bg-accent-brand/5" : "",
      className,
    )}>
      {/* Top subtle highlight */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-border/50 to-transparent group-hover:via-accent-brand/50 transition-colors" />

      <div className="flex items-center justify-between mb-4 relative z-10">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{title}</span>
        {Icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-background/50 border border-border/50 group-hover:bg-accent-brand/10 group-hover:border-accent-brand/30 transition-colors">
            <Icon className="h-4 w-4 text-muted-foreground group-hover:text-accent-brand transition-colors" />
          </div>
        )}
      </div>

      <div className="relative z-10">
        {loading ? (
          <div className="h-10 w-24 bg-muted/40 animate-shimmer rounded" />
        ) : (
          <LiveValue value={value} unit={unit} precision={precision} valueClassName="text-3xl font-bold leading-none tracking-tighter" flash />
        )}

        {trend && !loading && (
          <div className="mt-3 flex items-center gap-1.5 text-xs font-medium">
            <span className={cn("font-mono px-1.5 py-0.5 rounded text-[10px]", trendPositive ? "bg-status-normal/10 text-status-normal" : "bg-status-fault/10 text-status-fault")}>
              {trend.value > 0 ? "+" : ""}{trend.value}%
            </span>
            <span className="text-muted-foreground tracking-wide">{trend.label}</span>
          </div>
        )}
      </div>

      {sparkline && !loading && (
        <div className="mt-4 -mx-2 -mb-2 relative z-0 opacity-60 group-hover:opacity-100 transition-opacity">
          <Sparkline data={sparkline} dataKey="v" />
        </div>
      )}
    </div>
  );
}

/* ── Health Score Gauge ──────────────────────────────────────────────── */

export function HealthScoreGauge({
  score,
  size = 80,
  strokeWidth = 6,
  showLabel = true,
  className,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const color = healthScoreColor(score);
  const label = healthScoreLabel(score);
  return (
    <GenerationRing
      pct={score}
      label={`${Math.round(score)}`}
      sublabel={showLabel ? label : undefined}
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      className={className}
    />
  );
}

/* ── Drill-Down Card ─────────────────────────────────────────────────── */

export function DrillDownCard({
  title,
  subtitle,
  healthScore,
  status,
  kpis,
  alertCount,
  sparklineData,
  sparklineColor,
  href,
  loading = false,
}: {
  title: string;
  subtitle?: string;
  healthScore?: number;
  status?: HealthState;
  kpis: { label: string; value: string }[];
  alertCount?: number;
  sparklineData?: { v: number }[];
  sparklineColor?: string;
  href: string;
  loading?: boolean;
}) {
  const color = sparklineColor ?? (healthScore != null ? healthScoreColor(healthScore) : "hsl(var(--accent-brand))");

  if (loading) {
    return <div className="bg-card/40 border border-card-border rounded-xl p-5 h-48 animate-shimmer" />;
  }

  return (
    <Link href={href}>
      <div className="bg-card/40 backdrop-blur-md border border-card-border rounded-xl p-5 hover:border-accent-brand/40 hover:bg-accent-brand/5 cursor-pointer group transition-all duration-300 hover:shadow-xl hover:shadow-black/20 flex flex-col h-full relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-border group-hover:bg-accent-brand transition-colors" />

        <div className="flex items-start justify-between mb-4 pl-2">
          <div>
            <div className="font-semibold text-foreground group-hover:text-accent-brand transition-colors leading-tight tracking-wide">{title}</div>
            {subtitle && <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">{subtitle}</div>}
          </div>
          {status && <HealthBadge status={status} className="flex-shrink-0 ml-2" />}
        </div>

        <div className="flex items-center gap-5 pl-2">
          {healthScore != null && (
            <HealthScoreGauge score={healthScore} size={72} strokeWidth={6} showLabel={false} />
          )}
          <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-3 min-w-0">
            {kpis.slice(0, 4).map((kpi) => (
              <div key={kpi.label} className="min-w-0">
                <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest truncate">{kpi.label}</div>
                <div className="font-mono text-sm font-medium truncate mt-0.5 text-foreground">{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <div className="mt-4 flex items-center justify-between pl-2">
          <div className="flex items-center gap-2">
            {alertCount != null && alertCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded text-[10px] font-bold bg-status-fault/20 text-status-fault border border-status-fault/30">
                {alertCount}
              </span>
            )}
            {alertCount === 0 && (
              <span className="text-[10px] text-status-normal font-medium flex items-center gap-1 bg-status-normal/10 px-1.5 py-0.5 rounded border border-status-normal/20 uppercase tracking-widest">
                <CheckCircle2 className="w-3 h-3" /> Clear
              </span>
            )}
          </div>
          <span className="text-[11px] text-accent-brand flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all font-bold uppercase tracking-wider -translate-x-2 group-hover:translate-x-0">
            Command <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>

        {sparklineData && sparklineData.length > 0 && (
          <div className="absolute bottom-0 left-0 w-full h-16 opacity-30 group-hover:opacity-60 transition-opacity pointer-events-none">
            <Sparkline data={sparklineData} dataKey="v" color={color} className="h-full translate-y-2" />
          </div>
        )}
      </div>
    </Link>
  );
}
