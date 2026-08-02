import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Link } from "wouter";
import {
  Brain, AlertTriangle, Info, Zap, Wrench, X, ChevronDown, ChevronUp,
  TrendingDown, Thermometer, Activity, Wind, Filter,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { MiniBarChart, MiniAreaChart, MiniLineChart } from "@/components/ui/svg-charts";

const BASE = import.meta.env.BASE_URL as string;

// ── Types ────────────────────────────────────────────────────────────────────

interface SparkPoint { label: string; value: number; ref?: number }
interface InsightSparkline { type: "line" | "bar" | "area"; metric: string; unit: string; points: SparkPoint[] }
interface Insight {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  plantId: string;
  plantName: string;
  deviceId?: string;
  deviceName?: string;
  title: string;
  explanation: string;
  recommendedAction: string;
  energyImpactKwhPerDay: number;
  confidencePct: number;
  sparkline: InsightSparkline;
  detectedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEV_CONFIG = {
  critical: { label: "Critical", color: "text-status-fault", bg: "bg-status-fault/10", border: "border-l-status-fault", dot: "bg-status-fault" },
  warning: { label: "Warning", color: "text-status-warning", bg: "bg-status-warning/10", border: "border-l-[hsl(38,92%,50%)]", dot: "bg-status-warning" },
  info: { label: "Info", color: "text-primary", bg: "bg-primary/10", border: "border-l-primary", dot: "bg-primary" },
} as const;

const TYPE_CONFIG: Record<string, { label: string; Icon: React.FC<{ className?: string }> }> = {
  underperforming_inverter: { label: "Underperformance", Icon: TrendingDown },
  string_deviation: { label: "String Deviation", Icon: Activity },
  irradiance_gap: { label: "Irradiance Gap", Icon: Wind },
  health_decline: { label: "Health Decline", Icon: AlertTriangle },
  temperature_trend: { label: "Temperature Rising", Icon: Thermometer },
};

function SeverityBadge({ severity }: { severity: Insight["severity"] }) {
  const { label, color, bg } = SEV_CONFIG[severity];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${color} ${bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${SEV_CONFIG[severity].dot}`} />
      {label}
    </span>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function InsightSparklineChart({ sparkline, severity }: { sparkline: InsightSparkline; severity: Insight["severity"] }) {
  const color = severity === "critical" ? "hsl(0 84% 60%)" : severity === "warning" ? "hsl(38 92% 50%)" : "hsl(221 83% 53%)";
  if (sparkline.type === "bar") {
    return <MiniBarChart points={sparkline.points} color={color} unit={sparkline.unit} metric={sparkline.metric} />;
  }
  if (sparkline.type === "area") {
    return <MiniAreaChart points={sparkline.points} color={color} unit={sparkline.unit} metric={sparkline.metric} />;
  }
  return <MiniLineChart points={sparkline.points} color={color} unit={sparkline.unit} metric={sparkline.metric} />;
}

// ── Insight Card ──────────────────────────────────────────────────────────────

function InsightCard({
  insight,
  onDismiss,
  onCreateWorkOrder,
}: {
  insight: Insight;
  onDismiss: (id: string) => void;
  onCreateWorkOrder: (insight: Insight) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = TYPE_CONFIG[insight.type];
  const TypeIcon = typeInfo?.Icon ?? Brain;
  const sevColor = insight.severity === "critical" ? "border-status-fault shadow-[0_0_15px_rgba(239,68,68,0.2)]" : insight.severity === "warning" ? "border-status-warning shadow-[0_0_15px_rgba(251,191,36,0.1)]" : "border-brand shadow-[0_0_15px_rgba(0,255,170,0.1)]";

  return (
    <div className={`border bg-card/60 relative overflow-hidden group ${sevColor}`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${insight.severity === "critical" ? "bg-status-fault" : insight.severity === "warning" ? "bg-status-warning" : "bg-brand"}`} />
      
      {/* Header */}
      <div className="p-4 border-b border-border/50 bg-card/40">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-mono text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 border ${insight.severity === "critical" ? "border-status-fault text-status-fault bg-status-fault/10" : insight.severity === "warning" ? "border-status-warning text-status-warning bg-status-warning/10" : "border-brand text-brand bg-brand/10"}`}>
              {insight.severity}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground bg-white/5 border border-border/50 px-2 py-0.5">
              {insight.plantName}
            </span>
            {insight.deviceName && (
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground bg-white/5 border border-border/50 px-2 py-0.5">
                {insight.deviceName}
              </span>
            )}
          </div>
          <button
            onClick={() => onDismiss(insight.id)}
            className="text-muted-foreground hover:text-brand transition-colors p-1"
            title="DISMISS ANOMALY"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 border flex items-center justify-center flex-shrink-0 ${insight.severity === "critical" ? "border-status-fault/50 text-status-fault bg-card" : insight.severity === "warning" ? "border-status-warning/50 text-status-warning bg-card" : "border-brand/50 text-brand bg-card"}`}>
            <TypeIcon className="w-4 h-4" />
          </div>
          <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-foreground leading-snug mt-1">{insight.title}</h3>
        </div>
      </div>

      {/* Sparkline */}
      <div className="p-4 pb-2">
        <InsightSparklineChart sparkline={insight.sparkline} severity={insight.severity} />
        <div className="flex gap-4 mt-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          <span>VECTOR: {insight.sparkline.metric} ({insight.sparkline.unit})</span>
          {insight.sparkline.points[0]?.ref !== undefined && (
            <span className="flex items-center gap-2">
              <span className="inline-block w-4 border-t border-dashed border-muted-foreground" />
              BASELINE THRESHOLD
            </span>
          )}
        </div>
      </div>

      {/* Energy impact + confidence chips */}
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
        {insight.energyImpactKwhPerDay > 0 && (
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest font-bold text-status-warning bg-status-warning/10 border border-status-warning/30 px-2 py-1">
            <Zap className="w-3 h-3" />
            <span>{insight.energyImpactKwhPerDay.toLocaleString()} KWH/DAY DELTA</span>
          </div>
        )}
        <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground border border-border/50 px-2 py-1 bg-card/40">
          <span className="font-bold text-foreground">{insight.confidencePct}%</span> CONFIDENCE INDEX
        </div>
      </div>

      {/* Explanation (collapsible) */}
      <div className="px-4 pb-4">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest font-bold text-muted-foreground hover:text-brand transition-colors mb-3"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "COLLAPSE TELEMETRY" : "EXPAND TELEMETRY"}
        </button>

        {expanded && (
          <div className="space-y-4 mb-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground leading-relaxed border-l border-border/50 pl-3">
              {insight.explanation}
            </p>
            <div className="border border-brand/30 bg-brand/5 p-3 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-brand/50" />
              <div className="font-mono text-[9px] uppercase tracking-widest font-bold text-brand mb-1 flex items-center gap-2">
                <Wrench className="w-3 h-3" /> RECOMMENDED PROTOCOL
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-foreground/90 leading-relaxed">
                {insight.recommendedAction}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-3 border-t border-border/50">
          <button
            onClick={() => onCreateWorkOrder(insight)}
            className="flex-1 font-mono text-[9px] uppercase tracking-widest font-bold border border-brand bg-brand/10 text-brand hover:bg-brand/20 px-3 py-2 flex items-center justify-center gap-2 transition-colors shadow-[0_0_10px_rgba(0,255,170,0.1)]"
          >
            <Wrench className="w-3 h-3" />
            INITIATE WORK ORDER
          </button>
          {insight.deviceId && (
            <Link href={`/plants/${insight.plantId}/inverters/${insight.deviceId}`}>
              <button className="flex-1 font-mono text-[9px] uppercase tracking-widest font-bold border border-border/50 bg-card/40 text-muted-foreground hover:text-foreground hover:border-brand/50 px-3 py-2 transition-colors text-center">
                INSPECT DEVICE →
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning" | "info">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [plantFilter, setPlantFilter] = useState<string>("all");

  const queryClient = useQueryClient();

  const { data: insights = [], isLoading } = useQuery<Insight[]>({
    queryKey: ["insights"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/insights`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to load insights (${r.status})`);
      return r.json() as Promise<Insight[]>;
    },
    refetchInterval: 60_000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${BASE}api/org/insights/${encodeURIComponent(id)}/dismiss`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error("Failed to dismiss insight");
      return r.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["insights"] });
      const prev = queryClient.getQueryData<Insight[]>(["insights"]);
      queryClient.setQueryData<Insight[]>(["insights"], old => (old ?? []).filter(i => i.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["insights"], ctx.prev);
      toast({ title: "Could not dismiss insight", variant: "destructive" });
    },
  });

  const workOrderMutation = useMutation({
    mutationFn: async (insight: Insight) => {
      const r = await fetch(`${BASE}api/org/insights/${encodeURIComponent(insight.id)}/work-order`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantId: insight.plantId,
          plantName: insight.plantName,
          deviceName: insight.deviceName,
          title: insight.title,
          explanation: insight.explanation,
          recommendedAction: insight.recommendedAction,
          severity: insight.severity,
        }),
      });
      if (!r.ok) throw new Error("Failed to create work order");
      return r.json();
    },
    onSuccess: () => {
      toast({
        title: "Work order created",
        description: "Find it in the Maintenance board.",
      });
    },
    onError: () => {
      toast({ title: "Could not create work order", variant: "destructive" });
    },
  });

  // Derived plant list for filter
  const plantList = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of insights) seen.set(i.plantId, i.plantName);
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [insights]);

  const filtered = useMemo(() => {
    return insights.filter(i => {
      if (severityFilter !== "all" && i.severity !== severityFilter) return false;
      if (typeFilter !== "all" && i.type !== typeFilter) return false;
      if (plantFilter !== "all" && i.plantId !== plantFilter) return false;
      return true;
    });
  }, [insights, severityFilter, typeFilter, plantFilter]);

  const counts = useMemo(() => ({
    critical: insights.filter(i => i.severity === "critical").length,
    warning: insights.filter(i => i.severity === "warning").length,
    info: insights.filter(i => i.severity === "info").length,
  }), [insights]);

  const activeFilters = [severityFilter !== "all", typeFilter !== "all", plantFilter !== "all"].filter(Boolean).length;

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">

        {/* Header */}
        <div className="border border-border/50 bg-card/40 p-5 relative flex-shrink-0">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
          <h1 className="text-xl font-mono font-bold uppercase tracking-widest text-foreground flex items-center gap-3">
            <Brain className="w-5 h-5 text-brand" />
            AI DIAGNOSTICS & INSIGHTS
          </h1>
          <div className="flex items-center justify-between mt-2 ml-8">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              ANOMALY DETECTION // {insights.length} ACTIVE FINDING{insights.length !== 1 ? "S" : ""}
            </p>
            <div className="flex items-center gap-2">
              {counts.critical > 0 && (
                <span className="font-mono text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 border border-status-fault text-status-fault bg-status-fault/10 shadow-[0_0_10px_rgba(239,68,68,0.3)] animate-pulse">
                  {counts.critical} CRITICAL
                </span>
              )}
              {counts.warning > 0 && (
                <span className="font-mono text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 border border-status-warning text-status-warning bg-status-warning/10 shadow-[0_0_10px_rgba(251,191,36,0.3)]">
                  {counts.warning} WARNING
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="border border-border/50 bg-card/60 p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground border-r border-border/50 pr-3">
            <Filter className="w-3.5 h-3.5" />
            {activeFilters > 0 ? <span className="text-brand font-bold">{activeFilters} ACTIVE</span> : "FILTERS"}
          </div>

          {/* Severity */}
          <div className="flex items-center gap-1 border-r border-border/50 pr-3">
            {(["all", "critical", "warning", "info"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`font-mono text-[9px] uppercase tracking-widest px-3 py-1.5 transition-colors border ${
                  severityFilter === s
                    ? s === "all" ? "bg-brand/20 text-brand border-brand shadow-[0_0_5px_rgba(0,255,170,0.3)]"
                      : s === "critical" ? "bg-status-fault/20 text-status-fault border-status-fault shadow-[0_0_5px_rgba(239,68,68,0.3)]"
                      : s === "warning" ? "bg-status-warning/20 text-status-warning border-status-warning shadow-[0_0_5px_rgba(251,191,36,0.3)]"
                      : "bg-primary/20 text-primary border-primary"
                    : "bg-card/40 text-muted-foreground border-border/50 hover:border-brand/50 hover:text-brand"
                }`}
              >
                {s === "all" ? "ALL SEVERITY" : s}
              </button>
            ))}
          </div>

          {/* Plant */}
          {plantList.length > 1 && (
            <select
              value={plantFilter}
              onChange={e => setPlantFilter(e.target.value)}
              className="font-mono text-[9px] uppercase tracking-widest bg-card/40 border border-border/50 px-2 py-1.5 text-foreground focus:border-brand/50 focus:outline-none focus:ring-0"
            >
              <option value="all">ALL ZONES</option>
              {plantList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {/* Type */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="font-mono text-[9px] uppercase tracking-widest bg-card/40 border border-border/50 px-2 py-1.5 text-foreground focus:border-brand/50 focus:outline-none focus:ring-0"
          >
            <option value="all">ALL TYPES</option>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          {activeFilters > 0 && (
            <button
              onClick={() => { setSeverityFilter("all"); setTypeFilter("all"); setPlantFilter("all"); }}
              className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-brand ml-auto"
            >
              CLEAR FILTERS
            </button>
          )}
        </div>

        {/* Feed */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border border-border/50 bg-card/60 h-64 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border border-border/50 bg-card/40 text-center">
            <Brain className="w-12 h-12 text-status-normal mb-4 shadow-[0_0_15px_rgba(34,197,94,0.3)] animate-pulse" />
            <h3 className="font-mono text-sm uppercase tracking-widest font-bold text-status-normal">
              {insights.length === 0 ? "SYSTEMS NOMINAL // NO ANOMALIES" : "NO INSIGHTS MATCH PARAMETERS"}
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
              {insights.length === 0
                ? "DIAGNOSTIC ENGINE DETECTS NO DEVIATIONS ACROSS THE FLEET."
                : "ADJUST FILTERS TO BROADEN SEARCH SPACE."}
            </p>
            {activeFilters > 0 && (
              <button
                onClick={() => { setSeverityFilter("all"); setTypeFilter("all"); setPlantFilter("all"); }}
                className="mt-4 font-mono text-[10px] uppercase tracking-widest text-brand hover:text-brand/80"
              >
                RESET FILTERS
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.map(insight => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onDismiss={(id) => dismissMutation.mutate(id)}
                onCreateWorkOrder={(i) => workOrderMutation.mutate(i)}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
