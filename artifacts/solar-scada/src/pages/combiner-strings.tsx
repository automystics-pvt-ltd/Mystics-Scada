/**
 * CombinerStrings — shows all strings across every inverter feeding a
 * specific combiner box, grouped by inverter, with fault highlighting.
 *
 * Route: /plants/:plantId/combiners/:combinerId/strings
 * Linked from the SLD combiner-node popover.
 *
 * URL params:
 *   ?filter=all|faulting   — "faulting" hides healthy strings & empty inverter groups
 *   ?sort=default|deviation — "deviation" sorts worst-deviating strings first within each group
 */

import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Link, useParams, useSearch, useLocation } from "wouter";
import {
  Layers,
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Server,
  Cpu,
  SlidersHorizontal,
  ArrowDownUp,
  Filter,
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

/* ── URL-backed filter / sort state ───────────────────────────────────── */

type FilterMode = "all" | "faulting";
type SortMode   = "default" | "deviation";

const VALID_FILTERS = new Set<FilterMode>(["all", "faulting"]);
const VALID_SORTS   = new Set<SortMode>(["default", "deviation"]);

function buildUrl(basePath: string, p: URLSearchParams): string {
  const qs = p.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function useFilterSort(basePath: string) {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);

  const rawFilter = params.get("filter") ?? "all";
  const rawSort   = params.get("sort")   ?? "default";

  // Clamp invalid param values to their defaults so the toolbar is deterministic
  const filter: FilterMode = VALID_FILTERS.has(rawFilter as FilterMode) ? (rawFilter as FilterMode) : "all";
  const sort: SortMode     = VALID_SORTS.has(rawSort as SortMode)       ? (rawSort as SortMode)     : "default";

  function setFilter(next: FilterMode) {
    const p = new URLSearchParams(search);
    next === "all" ? p.delete("filter") : p.set("filter", next);
    navigate(buildUrl(basePath, p), { replace: true });
  }

  function setSort(next: SortMode) {
    const p = new URLSearchParams(search);
    next === "default" ? p.delete("sort") : p.set("sort", next);
    navigate(buildUrl(basePath, p), { replace: true });
  }

  return { filter, sort, setFilter, setSort };
}

/* ── Apply filter + sort to a payload ─────────────────────────────────── */

function applyFilterSort(
  groups: InverterGroup[],
  filter: FilterMode,
  sort: SortMode,
): InverterGroup[] {
  return groups
    .map((group) => {
      let strings = [...group.strings];

      // Sort first so worst offenders bubble to the top
      if (sort === "deviation") {
        strings.sort((a, b) => Math.abs(b.deviationPct) - Math.abs(a.deviationPct));
      }

      // Then filter
      if (filter === "faulting") {
        strings = strings.filter((s) => s.isDeviating);
      }

      return { ...group, strings };
    })
    // Drop groups with no visible strings when filtering
    .filter((group) => filter === "all" || group.strings.length > 0);
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

function InverterGroupSection({
  group,
  filter,
  totalOriginalStrings,
}: {
  group: InverterGroup;
  filter: FilterMode;
  totalOriginalStrings: number;
}) {
  const faultCount = group.strings.filter((s) => s.isDeviating).length;
  // When filter=faulting, every visible string is faulting; show count vs total
  const hiddenCount = filter === "faulting" ? totalOriginalStrings - group.strings.length : 0;

  return (
    <div className="space-y-3">
      {/* Group header */}
      <div className="flex items-center gap-3 flex-wrap">
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
        {hiddenCount > 0 && (
          <span className="text-[11px] text-muted-foreground">
            ({hiddenCount} healthy hidden)
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

/* ── Toolbar ──────────────────────────────────────────────────────────── */

function Toolbar({
  filter,
  sort,
  onFilter,
  onSort,
  faultingStrings,
  totalStrings,
  visibleStrings,
}: {
  filter: FilterMode;
  sort: SortMode;
  onFilter: (f: FilterMode) => void;
  onSort: (s: SortMode) => void;
  faultingStrings: number;
  totalStrings: number;
  visibleStrings: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-card-border bg-card px-4 py-2.5">
      <SlidersHorizontal className="w-4 h-4 text-muted-foreground flex-shrink-0" />

      {/* Filter toggle */}
      <div className="flex items-center gap-1 rounded-md border border-border p-0.5 bg-muted/50">
        <button
          onClick={() => onFilter("all")}
          className={cn(
            "flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-all",
            filter === "all"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Layers className="w-3 h-3" />
          All strings
          <span className="font-mono text-[10px] text-muted-foreground ml-0.5">
            ({totalStrings})
          </span>
        </button>
        <button
          onClick={() => onFilter("faulting")}
          className={cn(
            "flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-all",
            filter === "faulting"
              ? "bg-status-fault/10 shadow text-status-fault"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Filter className="w-3 h-3" />
          Faulting only
          {faultingStrings > 0 && (
            <span
              className={cn(
                "font-mono text-[10px] ml-0.5",
                filter === "faulting" ? "text-status-fault" : "text-muted-foreground",
              )}
            >
              ({faultingStrings})
            </span>
          )}
        </button>
      </div>

      {/* Sort toggle */}
      <div className="flex items-center gap-1 rounded-md border border-border p-0.5 bg-muted/50 ml-auto">
        <button
          onClick={() => onSort("default")}
          className={cn(
            "flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-all",
            sort === "default"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Default order
        </button>
        <button
          onClick={() => onSort("deviation")}
          className={cn(
            "flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-all",
            sort === "deviation"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ArrowDownUp className="w-3 h-3" />
          Worst first
        </button>
      </div>

      {/* Visible count hint when filter is active */}
      {filter === "faulting" && (
        <span className="text-[11px] text-muted-foreground w-full pt-0.5 border-t border-border/50 mt-0.5">
          Showing {visibleStrings} of {totalStrings} strings · {totalStrings - visibleStrings} healthy strings hidden
        </span>
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function CombinerStrings() {
  const { plantId, combinerId } = useParams<{
    plantId: string;
    combinerId: string;
  }>();

  const basePath = `/plants/${plantId}/combiners/${combinerId}/strings`;
  const { filter, sort, setFilter, setSort } = useFilterSort(basePath);

  const { data, isLoading, isError } = useCombinerStrings(
    plantId ?? "",
    combinerId ?? "",
  );

  // Apply filter + sort to each inverter group
  const visibleGroups = data
    ? applyFilterSort(data.inverterGroups, filter, sort)
    : [];

  const visibleStrings = visibleGroups.reduce((n, g) => n + g.strings.length, 0);

  // Map original string counts per inverter (for "N healthy hidden" label)
  const originalStringCount: Record<string, number> = {};
  if (data) {
    for (const g of data.inverterGroups) {
      originalStringCount[g.inverterId] = g.strings.length;
    }
  }

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

        {/* Toolbar (only shown when data is available) */}
        {data && (
          <Toolbar
            filter={filter}
            sort={sort}
            onFilter={setFilter}
            onSort={setSort}
            faultingStrings={data.faultingStrings}
            totalStrings={data.totalStrings}
            visibleStrings={visibleStrings}
          />
        )}

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

        {data && visibleGroups.length === 0 && filter === "faulting" && (
          <div className="rounded-lg border border-status-normal/30 bg-status-normal/10 text-status-normal p-8 text-center">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
            <p className="font-semibold">No faulting strings</p>
            <p className="text-sm mt-1 text-status-normal/70">
              All {data.totalStrings} strings in this combiner are operating nominally.
            </p>
          </div>
        )}

        {data && visibleGroups.length > 0 && (
          <div className="space-y-10">
            {visibleGroups.map((group) => (
              <InverterGroupSection
                key={group.inverterId}
                group={group}
                filter={filter}
                totalOriginalStrings={originalStringCount[group.inverterId] ?? group.strings.length}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
