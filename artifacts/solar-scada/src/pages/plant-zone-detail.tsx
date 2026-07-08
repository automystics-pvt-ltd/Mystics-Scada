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
        {/* Breadcrumb */}
        <div>
          <div className="flex items-center mb-1 text-sm text-muted-foreground gap-2">
            <Link href="/" className="hover:text-foreground">Portfolio</Link>
            <span>/</span>
            <Link href={`/plants/${pid}`} className="hover:text-foreground">{plant?.name ?? pid}</Link>
            <span>/</span>
            <Link href={`/plants/${pid}/zones`} className="hover:text-foreground">Zones</Link>
            <span>/</span>
            <span className="text-foreground">{zone?.name ?? zid}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/plants/${pid}/zones`} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">{zone?.name ?? "Zone"} — Inverter Detail</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {plant?.name} · Inverters {(zone?.startIdx ?? 0) + 1}–{(zone?.endIdx ?? 0) + 1}
          </p>
        </div>

        {/* Zone KPI bar */}
        <div className="bg-card border border-card-border rounded-xl p-5 flex flex-wrap items-center gap-8">
          <GenerationRing
            pct={availabilityPct}
            label={`${healthScore}`}
            sublabel="health score"
            size={80}
            strokeWidth={7}
            color={color}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { label: "Total Power", value: totalPower >= 1000 ? `${(totalPower / 1000).toFixed(1)} MW` : `${totalPower.toFixed(0)} kW` },
              { label: "Online / Total", value: `${online} / ${total}` },
              { label: "Availability", value: `${availabilityPct.toFixed(1)}%` },
              { label: "Status", value: healthStatus.charAt(0).toUpperCase() + healthStatus.slice(1) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
                <div className="font-mono font-semibold mt-0.5">{value}</div>
              </div>
            ))}
          </div>
          <div className="ml-auto">
            <HealthBadge status={healthStatus} />
          </div>
        </div>

        {/* Links to zone arrays and inverter list */}
        <div className="flex gap-3 flex-wrap">
          <Link href={`/plants/${pid}/zones/${zid}/arrays`}>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary text-sm font-medium rounded-lg hover:bg-primary/20 transition-colors cursor-pointer">
              View String Arrays <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
          <Link href={`/plants/${pid}/inverters`}>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 border border-border text-muted-foreground text-sm font-medium rounded-lg hover:text-foreground transition-colors cursor-pointer">
              All Inverters <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        </div>

        {/* Inverter grid */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Inverters in {zone?.name}
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-card border border-card-border rounded-xl p-4 h-36 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {zoneInvs.map((inv) => {
                const arrLink = `/plants/${pid}/zones/${zid}/arrays/${inv.id}-arr-0`;
                return (
                  <Link key={inv.id} href={`/plants/${pid}/inverters/${inv.id}`}>
                    <div className="bg-card border border-card-border rounded-xl p-4 hover:border-primary/40 cursor-pointer group transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-semibold group-hover:text-primary transition-colors">{inv.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{inv.id}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[inv.status] ?? "bg-muted"}`} />
                          <span className="text-xs text-muted-foreground capitalize">{inv.status.replace("_", " ")}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-muted/30 rounded-lg p-2">
                          <div className="text-[10px] text-muted-foreground">Power</div>
                          <div className="font-mono text-xs font-semibold mt-0.5">
                            {inv.acPowerKw != null ? `${inv.acPowerKw.toFixed(0)} kW` : "--"}
                          </div>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2">
                          <div className="text-[10px] text-muted-foreground">Eff.</div>
                          <div className="font-mono text-xs font-semibold mt-0.5">
                            {inv.efficiencyPct != null && inv.efficiencyPct > 0 ? `${inv.efficiencyPct.toFixed(1)}%` : "--"}
                          </div>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2">
                          <div className="text-[10px] text-muted-foreground">Temp</div>
                          <div className={`font-mono text-xs font-semibold mt-0.5 ${(inv.temperatureC ?? 0) > 62 ? "text-status-warning" : ""}`}>
                            {inv.temperatureC != null ? `${inv.temperatureC.toFixed(0)}°C` : "--"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-between items-center">
                        <Link href={arrLink} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                          <span className="text-[10px] text-primary hover:underline">View arrays →</span>
                        </Link>
                        <span className="text-xs text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          Inverter detail <ArrowRight className="w-3 h-3" />
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
