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
  Wind, ArrowLeft, TrendingUp, Brain, ChevronDown, ChevronUp,
  AlertTriangle, Layers, Radio, WifiOff,
} from "lucide-react";
import { computeHealthScore, healthScoreColor } from "@/lib/plantHierarchy";
import { HealthScoreGauge } from "@/components/ui/scada";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { SvgAreaChart, MiniLineChart } from "@/components/ui/svg-charts";
import { HeartPulse } from "lucide-react";
import { usePlantTelemetryStream, type LiveInverter } from "@/hooks/usePlantTelemetryStream";

const BASE = import.meta.env.BASE_URL as string;

interface DeviceHealthSummary {
  plantId: string;
  totalDevices: number;
  online: number;
  offline: number;
  degraded: number;
  error: number;
  avgHealthScore: number | null;
  worstDevices: { id: string; name: string; status: string; healthScore: number | null }[];
  sparkline: { timestamp: string; onlinePct: number }[];
}

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
  { name: "Overview",            href: `/plants/${plantId}`,           icon: null },
  { name: "Single Line Diagram", href: `/plants/${plantId}/sld`,       icon: Network },
  { name: "Zones",               href: `/plants/${plantId}/zones`,     icon: Layers },
  { name: "Inverters",           href: `/plants/${plantId}/inverters`, icon: Cpu },
  { name: "Weather",             href: `/plants/${plantId}/weather`,   icon: CloudLightning },
  { name: "Analytics",           href: `/plants/${plantId}/analytics`, icon: BarChart4 },
];

const STATUS_DOT: Record<string, string> = {
  running:   "bg-status-normal",
  standby:   "bg-status-warning",
  fault:     "bg-status-fault",
  comm_lost: "bg-status-offline",
};

const STATUS_LABEL: Record<string, string> = {
  running:   "Running",
  standby:   "Standby",
  fault:     "Fault",
  comm_lost: "Comm Lost",
};

/** Build a merged inverter list: use live SSE data where available, poll data otherwise. */
function mergeInverters(
  polled: any[] | undefined,
  live: LiveInverter[] | undefined,
): any[] {
  if (!polled?.length) return [];
  if (!live?.length) return polled;
  return polled.map(inv => {
    const lv = live.find(l => l.index === inv.index);
    if (!lv) return inv;
    return {
      ...inv,
      status:        lv.status,
      acPowerKw:     lv.acPowerKw,
      dcPowerKw:     lv.dcPowerKw,
      acVoltageV:    lv.acVoltageV,
      acCurrentA:    lv.acCurrentA,
      efficiencyPct: lv.efficiencyPct,
      temperatureC:  lv.temperatureC,
    };
  });
}

