import { 
  useGetPlant,
  getGetPlantQueryKey
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { KpiCard, HealthBadge, LiveValue } from "@/components/ui/scada";
import { Link, useParams } from "wouter";
import { 
  ArrowLeft, 
  Sun, 
  Thermometer, 
  Activity, 
  Zap,
  Network,
  Cpu,
  BarChart4,
  CloudLightning
} from "lucide-react";

export default function PlantDashboard() {
  const { plantId } = useParams();
  
  const { data: plant, isLoading, isError } = useGetPlant(plantId || "", {
    query: { 
      enabled: !!plantId,
      refetchInterval: 10000, 
      queryKey: getGetPlantQueryKey(plantId || "") 
    }
  });

  if (isError) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <div className="text-status-fault mb-4"><Zap className="w-12 h-12" /></div>
          <h2 className="text-xl font-bold">Failed to load plant data</h2>
          <p className="text-muted-foreground mt-2">Could not retrieve telemetry for this plant.</p>
          <Link href="/" className="mt-6 text-primary hover:underline flex items-center">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Portfolio
          </Link>
        </div>
      </AppLayout>
    );
  }

  const subNav = [
    { name: "Overview", href: `/plants/${plantId}`, current: true },
    { name: "Single Line Diagram", href: `/plants/${plantId}/sld`, current: false, icon: Network },
    { name: "Inverters", href: `/plants/${plantId}/inverters`, current: false, icon: Cpu },
    { name: "Weather", href: `/plants/${plantId}/weather`, current: false, icon: CloudLightning },
    { name: "Analytics", href: `/plants/${plantId}/analytics`, current: false, icon: BarChart4 },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        {/* Header & Subnav */}
        <div>
          <div className="flex items-center mb-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Portfolio</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">{plant?.name || "Loading..."}</span>
          </div>
          
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-3xl font-bold tracking-tight">{plant?.name || "Plant Dashboard"}</h1>
                {plant && <HealthBadge status={plant.healthStatus} className="mt-1" />}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {plant?.region} • {plant?.capacityKw ? (plant.capacityKw / 1000).toFixed(2) : "--"} MWp Capacity
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-border">
          <nav className="-mb-px flex space-x-6">
            {subNav.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm flex items-center ${
                  item.current
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {item.icon && <item.icon className="w-4 h-4 mr-2" />}
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        {/* Live KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Current Power"
            value={plant?.currentPowerKw}
            unit="kW"
            precision={0}
            icon={Zap}
            loading={isLoading}
            className="border-primary/20 bg-primary/5"
          />
          <KpiCard
            title="Today's Energy"
            value={plant?.todayEnergyKwh}
            unit="kWh"
            precision={0}
            icon={Activity}
            loading={isLoading}
          />
          <KpiCard
            title="Performance Ratio (PR)"
            value={plant?.pr}
            unit="%"
            precision={1}
            icon={BarChart4}
            loading={isLoading}
          />
          <KpiCard
            title="Availability"
            value={plant?.availabilityPct}
            unit="%"
            precision={1}
            icon={Activity}
            loading={isLoading}
          />
        </div>

        {/* Environment & Inverter Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-card-border rounded-lg p-5">
            <h3 className="text-base font-semibold mb-4 flex items-center"><Sun className="w-4 h-4 mr-2" /> Environment Telemetry</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Irradiance (POA)</span>
                <LiveValue value={plant?.irradiancePoaWm2} unit="W/m²" precision={0} valueClassName="text-xl" />
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Irradiance (GHI)</span>
                <LiveValue value={plant?.irradianceGhiWm2} unit="W/m²" precision={0} valueClassName="text-xl" />
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Module Temp</span>
                <LiveValue value={plant?.moduleTempC} unit="°C" precision={1} valueClassName="text-xl text-status-warning" />
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Ambient Temp</span>
                <LiveValue value={plant?.ambientTempC} unit="°C" precision={1} valueClassName="text-xl" />
              </div>
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg p-5 flex flex-col">
            <h3 className="text-base font-semibold mb-4 flex items-center"><Cpu className="w-4 h-4 mr-2" /> Equipment Status</h3>
            <div className="flex-1 flex items-center justify-center py-4">
              <div className="grid grid-cols-3 w-full gap-4 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-mono text-status-normal mb-1">{isLoading ? "-" : plant?.inverterCount || 0}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Total<br/>Inverters</span>
                </div>
                <div className="flex flex-col items-center border-x border-border">
                  <span className="text-3xl font-mono text-status-fault mb-1">{isLoading ? "-" : plant?.offlineInverterCount || 0}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Offline/<br/>Fault</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-mono text-status-warning mb-1">{isLoading ? "-" : plant?.alertCounts.major || 0}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Major<br/>Alerts</span>
                </div>
              </div>
            </div>
            <div className="mt-auto pt-4 border-t border-border">
              <Link href={`/plants/${plantId}/inverters`} className="text-sm text-primary hover:underline w-full text-center block">
                View All Inverters →
              </Link>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
