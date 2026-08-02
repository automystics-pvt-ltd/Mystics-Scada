import { useGetPlant, useListInverters, getGetPlantQueryKey, getListInvertersQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { HealthBadge } from "@/components/ui/scada";
import { Link, useParams } from "wouter";
import { ArrowLeft, Zap, Thermometer, Activity, ArrowRight } from "lucide-react";
import { getPlantZones, zoneIdToIndex, computeHealthScore, healthScoreColor } from "@/lib/plantHierarchy";
import { GenerationRing } from "@/components/ui/scada";
import type { HealthState } from "@workspace/api-client-react";

const STATUS_DOT: Record<string, string> = {
  running:   "bg-status-normal",
  standby:   "bg-status-warning",
  fault:     "bg-status-fault",
  comm_lost: "bg-status-offline",
};

export default function PlantZoneDetail() {
  const { plantId, zoneId } = useParams();
  const pid = plantId || "";
  const zid = zoneId || "";

  const { data: plant } = useGetPlant(pid, {
    query: { enabled: !!pid, refetchInterval: 10000, queryKey: getGetPlantQueryKey(pid) },
  });
  const { data: inverters = [], isLoading } = useListInverters(pid, {
    query: { enabled: !!pid, refetchInterval: 10000, queryKey: getListInvertersQueryKey(pid) },
  });

  const zones = plant ? getPlantZones(plant.inverterCount, pid) : [];
  const zoneIndex = zoneIdToIndex(zid);
  const zone = zones[zoneIndex];
  const zoneInvs = zone ? inverters.filter((inv) => zone.inverterIds.includes(inv.id)) : [];

  const online = zoneInvs.filter((inv) => inv.status === "running").length;
  const faults = zoneInvs.filter((inv) => inv.status === "fault").length;
  const commLost = zoneInvs.filter((inv) => inv.status === "comm_lost").length;
  const totalPower = zoneInvs.reduce((s, inv) => s + (inv.acPowerKw ?? 0), 0);
  const total = zoneInvs.length || 1;
  const availabilityPct = (online / total) * 100;
  const pseudoPr = plant ? plant.pr * (availabilityPct / 100) : 80;
  const healthScore = computeHealthScore(pseudoPr, availabilityPct, { critical: faults, major: commLost });
  const healthStatus: HealthState = faults > 0 ? "fault" : commLost > 0 ? "offline" : online < total ? "warning" : "normal";
  const color = healthScoreColor(healthScore);

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        {/* Breadcrumb & Header */}
        <div className="border border-border/50 bg-card/40 p-5 relative flex-shrink-0">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
          
          <div className="flex items-center mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Link href="/" className="hover:text-brand transition-colors">Portfolio</Link>
            <span className="mx-2 text-border/50">/</span>
            <Link href={`/plants/${pid}`} className="hover:text-brand transition-colors">{plant?.name ?? pid}</Link>
            <span className="mx-2 text-border/50">/</span>
            <Link href={`/plants/${pid}/zones`} className="hover:text-brand transition-colors">ZONES</Link>
            <span className="mx-2 text-border/50">/</span>
            <span className="text-foreground">{zone?.name ?? zid}</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-4 flex-wrap">
                <Link href={`/plants/${pid}/zones`} className="border border-border/50 bg-card/60 p-1.5 hover:text-brand hover:border-brand/50 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </Link>
                <h1 className="text-xl font-mono font-bold uppercase tracking-widest text-foreground">
                  {zone?.name ?? "ZONE"} // MATRIX DETAIL
                </h1>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2 ml-[3.25rem]">
                {plant?.name} · INVERTERS {(zone?.startIdx ?? 0) + 1} TO {(zone?.endIdx ?? 0) + 1}
              </p>
            </div>
            
            <HealthBadge status={healthStatus} />
          </div>
        </div>

        {/* Zone KPI bar */}
        <div className="border border-border/50 bg-card/60 relative overflow-hidden flex flex-wrap items-center">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand shadow-[0_0_10px_rgba(0,255,170,0.5)]" />
          
          {/* Progress block */}
          <div className="p-5 border-r border-border/50 bg-card/40 flex items-center justify-center flex-shrink-0 min-w-[140px]">
            <div className="text-center">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">HEALTH SCORE</div>
              <div className="font-mono text-3xl font-bold" style={{ color: color, textShadow: `0 0 10px ${color}80` }}>
                {healthScore}
              </div>
            </div>
          </div>
          
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-8 flex-1">
            {[
              { label: "POWER VECTOR", value: totalPower >= 1000 ? `${(totalPower / 1000).toFixed(1)} MW` : `${totalPower.toFixed(0)} KW` },
              { label: "UNITS ONLINE", value: `${online} / ${total}` },
              { label: "AVAILABILITY", value: `${availabilityPct.toFixed(1)}%` },
              { label: "STATUS CODE", value: healthStatus.toUpperCase() },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-brand/50 inline-block" /> {label}
                </div>
                <div className="font-mono text-lg font-bold text-foreground">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Links to zone arrays and inverter list */}
        <div className="flex gap-4 flex-wrap">
          <Link href={`/plants/${pid}/zones/${zid}/arrays`}>
            <div className="inline-flex items-center gap-2 border border-brand bg-brand/10 text-brand px-4 py-2 font-mono text-[10px] uppercase tracking-widest hover:bg-brand/20 transition-colors shadow-[0_0_10px_rgba(0,255,170,0.2)] cursor-pointer">
              ACCESS STRING ARRAYS <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>
          <Link href={`/plants/${pid}/inverters`}>
            <div className="inline-flex items-center gap-2 border border-border/50 bg-card/40 text-muted-foreground px-4 py-2 font-mono text-[10px] uppercase tracking-widest hover:border-brand/50 hover:text-brand transition-colors cursor-pointer">
              GLOBAL INVERTER REGISTRY <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        </div>

        {/* Inverter grid */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-brand font-bold">
              {zone?.name} HARDWARE MATRIX
            </h2>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="border border-border/50 bg-card/40 h-[180px] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {zoneInvs.map((inv) => {
                const arrLink = `/plants/${pid}/zones/${zid}/arrays/${inv.id}-arr-0`;
                
                const isFault = inv.status === "fault" || inv.status === "comm_lost";
                const isWarning = inv.status === "standby";
                
                return (
                  <Link key={inv.id} href={`/plants/${pid}/inverters/${inv.id}`}>
                    <div className={`border bg-card/60 p-4 hover:bg-brand/5 cursor-pointer group transition-all relative ${
                      isFault ? "border-status-fault/50" : isWarning ? "border-status-warning/50" : "border-border/50 hover:border-brand/50"
                    }`}>
                      <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${
                        isFault ? "bg-status-fault" : isWarning ? "bg-status-warning" : "bg-border/50 group-hover:bg-brand"
                      }`} />
                      
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="font-mono font-bold uppercase tracking-widest text-sm group-hover:text-brand transition-colors">{inv.name}</div>
                          <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1">{inv.id}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 ${STATUS_DOT[inv.status] ?? "bg-muted"} ${inv.status === "running" ? "shadow-[0_0_5px_rgba(34,197,94,0.5)]" : ""}`} />
                          <span className={`font-mono text-[9px] uppercase tracking-widest font-bold ${
                            isFault ? "text-status-fault" : isWarning ? "text-status-warning" : "text-status-normal"
                          }`}>{inv.status.replace("_", " ")}</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-px bg-border/50 border border-border/50">
                        <div className="bg-card p-2 text-center">
                          <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1">POWER</div>
                          <div className="font-mono text-sm font-bold text-foreground">
                            {inv.acPowerKw != null ? `${inv.acPowerKw.toFixed(0)} KW` : "--"}
                          </div>
                        </div>
                        <div className="bg-card p-2 text-center">
                          <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1">EFFICIENCY</div>
                          <div className="font-mono text-sm font-bold text-foreground">
                            {inv.efficiencyPct != null && inv.efficiencyPct > 0 ? `${inv.efficiencyPct.toFixed(1)}%` : "--"}
                          </div>
                        </div>
                        <div className="bg-card p-2 text-center">
                          <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1">TEMP</div>
                          <div className={`font-mono text-sm font-bold ${(inv.temperatureC ?? 0) > 62 ? "text-status-warning drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]" : "text-foreground"}`}>
                            {inv.temperatureC != null ? `${inv.temperatureC.toFixed(0)}°C` : "--"}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 flex justify-between items-center border-t border-border/50 pt-3">
                        <Link href={arrLink} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                          <span className="font-mono text-[9px] uppercase tracking-widest text-brand hover:text-brand/80 border-b border-dashed border-brand/50 hover:border-brand">
                            DIAGNOSTICS &rarr;
                          </span>
                        </Link>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-brand flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          INV DATA <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
