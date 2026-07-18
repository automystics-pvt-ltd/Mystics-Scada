import { useGetPortfolioSummary, useListAlerts, getGetPortfolioSummaryQueryKey, getListAlertsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { KpiCard, HealthBadge, LiveValue, GenerationRing } from "@/components/ui/scada";
import { Zap, Activity, AlertTriangle, Battery, Power, ArrowRight, XCircle, Brain, Radio } from "lucide-react";
import { Link } from "wouter";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { computeHealthScore, healthScoreColor } from "@/lib/plantHierarchy";
import { useTelemetry } from "@/context/TelemetryStreamContext";

const BASE = import.meta.env.BASE_URL as string;

export default function PortfolioDashboard() {
  const { data: summary, isLoading } = useGetPortfolioSummary({
    query: { refetchInterval: 30_000, queryKey: getGetPortfolioSummaryQueryKey() }
  });

  const { data: alerts } = useListAlerts(
    { status: "open" },
    { query: { refetchInterval: 30_000, queryKey: getListAlertsQueryKey({ status: "open" }) } }
  );

  const { data: insightsSummary } = useQuery<{ total: number; critical: number; warning: number; info: number } | null>({
    queryKey: ["insights-summary"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/insights/summary`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json() as Promise<{ total: number; critical: number; warning: number; info: number }>;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Real-time SSE power history per plant — drives live sparklines
  const { connected, lastSync, tickCount, plantHistory } = useTelemetry();

  const criticalAlerts = useMemo(() => alerts?.filter(a => a.severity === "critical") ?? [], [alerts]);
  const fleetUtilPct = summary && summary.totalCapacityMw > 0
    ? (summary.totalCurrentPowerMw / summary.totalCapacityMw) * 100
    : 0;

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">

        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Portfolio Overview</h1>
            <p className="text-sm text-muted-foreground mt-1">Fleet-wide realtime generation and health</p>
          </div>
          <div className={`flex items-center space-x-2 text-sm px-3 py-1.5 rounded border ${
            connected
              ? "bg-status-normal/8 border-status-normal/20 text-status-normal"
              : "bg-muted/50 border-border text-muted-foreground"
          }`}>
            <Radio className={`h-4 w-4 ${connected ? "animate-pulse" : ""}`} />
            <span className="font-mono">
              {connected
                ? lastSync
                  ? `Live · ${Math.round((Date.now() - lastSync.getTime()) / 1000)}s ago`
                  : "Live"
                : "Connecting…"}
            </span>
          </div>
        </div>

        {/* Critical alert banner */}
        {criticalAlerts.length > 0 && (
          <div className="flex items-center gap-3 bg-status-fault/10 border border-status-fault/30 rounded-lg px-4 py-3">
            <XCircle className="w-5 h-5 text-status-fault flex-shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-bold text-status-fault">{criticalAlerts.length} critical alert{criticalAlerts.length > 1 ? "s" : ""} active — </span>
              <span className="text-muted-foreground">{criticalAlerts[0].plantName}: {criticalAlerts[0].title}</span>
            </div>
            <Link href="/alerts" className="text-xs font-medium text-status-fault hover:underline whitespace-nowrap">
              View Alerts →
            </Link>
          </div>
        )}

        {/* AI Insights summary widget */}
        {insightsSummary && insightsSummary.total > 0 && (
          <Link href="/insights">
            <div className="flex items-center gap-4 bg-card border border-card-border rounded-xl px-4 py-3 cursor-pointer hover:border-primary/40 transition-colors group">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">AI Insights</span>
                <span className="text-xs text-muted-foreground ml-1">{insightsSummary.total} finding{insightsSummary.total !== 1 ? "s" : ""} detected</span>
              </div>
              <div className="flex items-center gap-3 ml-2">
                {insightsSummary.critical > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-status-fault/15 text-status-fault border border-status-fault/20">
                    {insightsSummary.critical} Critical
                  </span>
                )}
                {insightsSummary.warning > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-status-warning/15 text-status-warning border border-status-warning/20">
                    {insightsSummary.warning} Warning
                  </span>
                )}
                {insightsSummary.info > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                    {insightsSummary.info} Info
                  </span>
                )}
              </div>
              <span className="ml-auto text-xs text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                Review insights <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </Link>
        )}

        {/* Fleet KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Total Capacity"
            value={summary?.totalCapacityMw}
            unit="MWp"
            precision={2}
            icon={Battery}
            loading={isLoading}
          />
          <KpiCard
            title="Live Generation"
            value={summary?.totalCurrentPowerMw}
            unit="MW"
            precision={2}
            icon={Zap}
            loading={isLoading}
            className="border-primary/20 bg-primary/5"
            trend={{ value: +(fleetUtilPct - 80).toFixed(1), label: "vs 80% target", positive: fleetUtilPct >= 80 }}
          />
          <KpiCard
            title="Today's Energy"
            value={summary?.totalGenerationTodayMwh}
            unit="MWh"
            precision={1}
            icon={Power}
            loading={isLoading}
          />
          <KpiCard
            title="Fleet Avg PR"
            value={summary?.avgPr}
            unit="%"
            precision={1}
            icon={Activity}
            loading={isLoading}
          />
        </div>

        {/* Fleet utilisation + plant cards */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

          {/* Fleet generation ring */}
          <div className="xl:col-span-1 bg-card border border-card-border rounded-xl p-6 flex flex-col items-center justify-center gap-4">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Fleet Utilisation</p>
            <GenerationRing
              pct={fleetUtilPct}
              label={`${summary ? (summary.totalCurrentPowerMw).toFixed(1) : "--"} MW`}
              sublabel={`of ${summary ? summary.totalCapacityMw.toFixed(1) : "--"} MWp`}
              size={120}
              strokeWidth={10}
              color={fleetUtilPct >= 50 ? "hsl(142 71% 45%)" : fleetUtilPct >= 20 ? "hsl(38 92% 50%)" : "hsl(220 9% 46%)"}
            />
            <div className="w-full border-t border-border pt-4 grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-xs text-muted-foreground">Plants</div>
                <div className="text-lg font-bold font-mono">{summary?.plants.length ?? "--"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Open Alerts</div>
                <div className="text-lg font-bold font-mono text-status-fault">{alerts?.length ?? "--"}</div>
              </div>
            </div>
          </div>

          {/* Plant cards */}
          <div className="xl:col-span-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Plant Status</h2>
              <span className="text-[10px] text-muted-foreground font-mono">
                {tickCount > 0 ? `${tickCount} SSE frames received` : "Waiting for stream…"}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-card border border-card-border rounded-xl p-5 h-44 animate-pulse" />
                  ))
                : summary?.plants.map(plant => {
                    const utilPct = plant.capacityKw > 0 ? (plant.currentPowerKw / plant.capacityKw) * 100 : 0;
                    const ringColor = plant.healthStatus === "normal"
                      ? "hsl(142 71% 45%)"
                      : plant.healthStatus === "warning"
                        ? "hsl(38 92% 50%)"
                        : "hsl(0 84% 60%)";

                    // Real sparkline from SSE ring buffer; fall back to synthetic if not yet received
                    const sseHistory = plantHistory[plant.id];
                    const sparkData: { v: number }[] = sseHistory && sseHistory.length >= 2
                      ? sseHistory.map(p => ({ v: p.powerKw }))
                      : _syntheticSparkline(plant.capacityKw, plant.currentPowerKw);

                    const healthScore = computeHealthScore(
                      plant.pr,
                      plant.availabilityPct,
                      { critical: plant.alertCounts.critical, major: plant.alertCounts.major },
                    );

                    return (
                      <Link key={plant.id} href={`/plants/${plant.id}`}>
                        <div className="bg-card border border-card-border rounded-xl p-4 hover:border-primary/40 hover:bg-card/80 transition-all cursor-pointer group">
                          {/* Top row */}
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="font-semibold text-foreground group-hover:text-primary transition-colors">{plant.name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{plant.region}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold font-mono" style={{ color: healthScoreColor(healthScore) }}>
                                ★ {healthScore}
                              </span>
                              <HealthBadge status={plant.healthStatus} />
                            </div>
                          </div>

                          {/* Ring + stats */}
                          <div className="flex items-center gap-4">
                            <GenerationRing
                              pct={utilPct}
                              label={`${plant.currentPowerKw >= 1000 ? (plant.currentPowerKw / 1000).toFixed(1) + " MW" : plant.currentPowerKw.toFixed(0) + " kW"}`}
                              sublabel="live"
                              size={72}
                              strokeWidth={6}
                              color={ringColor}
                            />
                            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1">
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Capacity</div>
                                <div className="font-mono text-sm font-medium">{(plant.capacityKw / 1000).toFixed(1)} MWp</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">PR</div>
                                <div className="font-mono text-sm font-medium">{plant.pr.toFixed(1)}%</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avail.</div>
                                <div className="font-mono text-sm font-medium">{plant.availabilityPct.toFixed(1)}%</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Alerts</div>
                                <div className="flex items-center gap-1">
                                  {plant.alertCounts.critical > 0 && (
                                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] font-bold bg-status-fault text-white">
                                      {plant.alertCounts.critical}
                                    </span>
                                  )}
                                  {plant.alertCounts.major > 0 && (
                                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] font-bold bg-[#e67e22] text-white">
                                      {plant.alertCounts.major}
                                    </span>
                                  )}
                                  {plant.alertCounts.critical === 0 && plant.alertCounts.major === 0 && (
                                    <span className="text-xs text-status-normal">✓ Clear</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Live / synthetic sparkline */}
                          <div className="mt-3 -mx-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <div className="h-10">
                              <_Sparkline data={sparkData} color={ringColor} isLive={!!(sseHistory && sseHistory.length >= 2)} />
                            </div>
                          </div>

                          <div className="mt-2 flex justify-between items-center">
                            {sseHistory && sseHistory.length >= 2
                              ? <span className="text-[9px] text-status-normal/60 font-mono">● {sseHistory.length} live pts</span>
                              : <span className="text-[9px] text-muted-foreground/40 font-mono">est. curve</span>
                            }
                            <span className="text-xs text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              Open plant <ArrowRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

/* ── Synthetic sparkline fallback (used before SSE history arrives) ─────── */
function _syntheticSparkline(capacityKw: number, currentPowerKw: number): { v: number }[] {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const points: { v: number }[] = [];
  for (let h = 7; h <= 19; h++) {
    const solar = Math.max(0, Math.sin(((h - 7) / 12) * Math.PI));
    const jitter = (Math.sin(capacityKw + h * 7) + 1) / 2;
    const v = h <= hour ? solar * capacityKw * (0.85 + jitter * 0.12) : 0;
    points.push({ v: Math.round(v) });
  }
  return points;
}

/* ── Inline mini sparkline — pure SVG ───────────────────────────────────── */
function _Sparkline({ data, color, isLive }: { data: { v: number }[]; color: string; isLive: boolean }) {
  if (!data || data.length < 2) return null;

  const W = 200;
  const H = 40;
  const vals = data.map((d) => d.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;

  const px = (i: number) => (i / (vals.length - 1)) * W;
  const py = (v: number) => H - ((v - min) / range) * H * 0.9 - H * 0.05;

  const pts = vals.map((v, i) => `${px(i)},${py(v)}`).join(" ");
  const areaPath =
    `M${px(0)},${H} L${px(0)},${py(vals[0]!)} ` +
    vals.slice(1).map((v, i) => `L${px(i + 1)},${py(v)}`).join(" ") +
    ` L${px(vals.length - 1)},${H} Z`;

  // Use stable gradient ids based on color+live flag
  const gradId = `ps-${color.replace(/[^a-z0-9]/gi, "")}-${isLive ? "l" : "s"}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor={color} stopOpacity={isLive ? 0.4 : 0.25} />
          <stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={isLive ? 2 : 1.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* Live dot at the end */}
      {isLive && vals.length > 0 && (
        <circle cx={px(vals.length - 1)} cy={py(vals[vals.length - 1]!)} r={2.5} fill={color} />
      )}
    </svg>
  );
}
