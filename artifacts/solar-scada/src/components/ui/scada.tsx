import { HealthState, AlertSeverity } from "@workspace/api-client-react";
import {
  CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  TrendingUp, TrendingDown, Minus, ArrowRight,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
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
        <div className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-normal/10 text-status-normal border border-status-normal/20", className)}>
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Normal
        </div>
      );
    case "warning":
      return (
        <div className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-warning/10 text-status-warning border border-status-warning/20", className)}>
          <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Warning
        </div>
      );
    case "fault":
      return (
        <div className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-fault/10 text-status-fault border border-status-fault/20", className)}>
          <XCircle className="w-3.5 h-3.5 mr-1" /> Fault
        </div>
      );
    case "offline":
      return (
        <div className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-offline/10 text-status-offline border border-status-offline/20", className)}>
          <HelpCircle className="w-3.5 h-3.5 mr-1" /> Offline
        </div>
      );
  }
}

export function SeverityBadge({ severity, className }: { severity: AlertSeverity; className?: string }) {
  switch (severity) {
    case "critical":
      return <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-status-fault/15 text-status-fault border border-status-fault/30", className)}>● Critical</span>;
    case "major":
      return <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-[#e67e22]/15 text-[#e67e22] border border-[#e67e22]/30", className)}>● Major</span>;
    case "minor":
      return <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-status-warning/15 text-status-warning border border-status-warning/30", className)}>● Minor</span>;
    case "informational":
      return <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30", className)}>● Info</span>;
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
    <div className={cn("inline-flex items-baseline font-mono", className)}>
      <span className={cn(
        "font-semibold tracking-tight text-foreground transition-colors",
        flashing && "animate-data-flash",
        valueClassName,
      )}>
        {value.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}
      </span>
      <span className="ml-1 text-xs text-muted-foreground font-sans">{unit}</span>
    </div>
  );
}

/* ── Sparkline (tiny area chart) ─────────────────────────────────────── */

export function Sparkline({
  data,
  dataKey = "v",
  color = "hsl(var(--primary))",
  className,
}: {
  data: Record<string, number>[];
  dataKey?: string;
  color?: string;
  className?: string;
}) {
  if (!data || data.length === 0) return null;
  return (
    <div className={cn("w-full h-12", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sg-${color.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#sg-${color.replace(/\W/g, "")})`}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip contentStyle={{ display: "none" }} cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Generation ring (radial SVG progress) ───────────────────────────── */

export function GenerationRing({
  pct, label, sublabel, size = 96,
  color = "hsl(var(--status-normal))",
  trackColor = "hsl(var(--muted))",
  strokeWidth = 8,
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
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          <circle cx={center} cy={center} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
          <circle cx={center} cy={center} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold font-mono">{clamped.toFixed(0)}%</span>
        </div>
      </div>
      <span className="text-xs font-semibold text-foreground mt-1">{label}</span>
      {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
    </div>
  );
}

/* ── Stat card (summary header) ─────────────────────────────────────── */

export function StatCard({
  label, value, icon: Icon,
  accent = "default", loading = false, className,
}: {
  label: string; value: string | number | undefined;
  icon?: React.ElementType; accent?: "default" | "danger" | "warning" | "success" | "info";
  loading?: boolean; className?: string;
}) {
  const accentCls = {
    default: "border-card-border",
    danger:  "border-status-fault/40 bg-status-fault/5",
    warning: "border-status-warning/40 bg-status-warning/5",
    success: "border-status-normal/40 bg-status-normal/5",
    info:    "border-blue-500/30 bg-blue-500/5",
  }[accent];

  const iconCls = {
    default: "text-muted-foreground",
    danger:  "text-status-fault",
    warning: "text-status-warning",
    success: "text-status-normal",
    info:    "text-blue-400",
  }[accent];

  return (
    <div className={cn("bg-card border rounded-lg px-4 py-3 flex items-center gap-3", accentCls, className)}>
      {Icon && <Icon className={cn("w-5 h-5 flex-shrink-0", iconCls)} />}
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        {loading ? (
          <div className="h-6 w-10 bg-muted animate-pulse rounded mt-0.5" />
        ) : (
          <div className="text-xl font-bold font-mono leading-none mt-0.5">{value ?? "--"}</div>
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
      "bg-card border border-card-border rounded-lg p-4 flex flex-col overflow-hidden transition-colors",
      flashing && "border-primary/40",
      className,
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground/50" />}
      </div>

      {loading ? (
        <div className="h-8 w-24 bg-muted animate-pulse rounded mt-1" />
      ) : (
        <LiveValue value={value} unit={unit} precision={precision} valueClassName="text-2xl" flash />
      )}

      {trend && !loading && (
        <div className="mt-1.5 flex items-center gap-1 text-xs">
          {trendPositive
            ? <TrendingUp  className="w-3 h-3 text-status-normal" />
            : trend.value === 0
              ? <Minus       className="w-3 h-3 text-muted-foreground" />
              : <TrendingDown className="w-3 h-3 text-status-fault" />}
          <span className={cn("font-medium", trendPositive ? "text-status-normal" : "text-status-fault")}>
            {trend.value > 0 ? "+" : ""}{trend.value}%
          </span>
          <span className="text-muted-foreground">{trend.label}</span>
        </div>
      )}

      {sparkline && !loading && (
        <div className="mt-2 -mx-1">
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
  const color = sparklineColor ?? (healthScore != null ? healthScoreColor(healthScore) : "hsl(var(--primary))");

  if (loading) {
    return <div className="bg-card border border-card-border rounded-xl p-5 h-44 animate-pulse" />;
  }

  return (
    <Link href={href}>
      <div className="bg-card border border-card-border rounded-xl p-4 hover:border-primary/40 cursor-pointer group transition-all">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">{title}</div>
            {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
          </div>
          {status && <HealthBadge status={status} className="flex-shrink-0 ml-2" />}
        </div>
        <div className="flex items-center gap-4">
          {healthScore != null && (
            <HealthScoreGauge score={healthScore} size={64} strokeWidth={5} showLabel={false} />
          )}
          <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5 min-w-0">
            {kpis.slice(0, 4).map((kpi) => (
              <div key={kpi.label} className="min-w-0">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{kpi.label}</div>
                <div className="font-mono text-sm font-medium truncate">{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>
        {alertCount != null && alertCount > 0 && (
          <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-status-fault/15 text-status-fault">
            {alertCount} alert{alertCount > 1 ? "s" : ""}
          </div>
        )}
        {sparklineData && sparklineData.length > 0 && (
          <div className="mt-2 h-8 -mx-1 opacity-50 group-hover:opacity-100 transition-opacity">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`ddc-${title.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
                  fill={`url(#ddc-${title.replace(/\W/g, "")})`} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-1.5 flex justify-end">
          <span className="text-xs text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            View detail <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
