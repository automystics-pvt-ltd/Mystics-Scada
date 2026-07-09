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
        <div>
          <div className="flex items-center mb-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Portfolio</Link>
            <span className="mx-2">/</span>
            <Link href={`/plants/${plantId}`} className="hover:text-foreground transition-colors">Plant Overview</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">Analytics</span>
          </div>
          
          <h1 className="text-2xl font-bold tracking-tight flex items-center">
            <BarChart4 className="w-6 h-6 mr-2 text-primary" />
            Yield & Performance Analytics
          </h1>
        </div>

        {/* Commercial & Environmental summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Today's Revenue" value={rev?.todayRevenue} unit={rev?.currency || "$"} precision={0} icon={DollarSign} loading={loadingRev} />
          <KpiCard title="MTD Revenue" value={rev?.monthRevenue} unit={rev?.currency || "$"} precision={0} icon={DollarSign} loading={loadingRev} />
          <KpiCard title="CO2 Avoided (Today)" value={rev?.co2AvoidedKgToday} unit="kg" precision={0} icon={Leaf} loading={loadingRev} className="border-status-normal/30 bg-status-normal/5" />
          <KpiCard title="CO2 Avoided (Life)" value={rev?.co2AvoidedKgLifetime} unit="kg" precision={0} icon={Leaf} loading={loadingRev} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Yield Chart */}
          <div className="xl:col-span-2 bg-card border border-card-border rounded-lg p-5">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-base font-semibold">Generation vs Expected</h3>
                <p className="text-xs text-muted-foreground mt-1">Specific Yield: <span className="font-mono text-foreground">{yieldData?.specificYieldKwhPerKwp.toFixed(2)}</span> kWh/kWp</p>
              </div>
              <div className="flex bg-muted rounded-md p-1">
                {['daily', 'weekly', 'monthly', 'yearly'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p as any)}
                    className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
                      period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="h-[350px] w-full">
              {yieldData && yieldData.points.length > 0 ? (
                <SvgComposedChart
                  data={yieldData.points as unknown as Record<string, unknown>[]}
                  xKey="label"
                  bars={[{ key: "actualKwh", name: "Actual Generation", color: "hsl(var(--primary))" }]}
                  lines={[{ key: "expectedKwh", name: "Expected Generation", color: "hsl(var(--status-normal))", dashed: true }]}
                  height={280}
                  yFmt={(v) => `${Math.round(v / 1000)}k`}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart data...</div>
              )}
            </div>
          </div>

          {/* PR & Losses */}
          <div className="space-y-6">
            <div className="bg-card border border-card-border rounded-lg p-5">
              <h3 className="text-base font-semibold mb-4">Availability Metrics</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Plant Availability</span>
                    <span className="text-sm font-mono">{perf?.availabilityPct.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-status-normal h-2 rounded-full" style={{ width: `${perf?.availabilityPct || 0}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Grid Availability</span>
                    <span className="text-sm font-mono">{perf?.gridAvailabilityPct.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-status-normal h-2 rounded-full" style={{ width: `${perf?.gridAvailabilityPct || 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-card-border rounded-lg p-5">
              <h3 className="text-base font-semibold mb-4 flex items-center"><PieChart className="w-4 h-4 mr-2" /> Loss Breakdown</h3>
              {loadingPerf ? (
                <div className="h-40 animate-pulse bg-muted rounded"></div>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: 'Soiling', val: perf?.lossBreakdown.soilingPct, color: 'hsl(38 92% 50%)' },
                    { label: 'Shading', val: perf?.lossBreakdown.shadingPct, color: 'hsl(240 5% 64.9%)' },
                    { label: 'Temperature', val: perf?.lossBreakdown.temperaturePct, color: 'hsl(0 84% 60%)' },
                    { label: 'Downtime', val: perf?.lossBreakdown.downtimePct, color: 'hsl(220 9% 46%)' },
                    { label: 'Curtailment', val: perf?.lossBreakdown.curtailmentPct, color: 'hsl(221 83% 53%)' },
                  ].map(loss => (
                    <div key={loss.label} className="flex items-center text-sm">
                      <div className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: loss.color }}></div>
                      <span className="flex-1">{loss.label}</span>
                      <span className="font-mono">{loss.val?.toFixed(1)}%</span>
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
