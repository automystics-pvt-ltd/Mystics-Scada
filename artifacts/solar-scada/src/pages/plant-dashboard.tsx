import {
  useGetPlant,
  useListInverters,
  getGetPlantQueryKey,
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
    <div className={`relative flex-1 min-w-0 px-5 py-4 border transition-all ${
      accent
        ? "bg-brand/5 border-brand shadow-[inset_0_0_20px_rgba(0,255,170,0.05)]"
        : "bg-card/40 border-border/50 hover:bg-brand/5 hover:border-brand/50"
    }`}>
      {accent && <div className="absolute top-0 left-0 w-1 h-full bg-brand shadow-[0_0_10px_rgba(0,255,170,0.5)]" />}
      {!accent && <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-brand/50 transition-colors" />}
      
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <div className={`w-5 h-5 flex items-center justify-center border ${accent ? "border-brand/30 bg-brand/10 text-brand" : "border-border/50 bg-card/60 text-muted-foreground"}`}>
          <Icon className="w-3 h-3" />
        </div>
      </div>
      {loading ? (
        <div className="h-6 w-24 bg-brand/10 border border-brand/20 animate-pulse mt-1" />
      ) : (
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className={`text-2xl font-mono font-bold tracking-tighter ${accent ? "text-brand drop-shadow-[0_0_5px_rgba(0,255,170,0.5)]" : "text-foreground"}`}>
            {value ?? "--"}
          </span>
          {unit && <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{unit}</span>}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
// hint: Logic changed on both sides. Requires understanding intent of each change.
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

  // Number of days to shift the reference date back for week/month navigation
  const yieldDaysOffset = useMemo(() => {
    if (period === "week") return dateOffset * 7;
    if (period === "month") return dateOffset * 30;
    return 0;
  }, [period, dateOffset]);

  const { data: yieldData } = useQuery({
    queryKey: ["plant-yield", pid, yieldPeriodMap[period], yieldDaysOffset],
    queryFn: async () => {
      const params = new URLSearchParams({ period: yieldPeriodMap[period] });
      if (yieldDaysOffset > 0) params.set("daysOffset", String(yieldDaysOffset));
      const r = await fetch(`${BASE}api/plants/${pid}/yield?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Yield fetch failed");
      return r.json();
    },
    enabled: !!pid && period !== "day",
    staleTime: 15_000,
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

  // Period label shown in the date navigation pill.
  // For week and month the label is derived from the same date arithmetic used
  // to compute yieldDaysOffset so the label always matches the data window.
  const displayDate = useMemo(() => {
    if (period === "day") {
      const d = new Date();
      d.setDate(d.getDate() - dateOffset);
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }
    if (period === "week") {
      // End of the target 7-day window (matches the API reference date)
      const end = new Date();
      end.setDate(end.getDate() - dateOffset * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      return `${fmt(start)} – ${fmt(end)} ${end.getFullYear()}`;
    }
    if (period === "month") {
      // End of the target 30-day rolling window (matches the API reference date).
      // Shown as a date range so the label exactly matches the data, regardless
      // of calendar-month boundaries (months vary between 28–31 days).
      const end = new Date();
      end.setDate(end.getDate() - dateOffset * 30);
      const start = new Date(end);
      start.setDate(start.getDate() - 29); // 30 days inclusive
      const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      const yearSuffix = end.getFullYear() !== start.getFullYear()
        ? ` ${end.getFullYear()}`
        : ` ${start.getFullYear()}`;
      return `${fmt(start)} – ${fmt(end)}${yearSuffix}`;
    }
    return "";
  }, [period, dateOffset]);

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
      partial: p.partial ?? false,
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
      <div className="flex flex-col space-y-6">

        {/* ── Breadcrumb & Header ──────────────────────────────────────── */}
        <div className="border border-border/50 bg-card/40 p-5 relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
          
          <div className="flex items-center mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Link href="/" className="hover:text-brand transition-colors">Portfolio</Link>
            <span className="mx-2 text-border/50">/</span>
            <span className="text-foreground">{plant?.name ?? "Zone"}</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-4 flex-wrap">
                <h1 className="text-xl font-mono font-bold uppercase tracking-widest text-foreground">
                  {plant?.name ?? "ZONE DASHBOARD"}
                </h1>
                {plant && <HealthBadge status={liveHealth as any} />}
                {healthScore !== null && (
                  <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border"
                    style={{ borderColor: healthScoreColor(healthScore), color: healthScoreColor(healthScore), backgroundColor: `${healthScoreColor(healthScore)}20` }}>
                    H:{healthScore}/100
                  </span>
                )}
                <div className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border ${
                  liveStream.connected
                    ? "bg-brand/10 border-brand/30 text-brand"
                    : "bg-card/60 border-border/50 text-muted-foreground"
                }`}>
                  {liveStream.connected
                    ? <Radio className="h-3 h-3 animate-pulse" />
                    : <WifiOff className="h-3 h-3" />}
                  {liveStream.connected ? "STREAM: ACTIVE" : "POLLING"}
                </div>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
                {plant?.region} // {plant?.capacityKw ? `${(plant.capacityKw / 1000).toFixed(2)} MWP CAP` : "--"}
              </p>
            </div>
            
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 custom-scrollbar">
              {SUB_NAV(pid).map((item) => {
                const isActive = item.href === `${BASE}plants/${pid}` || item.href === `${BASE}plants/${pid}/`;
                return (
                  <Link key={item.name} href={item.href}>
                    <button className={`flex items-center gap-2 px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${
                      isActive
                        ? "bg-brand/10 text-brand border border-brand/50 shadow-[0_0_10px_rgba(0,255,170,0.2)]"
                        : "bg-card/40 text-muted-foreground border border-border/50 hover:bg-brand/5 hover:text-brand hover:border-brand/30"
                    }`}>
                      {item.icon && <item.icon className="w-3.5 h-3.5" />}
                      {item.name}
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── HERO: Live power number ───────────────────────────────────── */}
        <div className="border border-border/50 bg-card/60 relative overflow-hidden flex flex-col items-center justify-center py-12">
          {/* Subtle grid background */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
          
          <p className="font-mono text-[10px] font-bold text-brand uppercase tracking-widest mb-4 z-10 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-brand animate-pulse" /> LIVE POWER VECTOR
          </p>
          
          <div className="flex items-baseline gap-3 z-10">
            {isLoading ? (
              <div className="h-24 w-64 bg-brand/5 border border-brand/20 animate-pulse" />
            ) : (
              <>
                <span className="text-[100px] font-mono font-bold tabular-nums text-foreground leading-none tracking-tighter drop-shadow-[0_0_20px_rgba(0,255,170,0.15)]">
                  {livePower != null
                    ? livePower >= 1000
                      ? (livePower / 1000).toFixed(2)
                      : livePower.toFixed(2)
                    : "--"}
                </span>
                <span className="text-3xl font-mono font-bold text-brand/80">
                  {livePower != null && livePower >= 1000 ? "MW" : "KW"}
                </span>
              </>
            )}
          </div>
          
          {/* Mini live trend inline */}
          {powerHistory.length >= 8 && (
            <div className="mt-8 w-full max-w-lg px-6 opacity-80 z-10">
              <MiniLineChart color="hsl(var(--brand))" points={powerHistory} />
              <div className="flex justify-between items-center mt-2 border-t border-brand/20 pt-2">
                <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest">
                  {powerHistory[0]?.label}
                </p>
                <p className="font-mono text-[9px] text-brand uppercase tracking-widest">
                  CURRENT
                </p>
              </div>
            </div>
          )}
          
          {/* PR + Availability inline */}
          <div className="flex items-center gap-8 mt-10 text-xs border border-border/50 bg-card/80 px-8 py-4 z-10 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
            <div className="text-center">
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">PRF RATIO</p>
              <p className="font-mono font-bold text-foreground text-base">{livePr?.toFixed(1) ?? "--"}%</p>
            </div>
            <div className="w-px h-10 bg-border/50" />
            <div className="text-center">
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">AVAILABILITY</p>
              <p className="font-mono font-bold text-foreground text-base">{plant?.availabilityPct?.toFixed(1) ?? "--"}%</p>
            </div>
            <div className="w-px h-10 bg-border/50" />
            <div className="text-center">
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">IRRADIANCE</p>
              <p className="font-mono font-bold text-brand text-base">{liveIrradiance != null ? `${Math.round(liveIrradiance)}` : "--"} <span className="text-xs text-brand/60">W/m²</span></p>
            </div>
          </div>
        </div>

        {/* ── Period tabs + date nav ────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center border border-border/50 bg-card/40 p-1">
            {(["day", "week", "month", "year", "lifetime"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setDateOffset(0); }}
                className={`px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-all ${
                  period === p
                    ? "bg-brand/20 text-brand border border-brand/50 shadow-[0_0_10px_rgba(0,255,170,0.2)]"
                    : "text-muted-foreground border border-transparent hover:text-foreground hover:bg-card/60"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          {(period === "day" || period === "week" || period === "month") && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDateOffset(d => d + 1)}
                className="p-2 border border-border/50 bg-card/40 text-muted-foreground hover:text-brand hover:border-brand/50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="flex items-center gap-2 px-4 py-2 border border-brand/30 bg-brand/5 font-mono text-[10px] text-brand uppercase tracking-widest min-w-[140px] justify-center">
                <Calendar className="w-3.5 h-3.5" />
                {period === "day" && dateOffset === 0 ? "TODAY (LIVE)" : displayDate}
              </span>
              <button
                onClick={() => setDateOffset(d => Math.max(0, d - 1))}
                disabled={dateOffset === 0}
                className="p-2 border border-border/50 bg-card/40 text-muted-foreground hover:text-brand hover:border-brand/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* ── KPI strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up" style={{ animationDelay: '200ms' }}>
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
        <div className="border border-border/50 bg-card/60 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-border/50" />
          
          {/* Chart header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 border-b border-border/50 bg-card/40">
            <div>
              <h3 className="font-mono text-sm uppercase tracking-widest text-foreground font-bold">
                {period === "day"
                  ? "POWER VECTOR"
                  : period === "week"
                  ? `ENERGY OUTPUT // ${displayDate}`
                  : period === "month"
                  ? `ENERGY OUTPUT // ${displayDate}`
                  : period === "year"
                  ? "MONTHLY GENERATION"
                  : "LIFETIME GENERATION"}
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                {period === "day" ? "15-MIN INTERVALS // KW" : "ENERGY OUTPUT // KWH"}
              </p>
            </div>
            <div className="flex items-center gap-4 mt-3 sm:mt-0">
              {period === "day" && (
                <>
                  <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-brand">
                    <span className="inline-block w-4 h-1 bg-brand shadow-[0_0_5px_var(--brand)]" /> AC_PWR
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-status-warning">
                    <span className="inline-block w-4 border-t-2 border-dashed border-status-warning" /> DC_PWR
                  </span>
                </>
              )}
              {period !== "day" && (
                <>
                  <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-brand">
                    <span className="inline-block w-3 h-3 bg-brand" /> ACTUAL
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-status-warning">
                    <span className="inline-block w-3 h-3 bg-status-warning/50" /> EXPECTED
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Chart body */}
          <div className="p-5">
            {period === "day" ? (
              trendLoading ? (
                <div className="h-[260px] flex items-center justify-center">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-brand animate-pulse">QUERYING TELEMETRY...</div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-status-warning border border-status-warning/30 bg-status-warning/5 px-4 py-2">DATA STREAM EMPTY</div>
                </div>
              ) : (
                <SvgAreaChart
                  data={chartData as any[]}
                  xKey="label"
                  series={[
                    { key: "powerKw",   name: "AC Power", color: "hsl(var(--brand))" },
                    { key: "dcPowerKw", name: "DC Power", color: "hsl(var(--status-warning))", dashed: true },
                  ]}
                  height={260}
                  yFmt={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}MW` : `${v.toFixed(0)}KW`}
                />
              )
            ) : (
              chartData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-status-warning border border-status-warning/30 bg-status-warning/5 px-4 py-2">DATA STREAM EMPTY</div>
                </div>
              ) : (
                <SvgComposedChart
                  data={chartData as any[]}
                  xKey="label"
                  bars={[
                    { key: "actualKwh",   name: "Actual",   color: "hsl(var(--brand))" },
                  ]}
                  lines={[
                    { key: "expectedKwh", name: "Expected", color: "hsl(var(--status-warning))", dashed: true },
                  ]}
                  height={260}
                  yFmt={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}GWH` : v >= 1000 ? `${(v/1000).toFixed(1)}MWH` : `${v.toFixed(0)}KWH`}
                  partialDataKey="partial"
                />
              )
            )}
          </div>
        </div>

        {/* ── Secondary row: conditions + inverters ────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Site conditions */}
          <div className="border border-border/50 bg-card/40 relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-status-warning/50" />
            <h3 className="font-mono text-sm uppercase tracking-widest text-foreground flex items-center gap-2 p-5 border-b border-border/50">
              <Sun className="w-4 h-4 text-status-warning" /> METEOROLOGICAL VECTOR
            </h3>
            <div className="p-5 grid grid-cols-2 gap-4">
              {[
                { label: "POA IRRADIANCE", value: liveIrradiance, unit: "W/m²",  icon: Sun,         warn: false },
                { label: "GHI IRRADIANCE", value: liveIrradiance != null ? Math.round(liveIrradiance * 0.95) : null, unit: "W/m²", icon: Sun, warn: false },
                { label: "ARRAY TEMP",     value: plant?.moduleTempC,  unit: "°C",    icon: Thermometer, warn: (plant?.moduleTempC ?? 0) > 55 },
                { label: "AMBIENT TEMP",   value: plant?.ambientTempC, unit: "°C",    icon: Wind,        warn: false },
              ].map(({ label, value, unit, icon: Icon, warn }) => (
                <div key={label} className={`border border-border/50 bg-card/60 p-4 transition-colors ${warn ? "border-status-warning/50 shadow-[inset_0_0_15px_rgba(251,191,36,0.1)]" : ""}`}>
                  <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                    <Icon className={`w-3 h-3 ${warn ? "text-status-warning" : "text-brand/50"}`} />
                    {label}
                  </div>
                  <LiveValue value={value} unit={unit} precision={1} valueClassName={`font-mono text-xl font-bold ${warn ? "text-status-warning drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]" : "text-foreground"}`} flash />
                </div>
              ))}
            </div>
          </div>

          {/* Inverter health matrix */}
          <div className="border border-border/50 bg-card/40 relative flex flex-col">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
            <div className="flex items-center justify-between p-5 border-b border-border/50">
              <h3 className="font-mono text-sm uppercase tracking-widest text-foreground flex items-center gap-2">
                <Cpu className="w-4 h-4 text-brand" /> HARDWARE TOPOLOGY
                {liveStream.connected && <span className="text-[9px] font-mono text-brand border border-brand/30 bg-brand/10 px-1 ml-2 animate-pulse">LIVE</span>}
              </h3>
              <Link href={`${BASE}plants/${pid}/inverters`} className="font-mono text-[9px] uppercase tracking-widest text-brand hover:text-brand/80 border-b border-dashed border-brand/50 hover:border-brand">
                ACCESS MATRIX
              </Link>
            </div>
            
            <div className="p-5 flex-1 flex flex-col">
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { label: "ONLINE",  v: inverters.filter(i => i.status === "running").length,   cls: "text-brand drop-shadow-[0_0_5px_rgba(0,255,170,0.5)] border-brand/30 bg-brand/5" },
                  { label: "STANDBY", v: inverters.filter(i => i.status === "standby").length,   cls: "text-status-warning drop-shadow-[0_0_5px_rgba(251,191,36,0.5)] border-status-warning/30 bg-status-warning/5" },
                  { label: "FAULT",   v: inverters.filter(i => i.status === "fault" || i.status === "comm_lost").length, cls: "text-status-fault drop-shadow-[0_0_5px_rgba(239,68,68,0.5)] border-status-fault/30 bg-status-fault/5" },
                ].map(({ label, v, cls }) => (
                  <div key={label} className={`border p-3 text-center ${cls}`}>
                    <div className="font-mono text-2xl font-bold">{isLoading ? "--" : v}</div>
                    <div className="font-mono text-[9px] uppercase tracking-widest opacity-80 mt-1">{label}</div>
                  </div>
                ))}
              </div>
              
              {/* Dot matrix */}
              <div className="flex flex-wrap gap-2 flex-1 items-start content-start">
                {inverters.length > 0 ? inverters.map((inv: any) => (
                  <Link key={inv.id ?? inv.index} href={`${BASE}plants/${pid}/inverters/${inv.id ?? inv.index}`}>
                    <div
                      title={`${inv.name}: ${inv.status} // ${inv.acPowerKw?.toFixed(0) ?? 0} KW`}
                      className={`w-6 h-6 border cursor-pointer transition-all hover:scale-110 ${
                        inv.status === "running" ? "bg-brand/20 border-brand text-brand shadow-[0_0_5px_rgba(0,255,170,0.3)]" :
                        inv.status === "standby" ? "bg-status-warning/20 border-status-warning text-status-warning" :
                        inv.status === "fault" ? "bg-status-fault/20 border-status-fault text-status-fault animate-pulse" :
                        "bg-border/50 border-muted-foreground text-muted-foreground"
                      }`}
                    />
                  </Link>
                )) : (
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {isLoading ? "INITIALIZING MATRIX..." : "NO HARDWARE REGISTERED"}
                  </div>
                )}
              </div>
              
              <div className="flex gap-4 mt-5 pt-3 border-t border-border/50 text-[9px] font-mono uppercase tracking-widest text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-brand/50 border border-brand" /> ONLINE</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-status-warning/50 border border-status-warning" /> STANDBY</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-status-fault/50 border border-status-fault" /> FAULT</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-border/50 border border-muted-foreground" /> NO COMM</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── AI Insights ──────────────────────────────────────────────── */}
        {plantInsights.length > 0 && (
          <div className="border border-brand/30 bg-card/60 relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand shadow-[0_0_10px_rgba(0,255,170,0.5)]" />
            <button
              onClick={() => setInsightsOpen(v => !v)}
              className="w-full flex items-center justify-between p-5 hover:bg-brand/5 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Brain className="w-4 h-4 text-brand" />
                <span className="font-mono text-sm uppercase tracking-widest font-bold text-brand">INTELLIGENCE VECTORS</span>
                {plantInsights.some(i => i.severity === "critical") && (
                  <span className="font-mono text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 border border-status-fault/50 bg-status-fault/10 text-status-fault ml-2">
                    {plantInsights.filter(i => i.severity === "critical").length} CRITICAL
                  </span>
                )}
                {plantInsights.some(i => i.severity === "warning") && (
                  <span className="font-mono text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 border border-status-warning/50 bg-status-warning/10 text-status-warning ml-2">
                    {plantInsights.filter(i => i.severity === "warning").length} WARNING
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <Link href="/insights" onClick={e => e.stopPropagation()} className="font-mono text-[9px] uppercase tracking-widest text-brand hover:text-brand/80 border-b border-dashed border-brand/50 hover:border-brand">
                  ACCESS ALL VECTORS
                </Link>
                {insightsOpen ? <ChevronUp className="w-4 h-4 text-brand" /> : <ChevronDown className="w-4 h-4 text-brand" />}
              </div>
            </button>
            {insightsOpen && (
              <div className="p-5 pt-0 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-brand/10">
                {plantInsights.slice(0, 3).map(insight => {
                  const cfg = {
                    critical: { color: "text-status-fault",  bg: "bg-status-fault/5 border-status-fault/50",    border: "bg-status-fault" },
                    warning:  { color: "text-status-warning", bg: "bg-status-warning/5 border-status-warning/50",  border: "bg-status-warning" },
                    info:     { color: "text-brand",   bg: "bg-brand/5 border-brand/30",    border: "bg-brand" },
                  }[insight.severity];
                  return (
                    <div key={insight.id} className={`border p-4 relative overflow-hidden ${cfg.bg}`}>
                      <div className={`absolute top-0 left-0 w-1 h-full ${cfg.border}`} />
                      <div className={`text-[9px] font-mono font-bold uppercase tracking-widest ${cfg.color} mb-2`}>
                        {insight.severity} // {insight.deviceName ?? "ZONE LEVEL"}
                      </div>
                      <p className="font-mono text-xs text-foreground font-bold leading-snug mb-2 uppercase">{insight.title}</p>
                      <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest leading-relaxed line-clamp-3 mb-3">{insight.recommendedAction}</p>
                      {insight.energyImpactKwhPerDay > 0 && (
                        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-status-warning border border-status-warning/20 bg-status-warning/10 px-2 py-1 inline-flex">
                          <Zap className="w-3 h-3" />
                          {insight.energyImpactKwhPerDay.toLocaleString()} KWH/DAY IMPACT
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
