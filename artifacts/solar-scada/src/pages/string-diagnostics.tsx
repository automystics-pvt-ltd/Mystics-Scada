import { useListStringReadings, getListStringReadingsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import { Layers, AlertTriangle, ArrowDown } from "lucide-react";
import { LiveValue } from "@/components/ui/scada";

export default function StringDiagnostics() {
  const { plantId, inverterId } = useParams();
  
  const { data: strings, isLoading } = useListStringReadings(inverterId || "", {
    query: {
      enabled: !!inverterId,
      refetchInterval: 5000,
      queryKey: getListStringReadingsQueryKey(inverterId || "")
    }
  });

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        <div>
          <div className="flex items-center mb-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Portfolio</Link>
            <span className="mx-2">/</span>
            <Link href={`/plants/${plantId}`} className="hover:text-foreground transition-colors">Plant</Link>
            <span className="mx-2">/</span>
            <Link href={`/plants/${plantId}/inverters/${inverterId}`} className="hover:text-foreground transition-colors">Inverter</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">Strings</span>
          </div>
          
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center">
                <Layers className="w-6 h-6 mr-2 text-primary" />
                String Diagnostics
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Real-time comparison against peer median</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4 h-32 animate-pulse" />
            ))
          ) : strings?.map(str => (
            <div 
              key={str.id} 
              className={`bg-card rounded-lg p-4 border relative overflow-hidden transition-all ${
                str.isDeviating 
                  ? 'border-status-fault shadow-[0_0_10px_rgba(239,68,68,0.15)]' 
                  : str.status === 'off' 
                    ? 'border-border/50 opacity-60' 
                    : 'border-card-border hover:border-primary/50'
              }`}
            >
              {str.isDeviating && (
                <div className="absolute top-0 right-0 bg-status-fault text-white px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-bl-lg flex items-center">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Deviating
                </div>
              )}
              
              <div className="flex justify-between items-center mb-4">
                <span className="font-semibold text-lg">{str.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  str.status === 'on' ? 'bg-status-normal/10 text-status-normal border-status-normal/20' : 'bg-muted text-muted-foreground border-border'
                }`}>
                  {str.status.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Current</span>
                  <LiveValue 
                    value={str.currentA} 
                    unit="A" 
                    precision={2} 
                    valueClassName={str.isDeviating ? 'text-status-fault' : ''} 
                  />
                  {str.isDeviating && (
                    <div className="flex items-center text-[10px] text-status-fault mt-1 font-mono">
                      <ArrowDown className="w-3 h-3 mr-0.5" />
                      {str.deviationPct.toFixed(1)}% vs Med
                    </div>
                  )}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Voltage</span>
                  <LiveValue value={str.voltageV} unit="V" precision={1} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
