import { 
  useGetPortfolioSummary,
  useHealthCheck,
  getGetPortfolioSummaryQueryKey
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { KpiCard, HealthBadge, LiveValue } from "@/components/ui/scada";
import { Zap, Activity, AlertTriangle, Battery, Power } from "lucide-react";
import { Link } from "wouter";

export default function PortfolioDashboard() {
  const { data: summary, isLoading, isError } = useGetPortfolioSummary({
    query: { refetchInterval: 10000, queryKey: getGetPortfolioSummaryQueryKey() }
  });

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Portfolio Overview</h1>
            <p className="text-sm text-muted-foreground mt-1">Fleet-wide realtime generation and health</p>
          </div>
          <div className="flex items-center space-x-2 text-sm bg-muted/50 px-3 py-1.5 rounded border border-border">
            <Activity className="h-4 w-4 text-status-normal animate-pulse-subtle" />
            <span className="font-mono text-muted-foreground">Live Telemetry</span>
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Total Capacity"
            value={summary?.totalCapacityMw}
            unit="MWp"
            precision={2}
            icon={Battery}
            loading={isLoading}
          />
          <KpiCard
            title="Current Power"
            value={summary?.totalCurrentPowerMw}
            unit="MW"
            precision={2}
            icon={Zap}
            loading={isLoading}
            className="border-primary/20 bg-primary/5"
            trend={{ value: 2.4, label: "vs yesterday avg", positive: true }}
          />
          <KpiCard
            title="Today's Generation"
            value={summary?.totalGenerationTodayMwh}
            unit="MWh"
            precision={1}
            icon={Power}
            loading={isLoading}
          />
          <KpiCard
            title="Fleet Average PR"
            value={summary?.avgPr}
            unit="%"
            precision={1}
            icon={Activity}
            loading={isLoading}
            trend={{ value: -0.2, label: "vs target", positive: false }}
          />
        </div>

        {/* Plant List */}
        <div>
          <h2 className="text-lg font-semibold tracking-tight mb-4">Plant Status</h2>
          
          <div className="bg-card border border-card-border rounded-lg overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-card-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Plant</th>
                  <th className="px-4 py-3 font-medium">Health</th>
                  <th className="px-4 py-3 font-medium text-right">Capacity</th>
                  <th className="px-4 py-3 font-medium text-right">Power</th>
                  <th className="px-4 py-3 font-medium text-right">PR</th>
                  <th className="px-4 py-3 font-medium text-right">Avail</th>
                  <th className="px-4 py-3 font-medium text-center">Alerts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Loading fleet data...
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-status-fault">
                      Failed to load portfolio data. Retrying...
                    </td>
                  </tr>
                ) : summary?.plants.map((plant) => (
                  <tr key={plant.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-3">
                      <Link href={`/plants/${plant.id}`} className="font-medium text-foreground hover:text-primary transition-colors flex items-center">
                        {plant.name}
                      </Link>
                      <div className="text-xs text-muted-foreground mt-0.5">{plant.region}</div>
                    </td>
                    <td className="px-4 py-3">
                      <HealthBadge status={plant.healthStatus} />
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground font-mono">
                      {plant.capacityKw.toLocaleString()} <span className="text-[10px]">kWp</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <LiveValue value={plant.currentPowerKw} unit="kW" precision={0} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {plant.pr.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {plant.availabilityPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center items-center space-x-1">
                        {plant.alertCounts.critical > 0 && (
                          <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-bold bg-status-fault text-status-fault-foreground">
                            {plant.alertCounts.critical}
                          </span>
                        )}
                        {plant.alertCounts.major > 0 && (
                          <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-bold bg-[#e67e22] text-white">
                            {plant.alertCounts.major}
                          </span>
                        )}
                        {plant.alertCounts.critical === 0 && plant.alertCounts.major === 0 && (
                          <span className="text-muted-foreground text-xs">--</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
