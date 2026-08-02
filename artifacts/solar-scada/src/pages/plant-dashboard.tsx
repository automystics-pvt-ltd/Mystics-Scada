import {
  useGetPlant,
  useGetPlantYield,
  useListInverters,
  getGetPlantQueryKey,
  getGetPlantYieldQueryKey,
  getListInvertersQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import {
  Sun, Thermometer, Activity, Zap, Network, Cpu, BarChart4, CloudLightning,
  Wind, ArrowLeft, TrendingUp, Brain, ChevronDown, ChevronUp,
  AlertTriangle, Layers, Radio, WifiOff, ChevronRight, ChevronLeft,
  Leaf, DollarSign, Calendar, Download,
} from "lucide-react";
import { computeHealthScore, healthScoreColor } from "@/lib/plantHierarchy";
import { HealthBadge, LiveValue } from "@/components/ui/scada";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo } from "react";
import { SvgAreaChart, SvgComposedChart, MiniLineChart } from "@/components/ui/svg-charts";
import { usePlantTelemetryStream, type LiveInverter } from "@/hooks/usePlantTelemetryStream";

const BASE = import.meta.env.BASE_URL as string;

// ── Types ─────────────────────────────────────────────────────────────────────
interface TrendPoint { label: string; timestamp: string; acPowerKw: number; dcPowerKw: number; energyKwh: number }
interface TrendResponse { period: string; irradianceWm2: number; points: TrendPoint[] }
interface RevenueData { currency: string; tariffPerKwh: number; todayRevenue: number; monthRevenue: number; lifetimeRevenue: number; co2AvoidedKgToday: number; co2AvoidedKgLifetime: number }
interface PlantInsight { id: string; type: string; severity: "critical" | "warning" | "info"; plantId: string; deviceName?: string; title: string; recommendedAction: string; energyImpactKwhPerDay: number }

type Period = "day" | "week" | "month" | "year" | "lifetime";

const PERIOD_LABELS: Record<Period, string> = {
  day: "Day", week: "Week", month: "Month", year: "Year", lifetime: "Lifetime",
};

const SUB_NAV = (plantId: string) => [
  { name: "Overview",   href: `${BASE}plants/${plantId}`,           icon: null },
  { name: "SLD",        href: `${BASE}plants/${plantId}/sld`,       icon: Network },
  { name: "Zones",      href: `${BASE}plants/${plantId}/zones`,     icon: Layers },
  { name: "Inverters",  href: `${BASE}plants/${plantId}/inverters`, icon: Cpu },
  { name: "Weather",    href: `${BASE}plants/${plantId}/weather`,   icon: CloudLightning },
  { name: "Analytics",  href: `${BASE}plants/${plantId}/analytics`, icon: BarChart4 },
];

const STATUS_DOT: Record<string, string> = {
  running: "bg-emerald-500", standby: "bg-amber-500", fault: "bg-red-500", comm_lost: "bg-slate-500",
};

