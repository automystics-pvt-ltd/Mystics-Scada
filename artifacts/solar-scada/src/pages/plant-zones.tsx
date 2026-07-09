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
        {/* Breadcrumb + title */}
        <div>
          <div className="flex items-center mb-1 text-sm text-muted-foreground gap-2">
            <Link href="/" className="hover:text-foreground transition-colors">Portfolio</Link>
            <span>/</span>
            <Link href={`/plants/${pid}`} className="hover:text-foreground transition-colors">{plant?.name ?? pid}</Link>
            <span>/</span>
            <span className="text-foreground">Zones</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/plants/${pid}`} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">{plant?.name ?? "Plant"} — Zone Overview</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {zones.length} operational zones · {plant?.inverterCount ?? "--"} inverters total
          </p>
        </div>

        {/* Sub-nav */}
        <div className="border-b border-border">
          <nav className="-mb-px flex gap-6 overflow-x-auto">
            {SUB_NAV(pid).map((item) => (
              <Link key={item.name} href={item.href}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  item.href === `/plants/${pid}/zones`
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        {/* Zone cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card border border-card-border rounded-xl p-5 h-52 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {zoneData.map((zone) => {
              const color = healthScoreColor(zone.healthScore);
              return (
                <Link key={zone.id} href={`/plants/${pid}/zones/${zone.id}`}>
                  <div className="bg-card border border-card-border rounded-xl p-5 hover:border-primary/40 cursor-pointer group transition-all">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
                            <span className="text-sm font-bold text-primary">{zone.letter}</span>
                          </div>
                          <span className="font-semibold text-base group-hover:text-primary transition-colors">{zone.name}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1.5 ml-9">
                          Inverters {zone.startIdx + 1}–{zone.endIdx + 1} · {zone.total} units
                        </div>
                      </div>
                      <HealthBadge status={zone.healthStatus} />
                    </div>

                    {/* Ring + stats */}
                    <div className="flex items-center gap-4">
                      <GenerationRing
                        pct={zone.availabilityPct}
                        label={`${zone.healthScore}`}
                        sublabel="score"
                        size={72}
                        strokeWidth={6}
                        color={color}
                      />
                      <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5">
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Power</div>
                          <div className="font-mono text-sm font-medium">
                            {zone.totalPower >= 1000
                              ? `${(zone.totalPower / 1000).toFixed(1)} MW`
                              : `${zone.totalPower.toFixed(0)} kW`}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Online</div>
                          <div className="font-mono text-sm font-medium">{zone.online}/{zone.total}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Efficiency</div>
                          <div className="font-mono text-sm font-medium">{zone.avgEff > 0 ? `${zone.avgEff.toFixed(1)}%` : "--"}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avail.</div>
                          <div className="font-mono text-sm font-medium">{zone.availabilityPct.toFixed(0)}%</div>
                        </div>
                      </div>
                    </div>

                    {/* Mini sparkline */}
                    <div className="mt-3 -mx-1 opacity-50 group-hover:opacity-90 transition-opacity">
                      <Sparkline data={zone.sparkline} dataKey="v" color={color} className="h-8" />
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      {zone.faults > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-status-fault/15 text-status-fault">
                          {zone.faults} fault{zone.faults > 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        View zone <ArrowRight className="w-3 h-3" />
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
