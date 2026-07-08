import { useGetPlant, useListStringReadings, getGetPlantQueryKey, getListStringReadingsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Zap } from "lucide-react";
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
        <div>
          <div className="flex items-center mb-1 text-sm text-muted-foreground gap-2 flex-wrap">
            <Link href="/" className="hover:text-foreground">Portfolio</Link>
            <span>/</span>
            <Link href={`/plants/${pid}`} className="hover:text-foreground">{plant?.name ?? pid}</Link>
            <span>/</span>
            <Link href={`/plants/${pid}/zones`} className="hover:text-foreground">Zones</Link>
            <span>/</span>
            <Link href={`/plants/${pid}/zones/${zid}`} className="hover:text-foreground">{zone?.name ?? zid}</Link>
            <span>/</span>
            <Link href={`/plants/${pid}/zones/${zid}/arrays`} className="hover:text-foreground">Arrays</Link>
            <span>/</span>
            <span className="text-foreground">{currentArray?.name ?? aid}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/plants/${pid}/zones/${zid}/arrays`} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">
              {zone?.name} · {inverterName} · {currentArray?.name ?? "Array"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {plant?.name} · Strings {(currentArray?.startStringIdx ?? 0) + 1}–{(currentArray?.endStringIdx ?? 0) + 1}
          </p>
        </div>

        {/* Array KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Strings Online", value: `${online} / ${arrayStrings.length}`, accent: online < arrayStrings.length ? "text-status-fault" : "text-status-normal" },
            { label: "Deviating", value: `${deviating}`, accent: deviating > 0 ? "text-status-warning" : "text-status-normal" },
            { label: "Avg Current", value: avgCurrent > 0 ? `${avgCurrent.toFixed(2)} A` : "--", accent: "" },
            { label: "Median Current", value: arrayStrings[0]?.medianCurrentA != null ? `${arrayStrings[0].medianCurrentA.toFixed(2)} A` : "--", accent: "" },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-card border border-card-border rounded-xl p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
              <div className={`font-mono text-2xl font-bold mt-1 ${accent}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* String table */}
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">String Readings — {currentArray?.name}</h3>
            <span className="text-xs text-muted-foreground">5 s refresh</span>
          </div>

          {isLoading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : arrayStrings.length === 0 ? (
            <div className="p-5 text-center text-muted-foreground text-sm">No string data available</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">String</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current (A)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voltage (V)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deviation</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {arrayStrings.map((str, i) => (
                  <tr key={str.id} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{str.label}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{str.id}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {str.currentA > 0 ? str.currentA.toFixed(2) : "--"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {str.voltageV.toFixed(1)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${devColor(str.deviationPct)}`}>
                      {str.deviationPct >= 0 ? "+" : ""}{str.deviationPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      {str.status === "on" && !str.isDeviating && (
                        <CheckCircle2 className="w-4 h-4 text-status-normal inline-block" />
                      )}
                      {str.isDeviating && (
                        <AlertTriangle className="w-4 h-4 text-status-warning inline-block" />
                      )}
                      {str.status === "off" && (
                        <XCircle className="w-4 h-4 text-status-fault inline-block" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Navigation to adjacent arrays */}
        <div className="flex items-center justify-between">
          {arrayIndex > 0 && (
            <Link href={`/plants/${pid}/zones/${zid}/arrays/${inverterId}-arr-${arrayIndex - 1}`}>
              <div className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                ← Array {arrayIndex}
              </div>
            </Link>
          )}
          <div className="flex-1" />
          {currentArray && arrayIndex < arrays.length - 1 && (
            <Link href={`/plants/${pid}/zones/${zid}/arrays/${inverterId}-arr-${arrayIndex + 1}`}>
              <div className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                Array {arrayIndex + 2} →
              </div>
            </Link>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
