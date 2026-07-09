import {
  useGetPlant,
  useGetPlantYield,
  useListInverters,
  getGetPlantQueryKey,
  getGetPlantYieldQueryKey,
  getListInvertersQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { KpiCard, HealthBadge, LiveValue, GenerationRing } from "@/components/ui/scada";
import { Link, useParams } from "wouter";
import {
  Sun, Thermometer, Activity, Zap, Network, Cpu, BarChart4, CloudLightning,
  Wind, Droplets, ArrowLeft, TrendingUp, Brain, ChevronDown, ChevronUp,
  TrendingDown, AlertTriangle, Layers,
} from "lucide-react";
import { computeHealthScore, healthScoreColor, syntheticSparkline } from "@/lib/plantHierarchy";
import { HealthScoreGauge } from "@/components/ui/scada";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SvgAreaChart } from "@/components/ui/svg-charts";

const BASE = import.meta.env.BASE_URL as string;

interface PlantInsight {
  id: string; type: string; severity: "critical" | "warning" | "info";
  plantId: string; deviceName?: string; title: string;
  recommendedAction: string; energyImpactKwhPerDay: number;
}

const PLANT_SEV = {
  critical: { color: "text-status-fault", bg: "bg-status-fault/10", border: "border-l-status-fault" },
  warning:  { color: "text-status-warning", bg: "bg-status-warning/10", border: "border-l-[hsl(38,92%,50%)]" },
  info:     { color: "text-primary", bg: "bg-primary/10", border: "border-l-primary" },
} as const;

const SUB_NAV = (plantId: string) => [
  { name: "Overview",          href: `/plants/${plantId}`,           icon: null },
  { name: "Single Line Diagram", href: `/plants/${plantId}/sld`,     icon: Network },
  { name: "Zones",             href: `/plants/${plantId}/zones`,     icon: Layers },
  { name: "Inverters",         href: `/plants/${plantId}/inverters`, icon: Cpu },
  { name: "Weather",           href: `/plants/${plantId}/weather`,   icon: CloudLightning },
  { name: "Analytics",         href: `/plants/${plantId}/analytics`, icon: BarChart4 },
];

// InverterStatus → dot color
const STATUS_DOT: Record<string, string> = {
  running:   "bg-status-normal",
  standby:   "bg-status-warning",
  fault:     "bg-status-fault",
  comm_lost: "bg-status-offline",
};

