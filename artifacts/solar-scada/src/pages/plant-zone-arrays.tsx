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
  const healthColors: Record<string, string> = {
    normal: "border-l-status-normal bg-status-normal/5",
    warning: "border-l-[hsl(38,92%,50%)] bg-status-warning/5",
    fault: "border-l-status-fault bg-status-fault/5",
  };

  return (
    <Link href={`/plants/${plantId}/zones/${zoneId}/arrays/${arrId}`}>
      <div className={`bg-card border border-card-border border-l-4 ${healthColors[health]} rounded-xl p-4 hover:border-r-primary/30 cursor-pointer group transition-all`}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-semibold text-sm group-hover:text-primary transition-colors">{arrName}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 ml-5">
              {inverterName} · Strings {startStr + 1}–{endStr + 1}
            </div>
          </div>
          <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            health === "normal" ? "bg-status-normal/15 text-status-normal"
              : health === "warning" ? "bg-status-warning/15 text-status-warning"
                : "bg-status-fault/15 text-status-fault"
          }`}>
            {health.toUpperCase()}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center mt-3">
          <div className="bg-muted/30 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground">Strings</div>
            <div className="font-mono text-sm font-semibold">{online}/{arrayStrings.length}</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground">Avg Current</div>
            <div className="font-mono text-sm font-semibold">{avgCurrent > 0 ? `${avgCurrent.toFixed(2)} A` : "--"}</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground">Deviating</div>
            <div className={`font-mono text-sm font-semibold ${deviating > 0 ? "text-status-warning" : "text-status-normal"}`}>
              {deviating}
            </div>
          </div>
        </div>

        <div className="mt-2 flex justify-end">
          <span className="text-xs text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            View strings <ArrowRight className="w-3 h-3" />
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
        <div>
          <div className="flex items-center mb-1 text-sm text-muted-foreground gap-2">
            <Link href="/" className="hover:text-foreground">Portfolio</Link>
            <span>/</span>
            <Link href={`/plants/${pid}`} className="hover:text-foreground">{plant?.name ?? pid}</Link>
            <span>/</span>
            <Link href={`/plants/${pid}/zones`} className="hover:text-foreground">Zones</Link>
            <span>/</span>
            <Link href={`/plants/${pid}/zones/${zid}`} className="hover:text-foreground">{zone?.name ?? zid}</Link>
            <span>/</span>
            <span className="text-foreground">Arrays</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/plants/${pid}/zones/${zid}`} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">{zone?.name} — String Arrays</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {plant?.name} · {zoneInvs.length} inverters · string groups of 4
          </p>
        </div>

        {/* Arrays grouped by inverter */}
        {zoneInvs.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            Loading inverters…
          </div>
        ) : (
          <div className="space-y-8">
            {zoneInvs.map((inv) => {
              const stringsPerInv = getStringsPerInverter(pid);
              const arrays = getInverterArrays(stringsPerInv, inv.id);
              return (
                <div key={inv.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="text-sm font-semibold">{inv.name}</div>
                    <div className="text-xs text-muted-foreground">{inv.id}</div>
                    <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ml-1 ${
                      inv.status === "fault" ? "bg-status-fault/15 text-status-fault"
                        : inv.status === "running" ? "bg-status-normal/15 text-status-normal"
                          : "bg-muted text-muted-foreground"
                    }`}>
                      {inv.status.toUpperCase().replace("_", " ")}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
