import { useListInverters, getListInvertersQueryKey, InverterStatus } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import { Cpu, ArrowRight, Zap } from "lucide-react";
import { LiveValue } from "@/components/ui/scada";

function StatusBadge({ status }: { status: InverterStatus }) {
  switch (status) {
    case "running":
      return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-status-normal/20 text-status-normal border border-status-normal/30 uppercase tracking-wider">Running</span>;
    case "standby":
      return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-status-warning/20 text-status-warning border border-status-warning/30 uppercase tracking-wider">Standby</span>;
    case "fault":
      return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-status-fault/20 text-status-fault border border-status-fault/30 uppercase tracking-wider">Fault</span>;
    case "comm_lost":
      return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-status-offline/20 text-status-offline border border-status-offline/30 uppercase tracking-wider">Comm Lost</span>;
  }
}

export default function InverterList() {
  const { plantId } = useParams();
  
  const { data: inverters, isLoading } = useListInverters(plantId || "", {
    query: {
      enabled: !!plantId,
      refetchInterval: 10000,
      queryKey: getListInvertersQueryKey(plantId || "")
    }
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
            <span className="text-foreground">Inverters</span>
          </div>
          
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <Cpu className="w-6 h-6 mr-2 text-primary" />
              Inverter Fleet Status
            </h1>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[640px]">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-card-border">
              <tr>
                <th className="px-4 py-3 font-medium">Inverter ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">AC Power</th>
                <th className="px-4 py-3 font-medium text-right">DC Power</th>
                <th className="px-4 py-3 font-medium text-right">Efficiency</th>
                <th className="px-4 py-3 font-medium text-right">Temp</th>
                <th className="px-4 py-3 font-medium text-right">Today Energy</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading inverters...</td></tr>
              ) : inverters?.map(inv => (
                <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium flex items-center">
                    <Zap className={`w-3.5 h-3.5 mr-2 ${inv.status === 'running' ? 'text-status-normal' : 'text-muted-foreground'}`} />
                    {inv.name}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <LiveValue value={inv.acPowerKw} unit="kW" precision={1} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <LiveValue value={inv.dcPowerKw} unit="kW" precision={1} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {inv.efficiencyPct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono ${inv.temperatureC > 65 ? 'text-status-warning' : ''}`}>
                      {inv.temperatureC.toFixed(1)} <span className="text-xs text-muted-foreground font-sans">°C</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <LiveValue value={inv.dailyEnergyKwh} unit="kWh" precision={0} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/plants/${plantId}/inverters/${inv.id}`} className="text-primary hover:text-primary/80 inline-flex items-center text-xs font-medium">
                      Details <ArrowRight className="w-3 h-3 ml-1" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