export default function PlantDashboard() {
  const { plantId } = useParams();
  const pid = plantId || "";

  const { data: plant, isLoading, isError } = useGetPlant(pid, {
    query: { enabled: !!pid, refetchInterval: 30_000, queryKey: getGetPlantQueryKey(pid) }
  });

  const { data: yieldData } = useGetPlantYield(pid, { period: "daily" }, {
    query: { enabled: !!pid, queryKey: getGetPlantYieldQueryKey(pid, { period: "daily" }) }
  });

  const { data: polledInverters } = useListInverters(pid, {
    query: { enabled: !!pid, refetchInterval: 30_000, queryKey: getListInvertersQueryKey(pid) }
  });

  const { data: deviceHealth } = useQuery<DeviceHealthSummary>({
    queryKey: ["plant-device-health", pid],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/plants/${pid}/device-health`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load device health");
      return r.json() as Promise<DeviceHealthSummary>;
    },
    enabled: !!pid,
    refetchInterval: 60_000,
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

  // ── Real-time SSE for inverter-level data ───────────────────────────────
  const liveStream = usePlantTelemetryStream(pid || null);

  // Ring buffer of live power readings for a micro power-trend sparkline
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
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  }, [liveStream.latest]);

  // Merged inverter list (SSE live overrides poll data)
  const inverters = mergeInverters(polledInverters as any[] | undefined, liveStream.latest?.inverters);

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
  const todayKwh    = plant?.todayEnergyKwh ?? 0;
  const capacityKw  = plant?.capacityKw ?? 1;
  const dailyTargetKwh = capacityKw * 5;
  const genProgressPct = Math.min(100, (todayKwh / dailyTargetKwh) * 100);
  const chartPoints    = yieldData?.points ?? [];
  const now            = new Date();
  const currentHourLabel = `${now.getHours()}:00`;

  // Live irradiance — prefer SSE frame, fall back to plant API field
  const liveIrradiance  = liveStream.latest?.irradianceWm2 ?? plant?.irradiancePoaWm2 ?? null;
  const liveHealth      = liveStream.latest?.health ?? plant?.healthStatus ?? "offline";
  const livePower       = liveStream.latest?.powerKw ?? plant?.currentPowerKw ?? null;
  const livePr          = liveStream.latest?.pr ?? plant?.pr ?? null;

  const offlineCount = inverters.filter(inv =>
    inv.status === "fault" || inv.status === "comm_lost"
  ).length;

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
            {plant && <HealthBadge status={liveHealth as any} className="mt-0.5" />}
            {plant && (() => {
              const score = computeHealthScore(
                livePr ?? 0,
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
            {/* Live SSE indicator */}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium ${
              liveStream.connected
                ? "bg-status-normal/8 border-status-normal/20 text-status-normal"
                : "bg-muted/50 border-border text-muted-foreground"
            }`}>
              {liveStream.connected
                ? <Radio className="h-3 w-3 animate-pulse" />
                : <WifiOff className="h-3 w-3" />}
              {liveStream.connected ? "SSE Live" : "Polling"}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {plant?.region} · {plant?.capacityKw ? (plant.capacityKw / 1000).toFixed(2) : "--"} MWp installed
          </p>
        </div>

        {/* Sub-nav tabs */}
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

        {/* Live KPIs — SSE-driven with flash on change */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Live Power"        value={livePower}              unit="kW"  precision={0} icon={Zap}      loading={isLoading} className="border-primary/20 bg-primary/5" />
          <KpiCard title="Today's Energy"    value={plant?.todayEnergyKwh}  unit="kWh" precision={0} icon={Activity}  loading={isLoading} />
          <KpiCard title="Performance Ratio" value={livePr}                 unit="%"   precision={1} icon={BarChart4} loading={isLoading} trend={{ value: +(((livePr ?? 0) - 80)).toFixed(1), label: "vs 80% target", positive: (livePr ?? 0) >= 80 }} />
          <KpiCard title="Availability"      value={plant?.availabilityPct} unit="%"   precision={1} icon={TrendingUp} loading={isLoading} />
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

        {/* Live power trend (from SSE ring buffer) */}
        {powerHistory.length >= 4 && (
          <div className="bg-card border border-card-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Radio className="w-4 h-4 text-status-normal animate-pulse" />
                Real-Time Power Trend
              </h3>
              <span className="text-[10px] text-muted-foreground font-mono">
                {powerHistory.length} pts · 3s interval · SSE
              </span>
            </div>
            <MiniLineChart
              color="hsl(var(--primary))"
              points={powerHistory}
            />
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{powerHistory[0]?.label}</span>
              <span className="font-mono text-foreground font-semibold">
                {livePower != null ? `${livePower >= 1000 ? (livePower / 1000).toFixed(2) + " MW" : livePower.toFixed(0) + " kW"}` : "--"}
              </span>
              <span>{powerHistory[powerHistory.length - 1]?.label} (now)</span>
            </div>
          </div>
        )}

        {/* Environment + Inverter matrix */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Environment / Site Conditions */}
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Sun className="w-4 h-4 text-status-warning" /> Site Conditions</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Irradiance POA",   value: liveIrradiance,              unit: "W/m²", icon: Sun,         warn: false },
                { label: "Irradiance GHI",   value: liveIrradiance != null ? Math.round(liveIrradiance * 0.95) : null, unit: "W/m²", icon: Sun, warn: false },
                { label: "Module Temp",       value: plant?.moduleTempC,           unit: "°C",   icon: Thermometer, warn: (plant?.moduleTempC ?? 0) > 55 },
                { label: "Ambient Temp",      value: plant?.ambientTempC,          unit: "°C",   icon: Wind,        warn: false },
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
                    flash
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Inverter health matrix — live from SSE */}
          <div className="bg-card border border-card-border rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4" /> Inverter Health
                {liveStream.connected && (
                  <span className="text-[9px] font-mono text-status-normal ml-1">● LIVE</span>
                )}
              </h3>
              <Link href={`/plants/${pid}/inverters`} className="text-xs text-primary hover:underline">View all →</Link>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Online",  value: inverters.filter(i => i.status === "running").length, cls: "text-status-normal" },
                { label: "Standby", value: inverters.filter(i => i.status === "standby").length, cls: "text-status-warning" },
                { label: "Fault",   value: offlineCount,                                          cls: "text-status-fault" },
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
                  {inverters.map((inv: any) => (
                    <Link key={inv.id ?? inv.index} href={`/plants/${pid}/inverters/${inv.id ?? inv.index}`}>
                      <div
                        title={`${inv.name ?? `INV-${inv.index}`}: ${STATUS_LABEL[inv.status] ?? inv.status} · ${inv.acPowerKw?.toFixed(0) ?? 0} kW · ${inv.temperatureC?.toFixed(0) ?? "--"}°C`}
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
                      {STATUS_LABEL[s]}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Aggregate live stats from SSE */}
            {liveStream.latest && liveStream.latest.inverters.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-3">
                {[
                  {
                    label: "Total AC",
                    value: `${(liveStream.latest.inverters.reduce((s, i) => s + i.acPowerKw, 0) / 1000).toFixed(1)} MW`,
                  },
                  {
                    label: "Avg Eff.",
                    value: `${(liveStream.latest.inverters.filter(i => i.efficiencyPct > 0).reduce((s, i, _, a) => s + i.efficiencyPct / a.length, 0)).toFixed(1)}%`,
                  },
                  {
                    label: "Avg Temp",
                    value: `${(liveStream.latest.inverters.filter(i => i.temperatureC > 0).reduce((s, i, _, a) => s + i.temperatureC / a.length, 0)).toFixed(0)}°C`,
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-muted/30 rounded-lg p-2 text-center border border-border/50">
                    <div className="text-[10px] text-muted-foreground">{label}</div>
                    <div className="text-sm font-mono font-semibold mt-0.5">{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Device Health summary */}
        {deviceHealth && deviceHealth.totalDevices > 0 && (
          <div className="bg-card border border-card-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-primary" /> Device Health
              </h3>
              <Link href="/devices" className="text-xs text-primary hover:underline">View all →</Link>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:col-span-2">
                {[
                  { label: "Online",   value: deviceHealth.online,   cls: "text-status-normal" },
                  { label: "Degraded", value: deviceHealth.degraded, cls: "text-status-warning" },
                  { label: "Offline",  value: deviceHealth.offline,  cls: "text-muted-foreground" },
                  { label: "Error",    value: deviceHealth.error,    cls: "text-status-fault" },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="bg-muted/30 rounded-lg p-2.5 text-center border border-border/50">
                    <div className={`text-2xl font-bold font-mono ${cls}`}>{value}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
                  </div>
                ))}
                <div className="col-span-2 sm:col-span-4 bg-muted/30 rounded-lg p-3 border border-border/50 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg Health Score</span>
                  <span className={`text-lg font-bold font-mono ${
                    (deviceHealth.avgHealthScore ?? 100) >= 80 ? "text-status-normal"
                      : (deviceHealth.avgHealthScore ?? 100) >= 50 ? "text-status-warning" : "text-status-fault"
                  }`}>
                    {deviceHealth.avgHealthScore ?? "--"}{deviceHealth.avgHealthScore != null && "/100"}
                  </span>
                </div>
                {deviceHealth.sparkline.length >= 2 && (
                  <div className="col-span-2 sm:col-span-4 bg-muted/30 rounded-lg p-3 border border-border/50">
                    <div className="text-[10px] text-muted-foreground mb-1">Online % — last 24h</div>
                    <MiniLineChart
                      color="hsl(var(--primary))"
                      points={deviceHealth.sparkline.map((p) => ({
                        label: new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit" }),
                        value: p.onlinePct,
                      }))}
                    />
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Worst Devices</div>
                <div className="space-y-1.5">
                  {deviceHealth.worstDevices.length === 0 ? (
                    <div className="text-xs text-muted-foreground">All devices healthy</div>
                  ) : (
                    deviceHealth.worstDevices.map((d) => (
                      <Link key={d.id} href={`/devices/${d.id}`}>
                        <div className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-2.5 py-1.5 border border-border/50 hover:bg-muted/50 cursor-pointer">
                          <span className="truncate">{d.name}</span>
                          <span className={`font-mono font-semibold ml-2 shrink-0 ${
                            (d.healthScore ?? 100) >= 80 ? "text-status-normal"
                              : (d.healthScore ?? 100) >= 50 ? "text-status-warning" : "text-status-fault"
                          }`}>
                            {d.healthScore ?? "—"}
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
