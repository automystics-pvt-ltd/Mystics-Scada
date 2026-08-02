import { 
  useGetPlantPerformance, 
  useGetPlantYield,
  useGetPlantRevenue,
  getGetPlantPerformanceQueryKey,
  getGetPlantYieldQueryKey,
  getGetPlantRevenueQueryKey
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import { BarChart4, PieChart, DollarSign, Leaf } from "lucide-react";
import { SvgComposedChart } from "@/components/ui/svg-charts";
import { KpiCard, LiveValue } from "@/components/ui/scada";
import { useState } from "react";

export default function AnalyticsView() {
  const { plantId } = useParams();
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  
  const { data: perf, isLoading: loadingPerf } = useGetPlantPerformance(plantId || "", {
    query: { enabled: !!plantId, queryKey: getGetPlantPerformanceQueryKey(plantId || "") }
  });

  const { data: yieldData, isLoading: loadingYield } = useGetPlantYield(plantId || "", { period }, {
    query: { enabled: !!plantId, queryKey: getGetPlantYieldQueryKey(plantId || "", { period }) }
  });

  const { data: rev, isLoading: loadingRev } = useGetPlantRevenue(plantId || "", {
    query: { enabled: !!plantId, queryKey: getGetPlantRevenueQueryKey(plantId || "") }
  });

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        <div className="border border-border/50 bg-black/40 p-5 relative flex-shrink-0">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
          
          <div className="flex items-center mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground flex-wrap">
            <Link href="/" className="hover:text-brand transition-colors">Portfolio</Link>
            <span className="mx-2 text-border/50">/</span>
            <Link href={`/plants/${plantId}`} className="hover:text-brand transition-colors">ZONE OVERVIEW</Link>
            <span className="mx-2 text-border/50">/</span>
            <span className="text-foreground">ANALYTICS</span>
          </div>
          
          <h1 className="text-xl font-mono font-bold uppercase tracking-widest text-foreground flex items-center gap-3">
            <BarChart4 className="w-5 h-5 text-brand" />
            YIELD & PERFORMANCE VECTORS
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2 ml-8">
            COMMERCIAL AND ENVIRONMENTAL IMPACT ANALYSIS
          </p>
        </div>

        {/* Commercial & Environmental summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <KpiCard title="TODAY'S REVENUE" value={rev?.todayRevenue} unit={rev?.currency || "$"} precision={0} icon={DollarSign} loading={loadingRev} />
          <KpiCard title="MTD REVENUE" value={rev?.monthRevenue} unit={rev?.currency || "$"} precision={0} icon={DollarSign} loading={loadingRev} />
          <div className="border border-status-normal/50 bg-status-normal/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-status-normal shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
            <KpiCard title="CO2 AVOIDED (TODAY)" value={rev?.co2AvoidedKgToday} unit="KG" precision={0} icon={Leaf} loading={loadingRev} className="border-none bg-transparent" />
          </div>
          <div className="border border-status-normal/30 bg-black/40 relative">
            <KpiCard title="CO2 AVOIDED (LIFE)" value={rev?.co2AvoidedKgLifetime} unit="KG" precision={0} icon={Leaf} loading={loadingRev} className="border-none bg-transparent" />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Yield Chart */}
          <div className="xl:col-span-2 border border-border/50 bg-black/60 relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 p-5 border-b border-border/50 bg-black/40">
              <div>
                <h3 className="font-mono text-sm uppercase tracking-widest text-foreground font-bold">GENERATION MATRIX</h3>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                  SPECIFIC YIELD // <span className="text-brand font-bold">{yieldData?.specificYieldKwhPerKwp.toFixed(2)} KWH/KWP</span>
                </p>
              </div>
              <div className="flex border border-border/50 bg-black/40 p-1">
                {['daily', 'weekly', 'monthly', 'yearly'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p as any)}
                    className={`px-3 py-1 font-mono text-[9px] uppercase tracking-widest transition-colors ${
                      period === p ? "bg-brand/20 text-brand border border-brand/50 shadow-[0_0_5px_rgba(0,255,170,0.2)]" : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="p-5 flex-1 min-h-[300px]">
              {yieldData && yieldData.points.length > 0 ? (
                <SvgComposedChart
                  data={yieldData.points as unknown as Record<string, unknown>[]}
                  xKey="label"
                  bars={[{ key: "actualKwh", name: "ACTUAL", color: "hsl(var(--brand))" }]}
                  lines={[{ key: "expectedKwh", name: "EXPECTED", color: "hsl(var(--status-warning))", dashed: true }]}
                  height={280}
                  yFmt={(v) => `${Math.round(v / 1000)}K`}
                  partialDataKey="partial"
                />
              ) : (
                <div className="h-full flex items-center justify-center font-mono text-[10px] uppercase tracking-widest text-brand animate-pulse">QUERYING DATA...</div>
              )}
            </div>
          </div>

          {/* PR & Losses */}
          <div className="space-y-6">
            <div className="border border-border/50 bg-black/60 p-5 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-status-normal shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
              <h3 className="font-mono text-sm uppercase tracking-widest font-bold text-foreground mb-6 flex items-center gap-2">
                <span className="w-2 h-2 bg-status-normal animate-pulse" /> UPTIME VECTORS
              </h3>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">ZONE UPTIME</span>
                    <span className="font-mono text-sm font-bold text-status-normal">{perf?.availabilityPct.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-black/80 border border-border/50 h-2 p-[1px]">
                    <div className="bg-status-normal h-full shadow-[0_0_5px_rgba(34,197,94,0.5)]" style={{ width: `${perf?.availabilityPct || 0}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">GRID UPTIME</span>
                    <span className="font-mono text-sm font-bold text-status-normal">{perf?.gridAvailabilityPct.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-black/80 border border-border/50 h-2 p-[1px]">
                    <div className="bg-status-normal h-full shadow-[0_0_5px_rgba(34,197,94,0.5)]" style={{ width: `${perf?.gridAvailabilityPct || 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-border/50 bg-black/60 p-5 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-status-warning shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
              <h3 className="font-mono text-sm uppercase tracking-widest font-bold text-foreground mb-6 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-status-warning" /> ATTENUATION MODEL
              </h3>
              {loadingPerf ? (
                <div className="h-40 border border-border/50 bg-black/40 animate-pulse"></div>
              ) : (
                <div className="space-y-4">
                  {[
                    { label: 'SOILING', val: perf?.lossBreakdown.soilingPct, color: 'var(--status-warning)' },
                    { label: 'SHADING', val: perf?.lossBreakdown.shadingPct, color: 'var(--muted-foreground)' },
                    { label: 'THERMAL', val: perf?.lossBreakdown.temperaturePct, color: 'var(--status-fault)' },
                    { label: 'DOWNTIME', val: perf?.lossBreakdown.downtimePct, color: 'var(--border)' },
                    { label: 'CURTAILMENT', val: perf?.lossBreakdown.curtailmentPct, color: 'var(--brand)' },
                  ].map(loss => (
                    <div key={loss.label} className="flex items-center text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <div className="w-2 h-2 mr-3" style={{ backgroundColor: `hsl(${loss.color})` }}></div>
                      <span className="flex-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{loss.label}</span>
                      <span className="font-mono text-sm font-bold">{loss.val?.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