function mergeInverters(polled: any[] | undefined, live: LiveInverter[] | undefined): any[] {
  if (!polled?.length) return [];
  if (!live?.length) return polled;
  return polled.map(inv => {
    const lv = live.find(l => l.index === inv.index);
    return lv ? { ...inv, status: lv.status, acPowerKw: lv.acPowerKw, dcPowerKw: lv.dcPowerKw, efficiencyPct: lv.efficiencyPct, temperatureC: lv.temperatureC } : inv;
  });
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiBox({ label, value, unit, icon: Icon, accent = false, loading = false }: {
  label: string; value: string | number | null; unit?: string;
  icon: React.FC<{ className?: string }>; accent?: boolean; loading?: boolean;
}) {
  return (
    <div className={`flex-1 min-w-0 px-5 py-4 rounded-xl border transition-all ${
      accent
        ? "bg-accent-brand/5 border-accent-brand/20 shadow-[0_0_15px_rgba(20,205,230,0.1)]"
        : "bg-card border-border/60"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-muted-foreground tracking-normal capitalize">
          {label}
        </span>
        <div className="w-6 h-6 rounded flex items-center justify-center bg-muted/50 border border-border/50">
          <Icon className="w-3.5 h-3.5 text-muted-foreground/70" />
        </div>
      </div>
      {loading ? (
        <div className="h-7 w-24 bg-muted/40 rounded animate-pulse mt-1" />
      ) : (
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className={`text-2xl font-bold tabular-nums ${accent ? "text-accent-brand" : "text-foreground"}`}>
            {value ?? "--"}
          </span>
          {unit && <span className="text-sm text-muted-foreground font-medium">{unit}</span>}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PlantDashboard() {
  const { plantId } = useParams();
  const pid = plantId ?? "";

  const [period, setPeriod] = useState<Period>("day");
  const [dateOffset, setDateOffset] = useState(0); // 0 = today
  const [insightsOpen, setInsightsOpen] = useState(true);

  // Data fetching
  const { data: plant, isLoading, isError } = useGetPlant(pid, {
    query: { enabled: !!pid, refetchInterval: 30_000, queryKey: getGetPlantQueryKey(pid) },
  });

  const yieldPeriodMap: Record<Period, "daily"|"weekly"|"monthly"|"yearly"> = {
    day: "daily", week: "daily", month: "daily", year: "monthly", lifetime: "yearly",
  };
  const { data: yieldData } = useGetPlantYield(pid, { period: yieldPeriodMap[period] }, {
    query: { enabled: !!pid && period !== "day", queryKey: getGetPlantYieldQueryKey(pid, { period: yieldPeriodMap[period] }) },
  });

  const { data: trendData, isLoading: trendLoading } = useQuery<TrendResponse>({
    queryKey: ["plant-trend", pid, period, dateOffset],
    queryFn: async () => {
      const apiPeriod = period === "day" ? "day" : period === "week" ? "week" : period === "month" ? "month" : "month";
      const r = await fetch(`${BASE}api/plants/${pid}/trend?period=${apiPeriod}`, { credentials: "include" });
      if (!r.ok) throw new Error("Trend fetch failed");
      return r.json();
    },
    enabled: !!pid && period === "day",
    refetchInterval: period === "day" ? 30_000 : false,
    staleTime: 15_000,
  });

  const { data: revenue } = useQuery<RevenueData>({
    queryKey: ["plant-revenue", pid],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/plants/${pid}/revenue`, { credentials: "include" });
      if (!r.ok) throw new Error("Revenue fetch failed");
      return r.json();
    },
    enabled: !!pid, refetchInterval: 60_000,
  });

  const { data: polledInverters } = useListInverters(pid, {
    query: { enabled: !!pid, refetchInterval: 30_000, queryKey: getListInvertersQueryKey(pid) },
  });

  const { data: plantInsights = [] } = useQuery<PlantInsight[]>({
    queryKey: ["insights", pid],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/insights?plantId=${pid}`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!pid, refetchInterval: 60_000, staleTime: 30_000,
  });

  // SSE live stream
  const liveStream = usePlantTelemetryStream(pid || null);
  const [powerHistory, setPowerHistory] = useState<{ label: string; value: number }[]>([]);
  const prevPowerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!liveStream.latest) return;
    const pw = liveStream.latest.powerKw;
    if (pw === prevPowerRef.current) return;
    prevPowerRef.current = pw;
    setPowerHistory(prev => {
      const ts = new Date(liveStream.latest!.timestamp);
      const label = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const next = [...prev, { label, value: pw }];
      return next.length > 120 ? next.slice(-120) : next;
    });
  }, [liveStream.latest]);

  const inverters = mergeInverters(polledInverters as any[], liveStream.latest?.inverters);
  const livePower   = liveStream.latest?.powerKw    ?? plant?.currentPowerKw  ?? null;
  const livePr      = liveStream.latest?.pr         ?? plant?.pr              ?? null;
  const liveHealth  = liveStream.latest?.health     ?? plant?.healthStatus    ?? "offline";
  const liveIrradiance = liveStream.latest?.irradianceWm2 ?? plant?.irradiancePoaWm2 ?? null;

  // Current date display for header
  const displayDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - dateOffset);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }, [dateOffset]);

  // Chart data per period
  const chartData = useMemo(() => {
    if (period === "day") {
      return (trendData?.points ?? []).map(p => ({
        label: p.label,
        powerKw: p.acPowerKw,
        dcPowerKw: p.dcPowerKw,
        energyKwh: p.energyKwh,
      }));
    }
    // week/month/year/lifetime → yield bars
    const pts = yieldData?.points ?? [];
    const slice = period === "week" ? pts.slice(-7) : period === "month" ? pts : period === "year" ? pts.slice(-12) : pts;
    return slice.map((p: any) => ({
      label: p.label ?? p.date ?? "",
      actualKwh: p.actualKwh ?? 0,
      expectedKwh: p.expectedKwh ?? 0,
    }));
  }, [period, trendData, yieldData]);

  // KPIs per period
  const todayKwh     = plant?.todayEnergyKwh ?? 0;
  const todayRevenue = revenue?.todayRevenue ?? 0;
  const co2Today     = revenue?.co2AvoidedKgToday ?? 0;
  const specificYield = yieldData?.specificYieldKwhPerKwp ?? 0;

  const kpis = useMemo(() => {
    switch (period) {
      case "day": return [
        { label: "Energy Analysis", value: todayKwh >= 1000 ? (todayKwh/1000).toFixed(3) : todayKwh.toFixed(1), unit: todayKwh >= 1000 ? "MWh" : "kWh", icon: Activity, accent: true },
        { label: "Production",      value: todayKwh >= 1000 ? (todayKwh/1000).toFixed(3) : todayKwh.toFixed(1), unit: todayKwh >= 1000 ? "MWh" : "kWh", icon: Zap },
        { label: "Net Revenue",     value: `₹${todayRevenue.toLocaleString("en-IN")}`, unit: undefined, icon: DollarSign },
        { label: "CO₂ Avoided",    value: co2Today.toFixed(0), unit: "kg", icon: Leaf },
      ];
      case "week": return [
        { label: "Weekly Energy",   value: chartData.reduce((s: number, p: any) => s + (p.actualKwh ?? 0), 0).toFixed(0), unit: "kWh", icon: Activity, accent: true },
        { label: "Specific Yield",  value: specificYield.toFixed(2), unit: "kWh/kWp", icon: TrendingUp },
        { label: "Revenue",         value: `₹${(revenue?.monthRevenue ?? 0).toLocaleString("en-IN")}`, unit: undefined, icon: DollarSign },
        { label: "Performance Ratio", value: livePr?.toFixed(1) ?? "--", unit: "%", icon: BarChart4 },
      ];
      case "month": return [
        { label: "Monthly Energy",  value: ((chartData as any[]).reduce((s, p) => s + (p.actualKwh ?? 0), 0)/1000).toFixed(2), unit: "MWh", icon: Activity, accent: true },
        { label: "Production",      value: ((chartData as any[]).reduce((s, p) => s + (p.actualKwh ?? 0), 0)/1000).toFixed(2), unit: "MWh", icon: Zap },
        { label: "Month Revenue",   value: `₹${(revenue?.monthRevenue ?? 0).toLocaleString("en-IN")}`, unit: undefined, icon: DollarSign },
        { label: "Availability",    value: plant?.availabilityPct?.toFixed(1) ?? "--", unit: "%", icon: TrendingUp },
      ];
      default: return [
        { label: "Lifetime Energy", value: ((chartData as any[]).reduce((s, p) => s + (p.actualKwh ?? 0), 0)/1000000).toFixed(2), unit: "GWh", icon: Activity, accent: true },
        { label: "Lifetime Revenue",value: `₹${(revenue?.lifetimeRevenue ?? 0).toLocaleString("en-IN")}`, unit: undefined, icon: DollarSign },
        { label: "CO₂ Lifetime",   value: ((revenue?.co2AvoidedKgLifetime ?? 0)/1000).toFixed(1), unit: "tCO₂", icon: Leaf },
        { label: "Capacity",        value: ((plant?.capacityKw ?? 0)/1000).toFixed(2), unit: "MWp", icon: Zap },
      ];
    }
  }, [period, chartData, todayKwh, todayRevenue, co2Today, specificYield, livePr, plant, revenue]);

  if (isError) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <Zap className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold">Failed to load plant</h2>
          <Link href="/" className="mt-6 text-primary hover:underline flex items-center">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Portfolio
          </Link>
        </div>
      </AppLayout>
    );
  }

  const healthScore = plant ? computeHealthScore(
    livePr ?? 0, plant.availabilityPct,
    { critical: plant.alertCounts?.critical ?? 0, major: plant.alertCounts?.major ?? 0 },
  ) : null;

  return (
    <AppLayout>
      <div className="flex flex-col space-y-5">

        {/* ── Breadcrumb ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <Link href="/">
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3 h-3" /> Portfolio
            </button>
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <span className="text-xs text-foreground font-medium">{plant?.name ?? "Plant"}</span>
        </div>

        {/* ── Plant header ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                {plant?.name ?? "Plant Dashboard"}
              </h1>
              {plant && <HealthBadge status={liveHealth as any} />}
              {healthScore !== null && (
                <span className="text-xs font-mono px-2 py-0.5 rounded border border-border/60 bg-muted/30"
                  style={{ color: healthScoreColor(healthScore) }}>
                  {healthScore}/100
                </span>
              )}
              <div className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border font-medium ${
                liveStream.connected
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-muted/50 border-border text-muted-foreground"
              }`}>
                {liveStream.connected
                  ? <Radio className="h-2.5 w-2.5 animate-pulse" />
                  : <WifiOff className="h-2.5 w-2.5" />}
                {liveStream.connected ? "Live" : "Polling"}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {plant?.region} · {plant?.capacityKw ? `${(plant.capacityKw / 1000).toFixed(2)} MWp installed` : "--"}
            </p>
          </div>
        </div>

        {/* ── Sub-nav tabs ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-border/50 -mx-1 px-1 overflow-x-auto">
          {SUB_NAV(pid).map((item) => {
            const isActive = item.href === `${BASE}plants/${pid}` || item.href === `${BASE}plants/${pid}/`;
            return (
              <Link key={item.name} href={item.href}>
                <button className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-all -mb-px ${
                  isActive
                    ? "border-accent-brand text-accent-brand"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}>
                  {item.icon && <item.icon className="w-3.5 h-3.5" />}
                  {item.name}
                </button>
              </Link>
            );
          })}
        </div>

        {/* ── HERO: Live power number ───────────────────────────────────── */}
        <div className="flex flex-col items-center justify-center py-8 bg-card border border-border/60 rounded-2xl relative overflow-hidden">
          {/* Subtle gradient glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(190,85%,52%,0.08)_0%,transparent_70%)] pointer-events-none" />
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2 z-10">Current Power Output</p>
          <div className="flex items-baseline gap-2 z-10">
            {isLoading ? (
              <div className="h-16 w-48 bg-muted/40 rounded animate-pulse" />
            ) : (
              <>
                <span className="text-6xl font-black tabular-nums text-foreground leading-none">
                  {livePower != null
                    ? livePower >= 1000
                      ? (livePower / 1000).toFixed(2)
                      : livePower.toFixed(2)
                    : "--"}
                </span>
                <span className="text-2xl font-semibold text-muted-foreground">
                  {livePower != null && livePower >= 1000 ? "MW" : "kW"}
                </span>
              </>
            )}
          </div>
          {/* Mini live trend inline */}
          {powerHistory.length >= 8 && (
            <div className="mt-3 w-full max-w-xs px-4">
              <MiniLineChart color="hsl(var(--primary))" points={powerHistory} />
              <p className="text-[9px] text-muted-foreground text-center mt-1">
                {powerHistory[0]?.label} → {powerHistory[powerHistory.length - 1]?.label} (live)
              </p>
            </div>
          )}
          {/* PR + Availability inline */}
          <div className="flex items-center gap-6 mt-4 text-xs">
            <div className="text-center">
              <p className="text-muted-foreground">PR</p>
              <p className="font-semibold tabular-nums">{livePr?.toFixed(1) ?? "--"}%</p>
            </div>
            <div className="w-px h-6 bg-border/50" />
            <div className="text-center">
              <p className="text-muted-foreground">Availability</p>
              <p className="font-semibold tabular-nums">{plant?.availabilityPct?.toFixed(1) ?? "--"}%</p>
            </div>
            <div className="w-px h-6 bg-border/50" />
            <div className="text-center">
              <p className="text-muted-foreground">Irradiance</p>
              <p className="font-semibold tabular-nums">{liveIrradiance != null ? `${Math.round(liveIrradiance)} W/m²` : "--"}</p>
            </div>
          </div>
        </div>

        {/* ── Period tabs + date nav ────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Period pills */}
          <div className="flex items-center bg-muted/20 rounded-xl border border-border/50 p-1 gap-0.5">
            {(["day", "week", "month", "year", "lifetime"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setDateOffset(0); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  period === p
                    ? "bg-card shadow-sm text-accent-brand border-b-2 border-accent-brand"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Date navigation (only for day view) */}
          {period === "day" && (
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setDateOffset(d => d + 1)}
                className="p-1.5 rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-all text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 bg-muted/20 font-medium text-foreground">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                {dateOffset === 0 ? "Today" : displayDate}
              </span>
              <button
                onClick={() => setDateOffset(d => Math.max(0, d - 1))}
                disabled={dateOffset === 0}
                className="p-1.5 rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-all text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ── KPI strip ────────────────────────────────────────────────── */}
        <div className="flex gap-3 flex-wrap">
          {kpis.map((k, i) => (
            <KpiBox
              key={i}
              label={k.label}
              value={k.value}
              unit={k.unit}
              icon={k.icon}
              accent={k.accent}
              loading={isLoading}
            />
          ))}
        </div>

        {/* ── Main chart ───────────────────────────────────────────────── */}
        <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
          {/* Chart header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/40">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {period === "day" ? "Power Curve" : period === "week" ? "Daily Energy (Last 7 Days)" : period === "month" ? "Daily Energy (Last 30 Days)" : period === "year" ? "Monthly Generation" : "Yearly Generation"}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {period === "day" ? "15-minute intervals · kW" : "Energy output · kWh"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {period === "day" && (
                <>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="inline-block w-5 h-0.5 bg-emerald-500 rounded" /> AC Power
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="inline-block w-5 border-t border-dashed border-amber-400" /> DC Power
                  </span>
                </>
              )}
              {period !== "day" && (
                <>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500 opacity-80" /> Actual
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="inline-block w-3 h-3 rounded-sm bg-primary/50" /> Expected
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Chart body */}
          <div className="px-4 pt-4 pb-5">
            {period === "day" ? (
              trendLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="text-xs text-muted-foreground animate-pulse">Loading chart data…</div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="text-xs text-muted-foreground">No data available</div>
                </div>
              ) : (
                <SvgAreaChart
                  data={chartData as any[]}
                  xKey="label"
                  series={[
                    { key: "powerKw",   name: "AC Power", color: "hsl(142 71% 45%)" },
                    { key: "dcPowerKw", name: "DC Power", color: "hsl(38 92% 50%)", dashed: true },
                  ]}
                  height={260}
                  yFmt={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}MW` : `${v.toFixed(0)}kW`}
                />
              )
            ) : (
              chartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="text-xs text-muted-foreground">No data available</div>
                </div>
              ) : (
                <SvgComposedChart
                  data={chartData as any[]}
                  xKey="label"
                  bars={[
                    { key: "actualKwh",   name: "Actual",   color: "hsl(142 71% 45%)" },
                  ]}
                  lines={[
                    { key: "expectedKwh", name: "Expected", color: "hsl(221 83% 53%)", dashed: true },
                  ]}
                  height={260}
                  yFmt={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}GWh` : v >= 1000 ? `${(v/1000).toFixed(1)}MWh` : `${v.toFixed(0)}kWh`}
                />
              )
            )}
          </div>
        </div>

        {/* ── Secondary row: conditions + inverters ────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Site conditions */}
          <div className="bg-card border border-border/60 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-400" /> Site Conditions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Irradiance POA", value: liveIrradiance, unit: "W/m²",  icon: Sun,         warn: false },
                { label: "Irradiance GHI", value: liveIrradiance != null ? Math.round(liveIrradiance * 0.95) : null, unit: "W/m²", icon: Sun, warn: false },
                { label: "Module Temp",    value: plant?.moduleTempC,  unit: "°C",    icon: Thermometer, warn: (plant?.moduleTempC ?? 0) > 55 },
                { label: "Ambient Temp",   value: plant?.ambientTempC, unit: "°C",    icon: Wind,        warn: false },
              ].map(({ label, value, unit, icon: Icon, warn }) => (
                <div key={label} className="bg-muted/20 rounded-lg p-3 border border-border/40">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5">
                    <Icon className={`w-3 h-3 ${warn ? "text-amber-400" : ""}`} />
                    {label}
                  </div>
                  <LiveValue value={value} unit={unit} precision={1} valueClassName={`text-xl ${warn ? "text-amber-400" : ""}`} flash />
                </div>
              ))}
            </div>
          </div>

          {/* Inverter health matrix */}
          <div className="bg-card border border-border/60 rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4" /> Inverter Health
                {liveStream.connected && <span className="text-[9px] font-mono text-emerald-400">● LIVE</span>}
              </h3>
              <Link href={`${BASE}plants/${pid}/inverters`}>
                <span className="text-xs text-primary hover:underline">View all →</span>
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Online",  v: inverters.filter(i => i.status === "running").length,   cls: "text-emerald-400" },
                { label: "Standby", v: inverters.filter(i => i.status === "standby").length,   cls: "text-amber-400" },
                { label: "Fault",   v: inverters.filter(i => i.status === "fault" || i.status === "comm_lost").length, cls: "text-red-400" },
              ].map(({ label, v, cls }) => (
                <div key={label} className="bg-muted/20 rounded-lg p-2.5 text-center border border-border/40">
                  <div className={`text-2xl font-bold font-mono ${cls}`}>{isLoading ? "--" : v}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            {/* Dot matrix */}
            <div className="flex flex-wrap gap-2 flex-1">
              {inverters.length > 0 ? inverters.map((inv: any) => (
                <Link key={inv.id ?? inv.index} href={`${BASE}plants/${pid}/inverters/${inv.id ?? inv.index}`}>
                  <div
                    title={`${inv.name}: ${inv.status} · ${inv.acPowerKw?.toFixed(0) ?? 0} kW`}
                    className={`w-7 h-7 rounded-md border border-white/10 cursor-pointer hover:scale-110 transition-transform ${STATUS_DOT[inv.status] ?? "bg-muted"}`}
                  />
                </Link>
              )) : (
                <div className="text-xs text-muted-foreground">
                  {isLoading ? "Loading…" : "No inverter data"}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-3 text-[10px] text-muted-foreground flex-wrap">
              {(["running","standby","fault","comm_lost"] as const).map(s => (
                <span key={s} className="flex items-center gap-1">
                  <span className={`inline-block w-3 h-3 rounded-sm ${STATUS_DOT[s]}`} />
                  {{ running: "Running", standby: "Standby", fault: "Fault", comm_lost: "Comm Lost" }[s]}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── AI Insights ──────────────────────────────────────────────── */}
        {plantInsights.length > 0 && (
          <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
            <button
              onClick={() => setInsightsOpen(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">AI Insights</span>
                {plantInsights.some(i => i.severity === "critical") && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
                    {plantInsights.filter(i => i.severity === "critical").length} Critical
                  </span>
                )}
                {plantInsights.some(i => i.severity === "warning") && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                    {plantInsights.filter(i => i.severity === "warning").length} Warning
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Link href="/insights" onClick={e => e.stopPropagation()}>
                  <span className="text-xs text-primary hover:underline">View all →</span>
                </Link>
                {insightsOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>
            {insightsOpen && (
              <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                {plantInsights.slice(0, 3).map(insight => {
                  const cfg = {
                    critical: { color: "text-status-fault",  bg: "bg-status-fault/15",    border: "border-l-status-fault" },
                    warning:  { color: "text-[#e67e22]", bg: "bg-[#e67e22]/15",  border: "border-l-[#e67e22]" },
                    info:     { color: "text-blue-400",   bg: "bg-blue-500/15",    border: "border-l-blue-400" },
                  }[insight.severity];
                  return (
                    <div key={insight.id} className={`border border-border/50 border-l-4 ${cfg.border} rounded-lg p-3 ${cfg.bg}`}>
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color} mb-1.5`}>
                        {insight.severity} · {insight.deviceName ?? "Plant-level"}
                      </div>
                      <p className="text-xs font-semibold leading-snug mb-1.5">{insight.title}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{insight.recommendedAction}</p>
                      {insight.energyImpactKwhPerDay > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-400">
                          <Zap className="w-2.5 h-2.5" />
                          <span className="font-mono font-semibold">{insight.energyImpactKwhPerDay.toLocaleString()} kWh/day</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </AppLayout>
  );
}
