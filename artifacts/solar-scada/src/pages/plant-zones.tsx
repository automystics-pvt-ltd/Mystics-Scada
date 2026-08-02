import { useGetPlant, useListInverters, getGetPlantQueryKey, getListInvertersQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { HealthBadge } from "@/components/ui/scada";
import { Link, useParams } from "wouter";
import { ArrowLeft, Cpu, Network, BarChart4, CloudLightning, Layers, ArrowRight } from "lucide-react";
import { getPlantZones, computeHealthScore, healthScoreColor, syntheticSparkline } from "@/lib/plantHierarchy";
import { GenerationRing } from "@/components/ui/scada";
import { Sparkline } from "@/components/ui/scada";
import type { HealthState } from "@workspace/api-client-react";

const SUB_NAV = (pid: string) => [
  { name: "Overview",           href: `/plants/${pid}` },
  { name: "Single Line Diagram",href: `/plants/${pid}/sld` },
  { name: "Zones",              href: `/plants/${pid}/zones` },
  { name: "Inverters",          href: `/plants/${pid}/inverters` },
  { name: "Weather",            href: `/plants/${pid}/weather` },
  { name: "Analytics",          href: `/plants/${pid}/analytics` },
];

export default function PlantZones() {
  const { plantId } = useParams();
  const pid = plantId || "";

  const { data: plant, isLoading } = useGetPlant(pid, {
    query: { enabled: !!pid, refetchInterval: 10000, queryKey: getGetPlantQueryKey(pid) },
  });
  const { data: inverters = [] } = useListInverters(pid, {
    query: { enabled: !!pid, refetchInterval: 15000, queryKey: getListInvertersQueryKey(pid) },
  });

  const zones = plant ? getPlantZones(plant.inverterCount, pid) : [];

  const zoneData = zones.map((zone) => {
    const zoneInvs = inverters.filter((inv) => zone.inverterIds.includes(inv.id));
    const total = zoneInvs.length || 1;
    const online = zoneInvs.filter((inv) => inv.status === "running").length;
    const faults = zoneInvs.filter((inv) => inv.status === "fault").length;
    const commLost = zoneInvs.filter((inv) => inv.status === "comm_lost").length;
    const totalPower = zoneInvs.reduce((s, inv) => s + (inv.acPowerKw ?? 0), 0);
    const running = zoneInvs.filter((inv) => inv.efficiencyPct > 0);
    const avgEff = running.length > 0
      ? running.reduce((s, inv) => s + inv.efficiencyPct, 0) / running.length
      : 0;
    const availabilityPct = (online / total) * 100;
    const pseudoPr = plant ? plant.pr * (availabilityPct / 100) : 80;
    const healthScore = computeHealthScore(pseudoPr, availabilityPct, { critical: faults, major: commLost });
    const healthStatus: HealthState = faults > 0 ? "fault" : commLost > 0 ? "offline" : online < total ? "warning" : "normal";
    const sparkline = syntheticSparkline((plant?.capacityKw ?? 10000) / zones.length, pseudoPr);

    return { ...zone, online, faults, commLost, totalPower, avgEff, availabilityPct, healthScore, healthStatus, sparkline, total };
  });

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        {/* Breadcrumb & Header */}
        <div className="border border-border/50 bg-black/40 p-5 relative flex-shrink-0">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
          
          <div className="flex items-center mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Link href="/" className="hover:text-brand transition-colors">Portfolio</Link>
            <span className="mx-2 text-border/50">/</span>
            <Link href={`/plants/${pid}`} className="hover:text-brand transition-colors">{plant?.name ?? pid}</Link>
            <span className="mx-2 text-border/50">/</span>
            <span className="text-foreground">ZONES</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-4 flex-wrap">
                <h1 className="text-xl font-mono font-bold uppercase tracking-widest text-foreground">
                  ZONE OPERATIONS
                </h1>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
                {zones.length} OPERATIONAL ZONES // {plant?.inverterCount ?? "--"} INVERTERS TOTAL
              </p>
            </div>
            
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 custom-scrollbar">
              {SUB_NAV(pid).map((item) => {
                const isActive = item.href === `/plants/${pid}/zones`;
                return (
                  <Link key={item.name} href={item.href}>
                    <button className={`flex items-center gap-2 px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${
                      isActive
                        ? "bg-brand/10 text-brand border border-brand/50 shadow-[0_0_10px_rgba(0,255,170,0.2)]"
                        : "bg-black/40 text-muted-foreground border border-border/50 hover:bg-brand/5 hover:text-brand hover:border-brand/30"
                    }`}>
                      {item.name}
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Zone cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border border-border/50 bg-black/40 p-5 h-[240px] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {zoneData.map((zone) => {
              const color = healthScoreColor(zone.healthScore);
              const colorBase = color === "hsl(var(--status-normal))" ? "text-brand border-brand/50 bg-brand/5" : 
                                color === "hsl(var(--status-warning))" ? "text-status-warning border-status-warning/50 bg-status-warning/5" :
                                color === "hsl(var(--status-fault))" ? "text-status-fault border-status-fault/50 bg-status-fault/5" : "text-brand border-brand/50 bg-brand/5";
              
              const isWarning = zone.healthStatus === "warning";
              const isFault = zone.healthStatus === "fault";

              return (
                <Link key={zone.id} href={`/plants/${pid}/zones/${zone.id}`}>
                  <div className={`border bg-black/60 p-5 hover:bg-brand/5 cursor-pointer group transition-all relative overflow-hidden ${
                    isFault ? "border-status-fault/50" : isWarning ? "border-status-warning/50" : "border-border/50 hover:border-brand/50"
                  }`}>
                    <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${
                      isFault ? "bg-status-fault shadow-[0_0_10px_rgba(239,68,68,0.5)]" : isWarning ? "bg-status-warning shadow-[0_0_10px_rgba(251,191,36,0.5)]" : "bg-border/50 group-hover:bg-brand"
                    }`} />
                    
                    {/* Header */}
                    <div className="flex items-start justify-between mb-5">
                      <div>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 border flex items-center justify-center font-mono font-bold text-sm ${colorBase}`}>
                            {zone.letter}
                          </div>
                          <span className="font-mono text-base uppercase tracking-widest font-bold group-hover:text-brand transition-colors">{zone.name}</span>
                        </div>
                        <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-2 ml-11">
                          INV {zone.startIdx + 1} TO {zone.endIdx + 1} // {zone.total} UNITS
                        </div>
                      </div>
                      <HealthBadge status={zone.healthStatus} />
                    </div>

                    {/* Matrix grid */}
                    <div className="grid grid-cols-2 gap-px bg-border/50 border border-border/50 mb-4">
                      <div className="bg-black p-3">
                        <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest mb-1">POWER OUT</div>
                        <div className="font-mono text-sm font-bold text-foreground">
                          {zone.totalPower >= 1000
                            ? `${(zone.totalPower / 1000).toFixed(1)} MW`
                            : `${zone.totalPower.toFixed(0)} KW`}
                        </div>
                      </div>
                      <div className="bg-black p-3">
                        <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest mb-1">ONLINE / TOT</div>
                        <div className="font-mono text-sm font-bold text-foreground">{zone.online}/{zone.total}</div>
                      </div>
                      <div className="bg-black p-3">
                        <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest mb-1">EFFICIENCY</div>
                        <div className="font-mono text-sm font-bold text-foreground">{zone.avgEff > 0 ? `${zone.avgEff.toFixed(1)}%` : "--"}</div>
                      </div>
                      <div className="bg-black p-3">
                        <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest mb-1">AVAILABILITY</div>
                        <div className="font-mono text-sm font-bold text-foreground">{zone.availabilityPct.toFixed(0)}%</div>
                      </div>
                    </div>

                    {/* Mini sparkline */}
                    <div className="mt-4 -mx-1 opacity-50 group-hover:opacity-100 transition-opacity px-2">
                      <Sparkline data={zone.sparkline} dataKey="v" color={color} className="h-10" />
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                      {zone.faults > 0 ? (
                        <span className="font-mono text-[9px] uppercase tracking-widest font-bold px-2 py-1 border border-status-fault/50 bg-status-fault/10 text-status-fault animate-pulse">
                          {zone.faults} FAULT{zone.faults > 1 ? "S" : ""} DETECTED
                        </span>
                      ) : (
                        <span className="font-mono text-[9px] uppercase tracking-widest font-bold px-2 py-1 border border-status-normal/50 bg-status-normal/10 text-status-normal">
                          NOMINAL
                        </span>
                      )}
                      <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-brand flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        ACCESS ZONE <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
