/**
 * CombinerStrings — shows all strings across every inverter feeding a
 * specific combiner box, grouped by inverter, with fault highlighting.
 *
 * Route: /plants/:plantId/combiners/:combinerId/strings
 * Linked from the SLD combiner-node popover.
 */

import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import {
  Layers,
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Server,
  Cpu,
} from "lucide-react";
import { LiveValue } from "@/components/ui/scada";
import { cn } from "@/components/ui/scada";

/* ── API types ─────────────────────────────────────────────────────────── */

interface StringRow {
  id: string;
  label: string;
  currentA: number;
  voltageV: number;
  status: "on" | "off";
  isDeviating: boolean;
  deviationPct: number;
  medianCurrentA: number;
}

interface InverterGroup {
  inverterId: string;
  inverterName: string;
  inverterStatus: string;
  strings: StringRow[];
}

interface CombinerStringsPayload {
  combinerId: string;
  combinerLabel: string;
  plantId: string;
  totalStrings: number;
  faultingStrings: number;
  inverterGroups: InverterGroup[];
}

/* ── Data fetching ─────────────────────────────────────────────────────── */

async function fetchCombinerStrings(
  plantId: string,
  combinerId: string,
): Promise<CombinerStringsPayload> {
  const res = await fetch(`/api/plants/${plantId}/combiners/${combinerId}/strings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function useCombinerStrings(plantId: string, combinerId: string) {
  return useQuery({
    queryKey: ["combiner-strings", plantId, combinerId],
    queryFn: () => fetchCombinerStrings(plantId, combinerId),
    enabled: !!plantId && !!combinerId,
    refetchInterval: 5_000,
  });
}

/* ── Inverter status badge color ──────────────────────────────────────── */

const INV_STATUS_CLASS: Record<string, string> = {
  running:   "bg-status-normal/10 text-status-normal border-status-normal/20",
  standby:   "bg-status-warning/10 text-status-warning border-status-warning/20",
  fault:     "bg-status-fault/10  text-status-fault  border-status-fault/20",
  comm_lost: "bg-muted text-muted-foreground border-border",
};

/* ── String card ──────────────────────────────────────────────────────── */

function StringCard({ str }: { str: StringRow }) {
  return (
    <div
      className={cn(
        "bg-card rounded-lg p-4 border relative overflow-hidden transition-all",
        str.isDeviating
          ? "border-status-fault shadow-[0_0_8px_rgba(239,68,68,0.15)]"
          : str.status === "off"
            ? "border-border/50 opacity-60"
            : "border-card-border hover:border-primary/40",
      )}
    >
      {str.isDeviating && (
        <div className="absolute top-0 right-0 bg-status-fault text-white px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-bl-lg flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Fault
        </div>
      )}

      <div className="flex justify-between items-center mb-3">
        <span className="font-semibold text-sm">{str.label}</span>
        <span
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full border font-medium",
            str.status === "on"
              ? "bg-status-normal/10 text-status-normal border-status-normal/20"
              : "bg-muted text-muted-foreground border-border",
          )}
        >
          {str.status.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-[11px] text-muted-foreground block mb-0.5">Current</span>
          <LiveValue
            value={str.currentA}
            unit="A"
            precision={2}
            valueClassName={str.isDeviating ? "text-status-fault" : ""}
          />
          {str.isDeviating && (
            <div className="flex items-center text-[10px] text-status-fault mt-1 font-mono">
              <ArrowDown className="w-3 h-3 mr-0.5" />
              {str.deviationPct.toFixed(1)}% vs Med
            </div>
          )}
        </div>
        <div>
          <span className="text-[11px] text-muted-foreground block mb-0.5">Voltage</span>
          <LiveValue value={str.voltageV} unit="V" precision={1} />
        </div>
      </div>
    </div>
  );
}

/* ── Inverter group section ───────────────────────────────────────────── */

function InverterGroup({ group }: { group: InverterGroup }) {
  // Count only genuinely anomalous strings (deviating current vs peer median).
  // Strings that are "off" at night or during inverter standby are expected
  // behaviour, not faults — counting them would mislead operators.
  const faultCount = group.strings.filter((s) => s.isDeviating).length;

  return (
    <div className="space-y-3">
      {/* Group header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{group.inverterName}</span>
        </div>
        <span
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize",
            INV_STATUS_CLASS[group.inverterStatus] ?? INV_STATUS_CLASS["comm_lost"],
          )}
        >
          {group.inverterStatus.replace("_", " ")}
        </span>
        {faultCount > 0 ? (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-status-fault font-medium">
            <AlertTriangle className="w-3 h-3" />
            {faultCount} faulting
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-status-normal font-medium">
            <CheckCircle2 className="w-3 h-3" />
            All nominal
          </span>
        )}
      </div>

      {/* String grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {group.strings.map((str) => (
          <StringCard key={str.id} str={str} />
        ))}
      </div>

      {/* Link to single-inverter view */}
      <div className="text-right">
        <Link
          href={`/plants/${group.inverterId.split("-inv-")[0]}/inverters/${group.inverterId}/strings`}
          className="text-xs text-primary hover:underline"
        >
          Open {group.inverterName} strings in full →
        </Link>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function CombinerStrings() {
  const { plantId, combinerId } = useParams<{
    plantId: string;
    combinerId: string;
  }>();

  const { data, isLoading, isError } = useCombinerStrings(
    plantId ?? "",
    combinerId ?? "",
  );

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        {/* Breadcrumb */}
        <div>
          <div className="flex items-center mb-2 text-sm text-muted-foreground flex-wrap gap-1">
            <Link href="/" className="hover:text-foreground transition-colors">
              Portfolio
            </Link>
            <span>/</span>
            <Link
              href={`/plants/${plantId}`}
              className="hover:text-foreground transition-colors"
            >
              Plant
            </Link>
            <span>/</span>
            <Link
              href={`/plants/${plantId}/sld`}
              className="hover:text-foreground transition-colors"
            >
              Single Line Diagram
            </Link>
            <span>/</span>
            <span className="text-foreground">
              {data?.combinerLabel ?? combinerId} — All Strings
            </span>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Server className="w-6 h-6 text-primary" />
                {isLoading ? "Loading…" : (data?.combinerLabel ?? combinerId)}
                <span className="text-muted-foreground font-normal">— String Diagnostics</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                All strings across every inverter in this combiner box · auto-refreshes every 5 s
              </p>
            </div>

            {/* Summary chips */}
            {data && (
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm bg-card border-card-border">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono font-semibold">{data.totalStrings}</span>
                  <span className="text-muted-foreground">strings</span>
                </div>
                {data.faultingStrings > 0 ? (
                  <div className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm bg-status-fault/10 border-status-fault/30 text-status-fault">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-mono font-semibold">{data.faultingStrings}</span>
                    <span>faulting</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm bg-status-normal/10 border-status-normal/30 text-status-normal">
                    <CheckCircle2 className="w-4 h-4" />
                    All nominal
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading && (
          <div className="space-y-8">
            {Array.from({ length: 2 }).map((_, g) => (
              <div key={g} className="space-y-3">
                <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-28 bg-card border border-card-border rounded-lg animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-status-fault/30 bg-status-fault/10 text-status-fault p-6 text-sm">
            Failed to load combiner string data. Check that the combiner ID is valid.
          </div>
        )}

        {data && (
          <div className="space-y-10">
            {data.inverterGroups.map((group) => (
              <InverterGroup key={group.inverterId} group={group} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
