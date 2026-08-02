import { useGetPlant, useListStringReadings, getGetPlantQueryKey, getListStringReadingsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Zap, ArrowRight } from "lucide-react";
import { getPlantZones, zoneIdToIndex, getInverterArrays, parseArrayId, getStringsPerInverter } from "@/lib/plantHierarchy";

export default function PlantZoneArrayDetail() {
  const { plantId, zoneId, arrayId } = useParams();
  const pid = plantId || "";
  const zid = zoneId || "";
  const aid = arrayId || "";

  const parsed = parseArrayId(aid);
  const inverterId = parsed?.inverterId ?? "";
  const arrayIndex = parsed?.arrayIndex ?? 0;

  const { data: plant } = useGetPlant(pid, {
    query: { enabled: !!pid, queryKey: getGetPlantQueryKey(pid) },
  });
  const { data: allStrings = [], isLoading } = useListStringReadings(inverterId, {
    query: {
      enabled: !!inverterId,
      refetchInterval: 5000,
      queryKey: getListStringReadingsQueryKey(inverterId),
    },
  });

  const zones = plant ? getPlantZones(plant.inverterCount, pid) : [];
  const zoneIndex = zoneIdToIndex(zid);
  const zone = zones[zoneIndex];

  const stringsPerInv = getStringsPerInverter(pid);
  const arrays = getInverterArrays(stringsPerInv, inverterId);
  const currentArray = arrays[arrayIndex];
  const arrayStrings = currentArray ? allStrings.slice(currentArray.startStringIdx, currentArray.endStringIdx + 1) : [];

  const inverterName = inverterId.includes("-inv-")
    ? `Inverter ${parseInt(inverterId.split("-inv-")[1] ?? "0", 10) + 1}`
    : inverterId;

  const online = arrayStrings.filter(s => s.status === "on").length;
  const deviating = arrayStrings.filter(s => s.isDeviating).length;
  const avgCurrent = arrayStrings.length > 0
    ? arrayStrings.reduce((s, str) => s + str.currentA, 0) / arrayStrings.length
    : 0;

  function devColor(pct: number) {
    if (Math.abs(pct) > 20) return "text-status-fault";
    if (Math.abs(pct) > 10) return "text-status-warning";
    return "text-status-normal";
  }

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        {/* Breadcrumb */}
        <div className="border border-border/50 bg-card/40 p-5 relative flex-shrink-0">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
          <div className="flex items-center mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground flex-wrap">
            <Link href="/" className="hover:text-brand transition-colors">Portfolio</Link>
            <span className="mx-2 text-border/50">/</span>
            <Link href={`/plants/${pid}`} className="hover:text-brand transition-colors">{plant?.name ?? pid}</Link>
            <span className="mx-2 text-border/50">/</span>
            <Link href={`/plants/${pid}/zones`} className="hover:text-brand transition-colors">ZONES</Link>
            <span className="mx-2 text-border/50">/</span>
            <Link href={`/plants/${pid}/zones/${zid}`} className="hover:text-brand transition-colors">{zone?.name ?? zid}</Link>
            <span className="mx-2 text-border/50">/</span>
            <Link href={`/plants/${pid}/zones/${zid}/arrays`} className="hover:text-brand transition-colors">ARRAYS</Link>
            <span className="mx-2 text-border/50">/</span>
            <span className="text-foreground">{currentArray?.name ?? aid}</span>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            <Link href={`/plants/${pid}/zones/${zid}/arrays`} className="border border-border/50 bg-card/60 p-1.5 hover:text-brand hover:border-brand/50 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-xl font-mono font-bold uppercase tracking-widest text-foreground">
              {zone?.name} // {inverterName} // {currentArray?.name ?? "ARRAY"}
            </h1>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2 ml-[3.25rem]">
            {plant?.name} · STRINGS {(currentArray?.startStringIdx ?? 0) + 1} TO {(currentArray?.endStringIdx ?? 0) + 1}
          </p>
        </div>

        {/* Array KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "STRINGS ONLINE", value: `${online} / ${arrayStrings.length}`, accent: online < arrayStrings.length ? "text-status-fault drop-shadow-[0_0_5px_rgba(239,68,68,0.5)] border-status-fault/50" : "text-brand drop-shadow-[0_0_5px_rgba(0,255,170,0.5)] border-brand/50" },
            { label: "DEVIATING", value: `${deviating}`, accent: deviating > 0 ? "text-status-warning drop-shadow-[0_0_5px_rgba(251,191,36,0.5)] border-status-warning/50" : "text-brand drop-shadow-[0_0_5px_rgba(0,255,170,0.5)] border-brand/50" },
            { label: "AVG CURRENT", value: avgCurrent > 0 ? `${avgCurrent.toFixed(2)} A` : "--", accent: "text-foreground border-border/50" },
            { label: "MEDIAN CURRENT", value: arrayStrings[0]?.medianCurrentA != null ? `${arrayStrings[0].medianCurrentA.toFixed(2)} A` : "--", accent: "text-foreground border-border/50" },
          ].map(({ label, value, accent }) => (
            <div key={label} className={`border bg-card/60 p-5 ${accent.split(" ").find(c => c.startsWith("border-")) || "border-border/50"}`}>
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
              <div className={`font-mono text-2xl font-bold mt-2 ${accent.replace(/border-[^\s]+/, "")}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* String table */}
        <div className="border border-border/50 bg-card/40 relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
            <h3 className="font-mono text-sm uppercase tracking-widest font-bold text-foreground">STRING TELEMETRY // {currentArray?.name}</h3>
            <span className="font-mono text-[9px] uppercase tracking-widest text-brand border border-brand/30 bg-brand/5 px-2 py-0.5 animate-pulse">5S SYNC</span>
          </div>

          {isLoading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-card/60 border border-border/50 animate-pulse" />
              ))}
            </div>
          ) : arrayStrings.length === 0 ? (
            <div className="p-5 text-center font-mono text-[10px] uppercase tracking-widest text-status-warning">DATA STREAM EMPTY</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-card/80">
                    <th className="text-left px-5 py-3 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">STRING_ID</th>
                    <th className="text-right px-5 py-3 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">CURRENT (A)</th>
                    <th className="text-right px-5 py-3 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">VOLTAGE (V)</th>
                    <th className="text-right px-5 py-3 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">DEVIATION</th>
                    <th className="text-center px-5 py-3 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">STATE</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {arrayStrings.map((str, i) => (
                    <tr key={str.id} className={`border-b border-border/50 hover:bg-brand/5 transition-colors ${i % 2 === 0 ? "bg-card/40" : "bg-card/20"}`}>
                      <td className="px-5 py-3">
                        <div className="font-bold text-foreground uppercase tracking-widest text-xs">{str.label}</div>
                        <div className="text-[9px] text-muted-foreground">{str.id}</div>
                      </td>
                      <td className="px-5 py-3 text-right text-brand">
                        {str.currentA > 0 ? str.currentA.toFixed(2) : "--"}
                      </td>
                      <td className="px-5 py-3 text-right text-brand/60">
                        {str.voltageV.toFixed(1)}
                      </td>
                      <td className={`px-5 py-3 text-right font-bold ${devColor(str.deviationPct)}`}>
                        {str.deviationPct >= 0 ? "+" : ""}{str.deviationPct.toFixed(1)}%
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-center">
                          {str.status === "on" && !str.isDeviating && (
                            <span className="border border-status-normal/50 bg-status-normal/10 text-status-normal px-2 py-0.5 text-[9px] font-bold flex items-center gap-1 uppercase tracking-widest">
                              <span className="w-1.5 h-1.5 bg-status-normal shadow-[0_0_5px_rgba(34,197,94,0.5)]" /> NOMINAL
                            </span>
                          )}
                          {str.isDeviating && (
                            <span className="border border-status-warning/50 bg-status-warning/10 text-status-warning px-2 py-0.5 text-[9px] font-bold flex items-center gap-1 uppercase tracking-widest animate-pulse">
                              <span className="w-1.5 h-1.5 bg-status-warning shadow-[0_0_5px_rgba(251,191,36,0.5)]" /> DEVIATING
                            </span>
                          )}
                          {str.status === "off" && (
                            <span className="border border-status-fault/50 bg-status-fault/10 text-status-fault px-2 py-0.5 text-[9px] font-bold flex items-center gap-1 uppercase tracking-widest">
                              <span className="w-1.5 h-1.5 bg-status-fault shadow-[0_0_5px_rgba(239,68,68,0.5)]" /> OFFLINE
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Navigation to adjacent arrays */}
        <div className="flex items-center justify-between mt-4">
          {arrayIndex > 0 ? (
            <Link href={`/plants/${pid}/zones/${zid}/arrays/${inverterId}-arr-${arrayIndex - 1}`}>
              <div className="font-mono text-[9px] uppercase tracking-widest font-bold text-brand hover:text-brand/80 border border-brand/50 bg-brand/5 px-4 py-2 flex items-center gap-2 transition-colors cursor-pointer">
                <ArrowLeft className="w-3 h-3" /> PREV ARRAY
              </div>
            </Link>
          ) : <div />}
          
          {currentArray && arrayIndex < arrays.length - 1 ? (
            <Link href={`/plants/${pid}/zones/${zid}/arrays/${inverterId}-arr-${arrayIndex + 1}`}>
              <div className="font-mono text-[9px] uppercase tracking-widest font-bold text-brand hover:text-brand/80 border border-brand/50 bg-brand/5 px-4 py-2 flex items-center gap-2 transition-colors cursor-pointer">
                NEXT ARRAY <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ) : <div />}
        </div>
      </div>
    </AppLayout>
  );
}