export default function PlantDashboard() {
  const { plantId } = useParams();
  const pid = plantId || "";

  const { data: plant, isLoading, isError } = useGetPlant(pid, {
    query: { enabled: !!pid, refetchInterval: 10000, queryKey: getGetPlantQueryKey(pid) }
  });

  const { data: yieldData } = useGetPlantYield(pid, { period: "daily" }, {
    query: { enabled: !!pid, queryKey: getGetPlantYieldQueryKey(pid, { period: "daily" }) }
  });

  const { data: inverters } = useListInverters(pid, {
    query: { enabled: !!pid, refetchInterval: 15000, queryKey: getListInvertersQueryKey(pid) }
  });

  const [insightsExpanded, setInsightsExpanded] = useState(true);
  const { data: plantInsights = [] } = useQuery<PlantInsight[]>({
    queryKey: ["insights", pid],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/insights?plantId=${pid}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json() as Promise<PlantInsight[]>;
    },
    enabled: !!pid,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (isError) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <Zap className="w-12 h-12 text-status-fault mb-4" />
          <h2 className="text-xl font-bold">Failed to load plant</h2>
          <p className="text-muted-foreground mt-2">Could not retrieve telemetry for this plant.</p>
          <Link href="/" className="mt-6 text-primary hover:underline flex items-center">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Portfolio
          </Link>
        </div>
      </AppLayout>
    );
  }

  /* Derived data ─────────────────────────────── */
  const todayKwh  = plant?.todayEnergyKwh ?? 0;
  const capacityKw = plant?.capacityKw ?? 1;
  // Simple daily target: capacity × irradiance hours estimate (5 h/day avg)
  const dailyTargetKwh = capacityKw * 5;
  const genProgressPct = Math.min(100, (todayKwh / dailyTargetKwh) * 100);

  const chartPoints = yieldData?.points ?? [];

  const now = new Date();
  const currentHourLabel = `${now.getHours()}:00`;

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">

        {/* Breadcrumb + title */}
        <div>
          <div className="flex items-center mb-1 text-sm text-muted-foreground gap-2">
            <Link href="/" className="hover:text-foreground transition-colors">Portfolio</Link>
            <span>/</span>
            <span className="text-foreground">{plant?.name ?? "Loading…"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{plant?.name ?? "Plant Dashboard"}</h1>
            {plant && <HealthBadge status={plant.healthStatus} className="mt-0.5" />}
            {plant && (() => {
              const score = computeHealthScore(
                plant.pr,
                plant.availabilityPct,
                { critical: plant.alertCounts?.critical ?? 0, major: plant.alertCounts?.major ?? 0 },
              );
              return (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border">
                  <span className="text-xs text-muted-foreground">Health</span>
                  <span className="text-sm font-bold font-mono" style={{ color: healthScoreColor(score) }}>
                    {score} / 100
                  </span>
                </div>
              );
            })()}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {plant?.region} · {plant?.capacityKw ? (plant.capacityKw / 1000).toFixed(2) : "--"} MWp installed
          </p>
        </div>

        {/* Sub-nav tabs — scrollable on mobile */}
        <div className="border-b border-border -mx-4 px-4 md:mx-0 md:px-0">
          <nav className="-mb-px flex gap-5 overflow-x-auto scrollbar-none">
            {SUB_NAV(pid).map(item => (
              <Link
                key={item.name}
                href={item.href}
                className={`flex-shrink-0 whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm flex items-center transition-colors ${
                  item.href === `/plants/${pid}`
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {item.icon && <item.icon className="w-4 h-4 mr-1.5" />}
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        {/* Live KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Live Power"      value={plant?.currentPowerKw} unit="kW"  precision={0} icon={Zap}      loading={isLoading} className="border-primary/20 bg-primary/5" />
          <KpiCard title="Today's Energy"  value={plant?.todayEnergyKwh} unit="kWh" precision={0} icon={Activity}  loading={isLoading} />
          <KpiCard title="Performance Ratio" value={plant?.pr}           unit="%"   precision={1} icon={BarChart4} loading={isLoading} trend={{ value: +(((plant?.pr ?? 0) - 80)).toFixed(1), label: "vs 80% target", positive: (plant?.pr ?? 0) >= 80 }} />
          <KpiCard title="Availability"    value={plant?.availabilityPct} unit="%"  precision={1} icon={TrendingUp} loading={isLoading} />
        </div>

        {/* Generation progress + Power chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Generation ring */}
          <div className="bg-card border border-card-border rounded-xl p-6 flex flex-col items-center justify-center gap-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Today's Progress</p>
            <GenerationRing
              pct={genProgressPct}
              label={`${todayKwh >= 1000 ? (todayKwh / 1000).toFixed(1) + " MWh" : todayKwh.toFixed(0) + " kWh"}`}
              sublabel={`est. ${(dailyTargetKwh / 1000).toFixed(1)} MWh target`}
              size={130}
              strokeWidth={10}
              color={genProgressPct >= 60 ? "hsl(142 71% 45%)" : genProgressPct >= 30 ? "hsl(38 92% 50%)" : "hsl(220 9% 46%)"}
            />
            <div className="w-full border-t border-border pt-3 grid grid-cols-2 gap-2 text-center text-xs">
              <div>
                <div className="text-muted-foreground">Specific Yield</div>
                <div className="font-mono font-semibold mt-0.5">
                  {yieldData ? yieldData.specificYieldKwhPerKwp.toFixed(2) : "--"} kWh/kWp
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Deviation</div>
                <div className={`font-mono font-semibold mt-0.5 ${genProgressPct >= 90 ? "text-status-normal" : genProgressPct >= 60 ? "text-status-warning" : "text-muted-foreground"}`}>
                  {genProgressPct > 0 ? `${(genProgressPct - 100).toFixed(1)}%` : "--"}
                </div>
              </div>
            </div>
          </div>

          {/* Hourly power chart */}
          <div className="lg:col-span-2 bg-card border border-card-border rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Hourly Generation — Today</h3>
              <span className="text-xs text-muted-foreground font-mono">kWh per hour</span>
            </div>
            <div className="flex-1 min-h-[180px]">
              {chartPoints.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No data for today yet
                </div>
              ) : (
                <SvgAreaChart
                  data={chartPoints as unknown as Record<string, unknown>[]}
                  xKey="label"
                  series={[
                    { key: "expectedKwh", name: "Expected", color: "hsl(221 83% 53%)", dashed: true },
                    { key: "actualKwh",   name: "Actual",   color: "hsl(142 71% 45%)" },
                  ]}
                  height={180}
                  refX={currentHourLabel}
                />
              )}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-0.5 bg-[hsl(142,71%,45%)]" /> Actual</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-t border-dashed border-[hsl(221,83%,53%)]" /> Expected</span>
            </div>
          </div>
        </div>

        {/* Environment + Inverter matrix */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Environment */}
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Sun className="w-4 h-4 text-status-warning" /> Site Conditions</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Irradiance POA", value: plant?.irradiancePoaWm2, unit: "W/m²", icon: Sun, warn: false },
                { label: "Irradiance GHI", value: plant?.irradianceGhiWm2, unit: "W/m²", icon: Sun, warn: false },
                { label: "Module Temp",    value: plant?.moduleTempC,       unit: "°C",   icon: Thermometer, warn: (plant?.moduleTempC ?? 0) > 55 },
                { label: "Ambient Temp",   value: plant?.ambientTempC,      unit: "°C",   icon: Wind,        warn: false },
              ].map(({ label, value, unit, icon: Icon, warn }) => (
                <div key={label} className="space-y-1 bg-muted/30 rounded-lg p-3 border border-border/50">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className={`w-3.5 h-3.5 ${warn ? "text-status-warning" : ""}`} />
                    {label}
                  </div>
                  <LiveValue
                    value={value}
                    unit={unit}
                    precision={1}
                    valueClassName={`text-xl ${warn ? "text-status-warning" : ""}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Inverter health matrix */}
          <div className="bg-card border border-card-border rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Cpu className="w-4 h-4" /> Inverter Health</h3>
              <Link href={`/plants/${pid}/inverters`} className="text-xs text-primary hover:underline">View all →</Link>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Online",  value: (plant?.inverterCount ?? 0) - (plant?.offlineInverterCount ?? 0), cls: "text-status-normal" },
                { label: "Offline", value: plant?.offlineInverterCount ?? 0,                                  cls: "text-status-fault" },
                { label: "Alerts",  value: plant?.alertCounts.major ?? 0,                                     cls: "text-status-warning" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="bg-muted/30 rounded-lg p-2.5 text-center border border-border/50">
                  <div className={`text-2xl font-bold font-mono ${cls}`}>{isLoading ? "--" : value}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Dot matrix */}
            <div className="flex-1 overflow-hidden">
              {inverters && inverters.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {inverters.map(inv => (
                    <Link key={inv.id} href={`/plants/${pid}/inverters/${inv.id}`}>
                      <div
                        title={`${inv.name}: ${inv.status} · ${inv.acPowerKw?.toFixed(0) ?? 0} kW`}
                        className={`w-6 h-6 rounded-sm border border-white/10 cursor-pointer hover:scale-125 transition-transform ${STATUS_DOT[inv.status] ?? "bg-muted"}`}
                      />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-16 text-muted-foreground text-sm">
                  {isLoading ? "Loading inverters…" : "No inverter data"}
                </div>
              )}
              {inverters && inverters.length > 0 && (
                <div className="flex gap-4 mt-3 text-[10px] text-muted-foreground flex-wrap">
                  {(["running","standby","fault","comm_lost"] as const).map(s => (
                    <span key={s} className="flex items-center gap-1">
                      <span className={`inline-block w-3 h-3 rounded-sm ${STATUS_DOT[s]}`} />
                      {s === "comm_lost" ? "Comm Lost" : s.charAt(0).toUpperCase() + s.slice(1)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Insights panel */}
        {plantInsights.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <button
              onClick={() => setInsightsExpanded(e => !e)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">AI Insights</span>
                <span className="ml-1 flex items-center gap-1.5">
                  {plantInsights.some(i => i.severity === "critical") && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-status-fault/15 text-status-fault">
                      {plantInsights.filter(i => i.severity === "critical").length} Critical
                    </span>
                  )}
                  {plantInsights.some(i => i.severity === "warning") && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-status-warning/15 text-status-warning">
                      {plantInsights.filter(i => i.severity === "warning").length} Warning
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/insights" onClick={e => e.stopPropagation()}>
                  <span className="text-xs text-primary hover:underline">View all →</span>
                </Link>
                {insightsExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>

            {insightsExpanded && (
              <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                {plantInsights.slice(0, 3).map(insight => {
                  const sev = PLANT_SEV[insight.severity];
                  return (
                    <div key={insight.id} className={`border border-card-border border-l-4 ${sev.border} rounded-lg p-3 ${sev.bg}`}>
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${sev.color} mb-1.5`}>
                        {insight.severity} · {insight.deviceName ?? "Plant-level"}
                      </div>
                      <p className="text-xs font-semibold leading-snug mb-1.5">{insight.title}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{insight.recommendedAction}</p>
                      {insight.energyImpactKwhPerDay > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-status-warning">
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
