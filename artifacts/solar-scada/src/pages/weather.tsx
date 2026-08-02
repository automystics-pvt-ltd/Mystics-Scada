import { useListWeatherStations, getListWeatherStationsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import { CloudLightning, Wind, Droplets, Sun, Thermometer } from "lucide-react";
import { LiveValue, KpiCard } from "@/components/ui/scada";

export default function WeatherView() {
  const { plantId } = useParams();
  
  const { data: stations, isLoading } = useListWeatherStations(plantId || "", {
    query: {
      enabled: !!plantId,
      refetchInterval: 10000,
      queryKey: getListWeatherStationsQueryKey(plantId || "")
    }
  });

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        <div>
          <div className="flex items-center mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Portfolio</Link>
            <span className="mx-2">/</span>
            <Link href={`/plants/${plantId}`} className="hover:text-foreground transition-colors">Plant Overview</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">Weather</span>
          </div>
          
          <h1 className="text-2xl font-bold tracking-tight flex items-center">
            <CloudLightning className="w-6 h-6 mr-2 text-accent-brand" />
            Meteorological Data
          </h1>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground animate-pulse">Loading weather telemetry...</div>
        ) : stations?.length === 0 ? (
          <div className="bg-black/40 border border-border/50 p-8 rounded-none-none text-center text-muted-foreground">
            No weather stations configured for this plant.
          </div>
        ) : (
          <div className="space-y-8">
            {stations?.map((station) => (
              <div key={station.id} className="bg-black/40 border border-card-border rounded-none-none overflow-hidden">
                <div className="bg-black/60 px-6 py-4 border-b border-card-border flex justify-between items-center">
                  <div className="flex items-center">
                    <CloudLightning className="w-5 h-5 mr-3 text-accent-brand" />
                    <h2 className="text-lg font-semibold">{station.name}</h2>
                    <span className="ml-3 px-2 py-0.5 rounded-none font-mono text-[8px] uppercase tracking-widest bg-background border border-border/50 text-muted-foreground">
                      Zone: {station.zone}
                    </span>
                  </div>
                  <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                    Last Sync: {new Date(station.lastUpdated).toLocaleTimeString()}
                  </div>
                </div>
                
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-6">
                    <h3 className="font-mono text-[9px] uppercase tracking-widest font-bold text-foreground text-muted-foreground uppercase tracking-wider flex items-center"><Sun className="w-4 h-4 mr-2" /> Irradiance</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end border-b border-border/50 pb-2">
                        <span className="font-mono text-[9px] uppercase tracking-widest">Plane of Array (POA)</span>
                        <LiveValue value={station.poaWm2} unit="W/m²" precision={1} valueClassName="text-xl" />
                      </div>
                      <div className="flex justify-between items-end border-b border-border/50 pb-2">
                        <span className="font-mono text-[9px] uppercase tracking-widest">Global Horizontal (GHI)</span>
                        <LiveValue value={station.ghiWm2} unit="W/m²" precision={1} valueClassName="text-xl text-muted-foreground" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="font-mono text-[9px] uppercase tracking-widest font-bold text-foreground text-muted-foreground uppercase tracking-wider flex items-center"><Thermometer className="w-4 h-4 mr-2" /> Temperature</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end border-b border-border/50 pb-2">
                        <span className="font-mono text-[9px] uppercase tracking-widest">Module Surface</span>
                        <LiveValue value={station.moduleTempC} unit="°C" precision={1} valueClassName={`text-xl ${station.moduleTempC > 65 ? 'text-status-warning' : ''}`} />
                      </div>
                      <div className="flex justify-between items-end border-b border-border/50 pb-2">
                        <span className="font-mono text-[9px] uppercase tracking-widest">Ambient Air</span>
                        <LiveValue value={station.ambientTempC} unit="°C" precision={1} valueClassName="text-xl text-muted-foreground" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="font-mono text-[9px] uppercase tracking-widest font-bold text-foreground text-muted-foreground uppercase tracking-wider flex items-center"><Wind className="w-4 h-4 mr-2" /> Atmosphere</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end border-b border-border/50 pb-2">
                        <span className="font-mono text-[9px] uppercase tracking-widest">Wind Speed & Dir</span>
                        <div className="flex items-center">
                          <LiveValue value={station.windSpeedMs} unit="m/s" precision={1} valueClassName="text-xl mr-2" />
                          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{station.windDirectionDeg}°</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-end border-b border-border/50 pb-2">
                        <span className="font-mono text-[9px] uppercase tracking-widest">Humidity</span>
                        <LiveValue value={station.humidityPct} unit="%" precision={0} valueClassName="text-xl" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
