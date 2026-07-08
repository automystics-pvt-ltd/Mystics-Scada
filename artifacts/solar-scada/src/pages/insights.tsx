import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Link } from "wouter";
import {
  Brain, AlertTriangle, Info, Zap, Wrench, X, ChevronDown, ChevronUp,
  TrendingDown, Thermometer, Activity, Wind, Filter,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  AreaChart, Area, XAxis, YAxis, ReferenceLine, Tooltip,
} from "recharts";

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
  const refColor = "hsl(var(--muted-foreground))";
  const tooltipStyle = {
    background: "hsl(var(--card))", border: "1px solid hsl(var(--card-border))",
    borderRadius: 6, fontSize: 10,
  };
  const axisStyle = { fontSize: 9, fill: "hsl(var(--muted-foreground))" };

  if (sparkline.type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={70}>
        <BarChart data={sparkline.points} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
          {sparkline.points[0]?.ref !== undefined && (
            <ReferenceLine y={sparkline.points[0].ref} stroke={refColor} strokeDasharray="3 2" strokeWidth={1} />
          )}
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} formatter={(v: number) => [`${v} ${sparkline.unit}`, sparkline.metric]} />
          <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} maxBarSize={12} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (sparkline.type === "area") {
    return (
      <ResponsiveContainer width="100%" height={70}>
        <AreaChart data={sparkline.points} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
          <defs>
            <linearGradient id={`ag-${severity}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toLocaleString()} ${sparkline.unit}`, sparkline.metric]} />
          {sparkline.points[0]?.ref !== undefined && (
            <Area type="monotone" dataKey="ref" stroke={refColor} strokeWidth={1} strokeDasharray="3 2" fill="none" dot={false} name="Expected" />
          )}
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#ag-${severity})`} dot={false} name="Actual" />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={70}>
      <LineChart data={sparkline.points} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} ${sparkline.unit}`, sparkline.metric]} />
        {sparkline.points[0]?.ref !== undefined && (
          <Line type="monotone" dataKey="ref" stroke={refColor} strokeWidth={1} strokeDasharray="3 2" dot={false} name="Threshold" />
        )}
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} name={sparkline.metric} />
      </LineChart>
    </ResponsiveContainer>
  );
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
  const { border } = SEV_CONFIG[insight.severity];
  const typeInfo = TYPE_CONFIG[insight.type];
  const TypeIcon = typeInfo?.Icon ?? Brain;

  return (
    <div className={`bg-card border border-card-border border-l-4 ${border} rounded-xl overflow-hidden`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={insight.severity} />
            <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded font-medium">
              {insight.plantName}
            </span>
            {insight.deviceName && (
              <span className="text-[10px] text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">
                {insight.deviceName}
              </span>
            )}
          </div>
          <button
            onClick={() => onDismiss(insight.id)}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-0.5"
            title="Dismiss insight"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-start gap-2">
          <TypeIcon className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
          <h3 className="text-sm font-semibold leading-snug">{insight.title}</h3>
        </div>
      </div>

      {/* Sparkline */}
      <div className="px-4 pb-1">
        <InsightSparklineChart sparkline={insight.sparkline} severity={insight.severity} />
        <div className="flex gap-3 mt-1 text-[9px] text-muted-foreground">
          <span>{insight.sparkline.metric} ({insight.sparkline.unit})</span>
          {insight.sparkline.points[0]?.ref !== undefined && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 border-t border-dashed border-muted-foreground" />
              Threshold / Expected
            </span>
          )}
        </div>
      </div>

      {/* Energy impact + confidence chips */}
      <div className="px-4 py-2 flex items-center gap-3 flex-wrap">
        {insight.energyImpactKwhPerDay > 0 && (
          <div className="flex items-center gap-1 text-xs text-status-warning bg-status-warning/10 px-2 py-1 rounded">
            <Zap className="w-3 h-3" />
            <span className="font-mono font-semibold">{insight.energyImpactKwhPerDay.toLocaleString()} kWh/day</span>
            <span className="text-muted-foreground">impact</span>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">{insight.confidencePct}%</span> confidence
        </div>
      </div>

      {/* Explanation (collapsible) */}
      <div className="px-4 pb-3">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-1"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "Hide details" : "Show details"}
        </button>

        {expanded && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground leading-relaxed">{insight.explanation}</p>
            <div className="bg-muted/30 border border-border/50 rounded-lg p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Recommended Action
              </div>
              <p className="text-xs text-foreground/80 leading-relaxed">{insight.recommendedAction}</p>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex items-center gap-2">
        <button
          onClick={() => onCreateWorkOrder(insight)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Wrench className="w-3 h-3" />
          Create Work Order
        </button>
        {insight.deviceId && (
          <Link href={`/plants/${insight.plantId}/inverters/${insight.deviceId}`}>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
              View Device →
            </button>
          </Link>
        )}
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
      <div className="flex flex-col space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Brain className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">AI Insights</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Rule-based anomaly detection across your fleet — {insights.length} active finding{insights.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {counts.critical > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-status-fault/15 text-status-fault border border-status-fault/30">
                {counts.critical} Critical
              </span>
            )}
            {counts.warning > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-status-warning/15 text-status-warning border border-status-warning/30">
                {counts.warning} Warning
              </span>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap bg-card border border-card-border rounded-xl px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
            <Filter className="w-3.5 h-3.5" />
            {activeFilters > 0 ? <span className="text-primary font-medium">{activeFilters} active</span> : "Filters"}
          </div>

          {/* Severity */}
          <div className="flex items-center gap-1">
            {(["all", "critical", "warning", "info"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  severityFilter === s
                    ? s === "all" ? "bg-primary text-primary-foreground"
                      : s === "critical" ? "bg-status-fault text-white"
                      : s === "warning" ? "bg-status-warning text-black"
                      : "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted"
                }`}
              >
                {s === "all" ? "All severity" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Plant */}
          {plantList.length > 1 && (
            <select
              value={plantFilter}
              onChange={e => setPlantFilter(e.target.value)}
              className="text-xs bg-muted/40 border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All plants</option>
              {plantList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {/* Type */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-xs bg-muted/40 border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All types</option>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          {activeFilters > 0 && (
            <button
              onClick={() => { setSeverityFilter("all"); setTypeFilter("all"); setPlantFilter("all"); }}
              className="text-[11px] text-muted-foreground hover:text-foreground ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Feed */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-card-border rounded-xl h-64 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Brain className="w-12 h-12 text-status-normal mb-4 opacity-60" />
            <h3 className="font-semibold text-lg">
              {insights.length === 0 ? "All systems nominal" : "No insights match your filters"}
            </h3>
            <p className="text-muted-foreground text-sm mt-1">
              {insights.length === 0
                ? "No anomalies detected across your fleet right now."
                : "Try adjusting the filters above."}
            </p>
            {activeFilters > 0 && (
              <button
                onClick={() => { setSeverityFilter("all"); setTypeFilter("all"); setPlantFilter("all"); }}
                className="mt-3 text-sm text-primary hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
