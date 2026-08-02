import { useGetPlant, useListInverters, useListStringReadings, getGetPlantQueryKey, getListInvertersQueryKey, getListStringReadingsQueryKey } from "@workspace/api-client-react";
// Note: useListStringReadings(inverterId, options) — plantId not a separate arg
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import { ArrowLeft, ArrowRight, Layers } from "lucide-react";
import { getPlantZones, zoneIdToIndex, getInverterArrays, getStringsPerInverter } from "@/lib/plantHierarchy";

function ArrayCard({ plantId, zoneId, inverterId, inverterName, arrId, arrName, startStr, endStr }: {
  plantId: string; zoneId: string; inverterId: string; inverterName: string;
  arrId: string; arrName: string; startStr: number; endStr: number;
}) {
  const { data: strings = [] } = useListStringReadings(inverterId, {
    query: { refetchInterval: 10000, queryKey: getListStringReadingsQueryKey(inverterId) },
  });

  const arrayStrings = strings.slice(startStr, endStr + 1);
  const online = arrayStrings.filter(s => s.status === "on").length;
  const deviating = arrayStrings.filter(s => s.isDeviating).length;
  const avgCurrent = arrayStrings.length > 0
    ? arrayStrings.reduce((s, str) => s + str.currentA, 0) / arrayStrings.length
    : 0;

  const health = deviating > 0 ? "warning" : online < arrayStrings.length ? "fault" : "normal";
  const isWarning = health === "warning";
  const isFault = health === "fault";

  return (
    <Link href={`/plants/${plantId}/zones/${zoneId}/arrays/${arrId}`}>
      <div className={`border bg-card/60 p-4 hover:bg-brand/5 cursor-pointer group transition-all relative overflow-hidden ${
        isFault ? "border-status-fault/50" : isWarning ? "border-status-warning/50" : "border-border/50 hover:border-brand/50"
      }`}>
        <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${
          isFault ? "bg-status-fault shadow-[0_0_10px_rgba(239,68,68,0.5)]" : isWarning ? "bg-status-warning shadow-[0_0_10px_rgba(251,191,36,0.5)]" : "bg-border/50 group-hover:bg-brand"
        }`} />
        
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className={`w-3.5 h-3.5 ${isFault ? "text-status-fault" : isWarning ? "text-status-warning" : "text-brand/50 group-hover:text-brand"}`} />
              <span className="font-mono text-sm font-bold uppercase tracking-widest group-hover:text-brand transition-colors">{arrName}</span>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1 ml-5">
              {inverterName} // STRINGS {startStr + 1} TO {endStr + 1}
            </div>
          </div>
          <div className={`font-mono text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 border ${
            health === "normal" ? "bg-status-normal/10 border-status-normal/50 text-status-normal"
              : health === "warning" ? "bg-status-warning/10 border-status-warning/50 text-status-warning animate-pulse"
                : "bg-status-fault/10 border-status-fault/50 text-status-fault animate-pulse"
          }`}>
            {health === "normal" ? "NOMINAL" : health.toUpperCase()}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-px bg-border/50 border border-border/50">
          <div className="bg-card p-2 text-center">
            <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1">STRINGS</div>
            <div className={`font-mono text-sm font-bold ${online < arrayStrings.length ? "text-status-fault drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" : "text-foreground"}`}>
              {online}/{arrayStrings.length}
            </div>
          </div>
          <div className="bg-card p-2 text-center">
            <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1">AVG CUR</div>
            <div className="font-mono text-sm font-bold text-foreground">
              {avgCurrent > 0 ? `${avgCurrent.toFixed(2)} A` : "--"}
            </div>
          </div>
          <div className="bg-card p-2 text-center">
            <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1">DEVIATING</div>
            <div className={`font-mono text-sm font-bold ${deviating > 0 ? "text-status-warning drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]" : "text-foreground"}`}>
              {deviating}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end border-t border-border/50 pt-3">
          <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-brand flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            ACCESS STRINGS <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function PlantZoneArrays() {
  const { plantId, zoneId } = useParams();
  const pid = plantId || "";
  const zid = zoneId || "";

  const { data: plant } = useGetPlant(pid, {
    query: { enabled: !!pid, refetchInterval: 30000, queryKey: getGetPlantQueryKey(pid) },
  });
  const { data: inverters = [] } = useListInverters(pid, {
    query: { enabled: !!pid, refetchInterval: 30000, queryKey: getListInvertersQueryKey(pid) },
  });

  const zones = plant ? getPlantZones(plant.inverterCount, pid) : [];
  const zoneIndex = zoneIdToIndex(zid);
  const zone = zones[zoneIndex];
  const zoneInvs = zone ? inverters.filter((inv) => zone.inverterIds.includes(inv.id)) : [];

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        {/* Breadcrumb */}
        <div className="border border-border/50 bg-card/40 p-5 relative flex-shrink-0">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
          
          <div className="flex items-center mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Link href="/" className="hover:text-brand transition-colors">Portfolio</Link>
            <span className="mx-2 text-border/50">/</span>
            <Link href={`/plants/${pid}`} className="hover:text-brand transition-colors">{plant?.name ?? pid}</Link>
            <span className="mx-2 text-border/50">/</span>
            <Link href={`/plants/${pid}/zones`} className="hover:text-brand transition-colors">ZONES</Link>
            <span className="mx-2 text-border/50">/</span>
            <Link href={`/plants/${pid}/zones/${zid}`} className="hover:text-brand transition-colors">{zone?.name ?? zid}</Link>
            <span className="mx-2 text-border/50">/</span>
            <span className="text-foreground">ARRAYS</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-4 flex-wrap">
                <Link href={`/plants/${pid}/zones/${zid}`} className="border border-border/50 bg-card/60 p-1.5 hover:text-brand hover:border-brand/50 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </Link>
                <h1 className="text-xl font-mono font-bold uppercase tracking-widest text-foreground">
                  {zone?.name} // STRING ARRAYS
                </h1>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2 ml-[3.25rem]">
                {plant?.name} · {zoneInvs.length} INVERTERS · STRING GROUPS OF 4
              </p>
            </div>
          </div>
        </div>

        {/* Arrays grouped by inverter */}
        {zoneInvs.length === 0 ? (
          <div className="flex items-center justify-center h-40 font-mono text-[10px] uppercase tracking-widest text-brand animate-pulse">
            LOADING MATRIX VECTORS...
          </div>
        ) : (
          <div className="space-y-10">
            {zoneInvs.map((inv) => {
              const stringsPerInv = getStringsPerInverter(pid);
              const arrays = getInverterArrays(stringsPerInv, inv.id);
              
              const isInvFault = inv.status === "fault" || inv.status === "comm_lost";
              const isInvWarning = inv.status === "standby";
              
              return (
                <div key={inv.id} className="border border-border/50 bg-card/40 p-5">
                  <div className="flex items-center gap-3 mb-5 pb-3 border-b border-border/50">
                    <div className="font-mono text-base font-bold uppercase tracking-widest">{inv.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{inv.id}</div>
                    <div className={`font-mono text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 border ml-auto ${
                      isInvFault ? "bg-status-fault/10 border-status-fault/50 text-status-fault animate-pulse"
                        : isInvWarning ? "bg-status-warning/10 border-status-warning/50 text-status-warning"
                        : inv.status === "running" ? "bg-status-normal/10 border-status-normal/50 text-status-normal"
                          : "bg-card/60 border-border/50 text-muted-foreground"
                    }`}>
                      {inv.status.toUpperCase().replace("_", " ")}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {arrays.map((arr) => (
                      <ArrayCard
                        key={arr.id}
                        plantId={pid}
                        zoneId={zid}
                        inverterId={inv.id}
                        inverterName={inv.name}
                        arrId={arr.id}
                        arrName={arr.name}
                        startStr={arr.startStringIdx}
                        endStr={arr.endStringIdx}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
