import { 
  useGetInverter,
  useGetInverterTrend,
  getGetInverterQueryKey,
  getGetInverterTrendQueryKey,
  InverterStatus
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import { Cpu, Activity, Thermometer, Zap, Layers, ArrowRight } from "lucide-react";
import { LiveValue, KpiCard } from "@/components/ui/scada";
import { SvgLineChart } from "@/components/ui/svg-charts";
import { useState } from "react";

function StatusBadge({ status }: { status: InverterStatus }) {
  switch (status) {
    case "running":
      return <span className="inline-flex px-3 py-1 rounded text-xs font-bold bg-status-normal/20 text-status-normal border border-status-normal/30 uppercase tracking-wider">Running</span>;
    case "standby":
      return <span className="inline-flex px-3 py-1 rounded text-xs font-bold bg-status-warning/20 text-status-warning border border-status-warning/30 uppercase tracking-wider">Standby</span>;
    case "fault":
      return <span className="inline-flex px-3 py-1 rounded text-xs font-bold bg-status-fault/20 text-status-fault border border-status-fault/30 uppercase tracking-wider">Fault</span>;
    case "comm_lost":
      return <span className="inline-flex px-3 py-1 rounded text-xs font-bold bg-status-offline/20 text-status-offline border border-status-offline/30 uppercase tracking-wider">Comm Lost</span>;
  }
}

export default function InverterDetail() {
  const { plantId, inverterId } = useParams();
  const [range, setRange] = useState<"hour" | "day" | "week" | "month">("day");
  
  const { data: inv, isLoading } = useGetInverter(inverterId || "", {
    query: {
      enabled: !!inverterId,
      refetchInterval: 5000,
      queryKey: getGetInverterQueryKey(inverterId || "")
    }
  });

  const { data: trend } = useGetInverterTrend(inverterId || "", { range }, {
    query: {
      enabled: !!inverterId,
      queryKey: getGetInverterTrendQueryKey(inverterId || "", { range })
    }
  });

  const formatXAxis = (tickItem: string) => {
    const d = new Date(tickItem);
    if (range === 'hour') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (range === 'day') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        <div>
          <div className="flex items-center mb-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Portfolio</Link>
            <span className="mx-2">/</span>
            <Link href={`/plants/${plantId}`} className="hover:text-foreground transition-colors">Plant</Link>
            <span className="mx-2">/</span>
            <Link href={`/plants/${plantId}/inverters`} className="hover:text-foreground transition-colors">Inverters</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">{inv?.name || "Loading..."}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-muted rounded-lg border border-border">
                <Cpu className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{inv?.name || "Inverter Detail"}</h1>
                <p className="text-sm text-muted-foreground font-mono mt-1">ID: {inv?.id}</p>
              </div>
            </div>
            {inv && <StatusBadge status={inv.status} />}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="AC Power" value={inv?.acPowerKw} unit="kW" precision={1} icon={Zap} loading={isLoading} />
          <KpiCard title="DC Power" value={inv?.dcPowerKw} unit="kW" precision={1} icon={Zap} loading={isLoading} />
          <KpiCard title="Efficiency" value={inv?.efficiencyPct} unit="%" precision={2} icon={Activity} loading={isLoading} />
          <KpiCard title="Internal Temp" value={inv?.temperatureC} unit="°C" precision={1} icon={Thermometer} loading={isLoading} 
            className={inv?.temperatureC && inv.temperatureC > 70 ? "border-status-fault/50 bg-status-fault/5" : ""}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card border border-card-border rounded-lg p-5">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-base font-semibold">Power Generation Trend</h3>
              <div className="flex bg-muted rounded-md p-1">
                {['hour', 'day', 'week', 'month'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r as any)}
                    className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
                      range === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[300px] w-full">
              {trend && trend.length > 0 ? (
                <SvgLineChart
                  data={(trend ?? []) as unknown as Record<string, unknown>[]}
                  xKey="timestamp"
                  lines={[
                    { key: "acPowerKw", name: "AC Power", color: "hsl(var(--primary))" },
                    { key: "dcPowerKw", name: "DC Power", color: "hsl(var(--status-warning))" },
                  ]}
                  height={240}
                  xFmt={formatXAxis}
                  yFmt={(v) => `${v.toFixed(0)} kW`}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No trend data available</div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-card border border-card-border rounded-lg p-5">
              <h3 className="text-base font-semibold mb-4 border-b border-border pb-2">Electrical Metrics</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">AC Voltage</span>
                  <LiveValue value={inv?.acVoltageV} unit="V" precision={1} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">AC Current</span>
                  <LiveValue value={inv?.acCurrentA} unit="A" precision={1} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Frequency</span>
                  <LiveValue value={inv?.frequencyHz} unit="Hz" precision={2} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Power Factor</span>
                  <LiveValue value={inv?.powerFactor} unit="" precision={3} />
                </div>
                <div className="w-full h-px bg-border my-2"></div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">DC Voltage</span>
                  <LiveValue value={inv?.dcVoltageV} unit="V" precision={1} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">DC Current</span>
                  <LiveValue value={inv?.dcCurrentA} unit="A" precision={1} />
                </div>
              </div>
            </div>

            <Link href={`/plants/${plantId}/inverters/${inverterId}/strings`} className="block">
              <div className="bg-card border border-primary/30 hover:border-primary transition-colors rounded-lg p-5 flex items-center justify-between group cursor-pointer">
                <div>
                  <h3 className="text-base font-semibold flex items-center text-primary group-hover:text-primary/80">
                    <Layers className="w-4 h-4 mr-2" /> String Diagnostics
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">Compare string currents & voltages</p>
                </div>
                <ArrowRight className="w-5 h-5 text-primary" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
