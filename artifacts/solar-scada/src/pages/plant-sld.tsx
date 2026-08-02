import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  BaseEdge,
  Handle,
  getSmoothStepPath,
  type Node,
  type Edge,
  type EdgeProps,
  type NodeProps,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useGetPlantSld, getGetPlantSldQueryKey, SldNode as SldNodeData, HealthState, useListInverters } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import { Network, Box, Server, Factory, Zap, Cpu, Lock, Unlock, Maximize2, AlertTriangle, Zap as ZapIcon, X, TriangleAlert, ShieldAlert, FlaskConical } from "lucide-react";
import { cn } from "@/components/ui/scada";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQueryClient } from "@tanstack/react-query";

const TYPE_ICONS: Record<string, any> = {
  panel_array: Box,
  string: Box,
  combiner: Server,
  inverter: Cpu,
  transformer: Factory,
  switchyard: Zap,
  grid: Network,
};

const TYPE_LEVEL: Record<string, number> = {
  grid: 0,
  switchyard: 1,
  transformer: 2,
  inverter: 3,
  combiner: 4,
  panel_array: 5,
  string: 6,
};

const LEVEL_HEIGHT = 160;
const COLUMN_WIDTH = 210;
const NODE_WIDTH = 180;

const STATUS_COLOR: Record<HealthState, string> = {
  normal: "border-status-normal shadow-[0_0_10px_rgba(34,197,94,0.35)]",
  warning: "border-status-warning shadow-[0_0_10px_rgba(245,158,11,0.35)]",
  fault: "border-status-fault shadow-[0_0_10px_rgba(239,68,68,0.4)]",
  offline: "border-status-offline border-dashed opacity-70",
};

const STATUS_DOT: Record<HealthState, string> = {
  normal: "bg-status-normal",
  warning: "bg-status-warning",
  fault: "bg-status-fault animate-pulse",
  offline: "bg-status-offline",
};

type SldNodeDatum = SldNodeData & {
  plantId: string;
  /** Server sets true when this node's fault status was caused by fault injection, not a real device fault. */
  simulated?: boolean;
};

// ReactFlow requires data to satisfy Record<string,unknown>. We receive the
// payload as that generic and immediately cast to our typed shape.
function SldFlowNode({ data }: NodeProps<Node<Record<string, unknown>>>) {
  const node = data as unknown as SldNodeDatum;
  const Icon = TYPE_ICONS[node.type] || Box;
  const hasBreaker = node.breakerState !== undefined && node.breakerState !== null;

  const content = (
    <div
      className={cn(
        "bg-card/80 backdrop-blur-md w-[180px] border rounded-none p-3 flex flex-col items-center text-center relative transition-all cursor-pointer hover:bg-brand/10 hover:border-brand",
        STATUS_COLOR[node.status],
      )}
    >
      <Handle type="target" position={Position.Bottom} className="!opacity-0" />
      <Handle type="source" position={Position.Top} className="!opacity-0" />
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className={cn("w-1.5 h-1.5", STATUS_DOT[node.status])} />
      </div>
      <span className="font-mono uppercase tracking-widest text-[11px] font-bold truncate w-full text-foreground/90">{node.label}</span>

      <div className="mt-2 w-full border-t border-border/50 pt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
        {node.powerKw !== undefined && node.powerKw !== null && (
          <div className="flex flex-col items-start">
            <span className="text-muted-foreground font-mono uppercase tracking-widest text-[8px]">PWR</span>
            <span className="font-mono text-brand font-bold">{node.powerKw.toFixed(0)}kW</span>
          </div>
        )}
        {node.voltageV !== undefined && node.voltageV !== null && (
          <div className="flex flex-col items-start">
            <span className="text-muted-foreground font-mono uppercase tracking-widest text-[8px]">VLT</span>
            <span className="font-mono text-brand/80">
              {node.voltageV >= 1000 ? `${(node.voltageV / 1000).toFixed(1)}kV` : `${node.voltageV.toFixed(0)}V`}
            </span>
          </div>
        )}
        {node.currentA !== undefined && node.currentA !== null && (
          <div className="flex flex-col items-start">
            <span className="text-muted-foreground font-mono uppercase tracking-widest text-[8px]">CUR</span>
            <span className="font-mono text-brand/80">{node.currentA.toFixed(0)}A</span>
          </div>
        )}
      </div>

      {hasBreaker && (
        <div
          className={cn(
            "mt-2 w-full flex items-center justify-center gap-1 border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest",
            node.breakerState === "closed"
              ? "text-status-normal border-status-normal/30 bg-status-normal/10"
              : "text-status-fault border-status-fault/30 bg-status-fault/10",
          )}
        >
          {node.breakerState === "closed" ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          {node.breakerState === "closed" ? "BRK:CLOSED" : "BRK:OPEN"}
        </div>
      )}

      {node.type === "combiner" && node.stringFaultCount != null && node.stringFaultCount > 0 && (
        <div className="mt-2 w-full flex items-center justify-center gap-1 border border-status-warning/40 bg-status-warning/10 text-status-warning px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {node.stringFaultCount} STR FLT
        </div>
      )}

      {node.type === "combiner" && node.stringFaultCount != null && node.stringFaultCount === 0 && (
        <div className="mt-2 w-full flex items-center justify-center gap-1 border border-status-normal/30 bg-status-normal/10 text-status-normal px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest">
          STR:NOMINAL
        </div>
      )}

      {/* Inverters offline or irradiance too low — deviation math is unreliable */}
      {node.type === "combiner" && node.stringFaultCount == null && (
        <div className="mt-2 w-full flex items-center justify-center gap-1 border border-border/50 bg-card/40 text-muted-foreground px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest">
          NO DATA
        </div>
      )}

      {/* SIM badge — top-left — shown when this fault was injected by the operator */}
      {node.simulated && (
        <div className="absolute -top-2 -left-2 flex items-center gap-0.5 px-1.5 py-0.5 border border-status-warning/50 bg-status-warning text-black text-[9px] font-mono uppercase tracking-widest font-bold z-10 shadow-[0_0_10px_rgba(251,191,36,0.5)]">
          <FlaskConical className="w-2.5 h-2.5" />
          SIM
        </div>
      )}

      <div className="absolute -top-1.5 -right-1.5">
        {node.status === "fault" && <div className="w-3 h-3 bg-status-fault animate-ping absolute" />}
        {node.status === "fault" && <div className="w-3 h-3 bg-status-fault" />}
      </div>
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>{content}</PopoverTrigger>
      <PopoverContent side="right" className="w-64 rounded-none border border-brand/50 bg-card/90 backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,255,170,0.05)] p-0">
        <SldNodeDetail node={node} />
      </PopoverContent>
    </Popover>
  );
}

function SldNodeDetail({ node }: { node: SldNodeDatum }) {
  return (
    <div className="flex flex-col">
      <div className="p-3 border-b border-border/50 flex items-start justify-between bg-brand/5">
        <div>
          <div className="font-mono text-sm font-bold uppercase tracking-widest text-foreground">{node.label}</div>
          <div className="text-[10px] uppercase tracking-widest text-brand font-mono mt-1">{node.type.replace("_", " ")}</div>
        </div>
        <span className={cn("px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest font-bold border", 
          node.status === "normal" ? "border-status-normal/50 bg-status-normal/10 text-status-normal" :
          node.status === "warning" ? "border-status-warning/50 bg-status-warning/10 text-status-warning" :
          node.status === "offline" ? "border-status-offline/50 bg-status-offline/10 text-status-offline" :
          "border-status-fault/50 bg-status-fault/10 text-status-fault"
        )}>
          {node.status}
        </span>
      </div>
      
      <div className="p-3 grid grid-cols-2 gap-4 text-xs">
        {node.powerKw !== undefined && node.powerKw !== null && (
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Power Vector</div>
            <div className="font-mono text-brand text-sm">{node.powerKw.toFixed(1)} kW</div>
          </div>
        )}
        {node.voltageV !== undefined && node.voltageV !== null && (
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Voltage</div>
            <div className="font-mono text-foreground text-sm">
              {node.voltageV >= 1000 ? `${(node.voltageV / 1000).toFixed(2)} kV` : `${node.voltageV.toFixed(0)} V`}
            </div>
          </div>
        )}
        {node.currentA !== undefined && node.currentA !== null && (
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Current</div>
            <div className="font-mono text-foreground text-sm">{node.currentA.toFixed(1)} A</div>
          </div>
        )}
        {node.breakerState && (
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Breaker Status</div>
            <div className={cn("font-mono text-xs uppercase tracking-widest", node.breakerState === "closed" ? "text-status-normal" : "text-status-fault")}>
              {node.breakerState}
            </div>
          </div>
        )}
      </div>

      <div className="px-3 pb-3 space-y-2">
        {node.type === "combiner" && node.stringFaultCount != null && node.stringFaultCount > 0 && (
          <div className="flex items-center gap-2 border border-status-warning/40 bg-status-warning/10 text-status-warning px-2 py-1.5 text-[10px] font-mono uppercase tracking-widest">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {node.stringFaultCount} STRING{node.stringFaultCount !== 1 ? "S" : ""} FAULTED
          </div>
        )}
        {node.type === "combiner" && node.stringFaultCount != null && node.stringFaultCount === 0 && (
          <div className="flex items-center gap-2 border border-status-normal/30 bg-status-normal/10 text-status-normal px-2 py-1.5 text-[10px] font-mono uppercase tracking-widest">
            ALL STRINGS NOMINAL
          </div>
        )}
        {node.type === "combiner" && node.stringFaultCount == null && (
          <div className="flex items-center gap-2 border border-border/50 bg-card/40 text-muted-foreground px-2 py-1.5 text-[10px] font-mono uppercase tracking-widest">
            READINGS UNAVAILABLE
          </div>
        )}
        {node.simulated && (
          <div className="flex items-center gap-2 border border-status-warning/40 bg-status-warning/10 text-status-warning px-2 py-1.5 text-[10px] font-mono uppercase tracking-widest">
            <FlaskConical className="w-3 h-3 shrink-0" />
            SIMULATED FAULT (DRILL)
          </div>
        )}
        
        {node.detailPath && (
          <Link href={node.detailPath} className="block mt-2 text-[10px] font-mono uppercase tracking-widest text-brand hover:text-brand/80 transition-colors bg-brand/10 border border-brand/20 text-center py-2 hover:bg-brand/20">
            {node.type === "combiner" ? "ACCESS DIAGNOSTICS →" : "ACCESS EQUIPMENT →"}
          </Link>
        )}
      </div>
    </div>
  );
}

function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8 });
  const energized = (data as any)?.energized as boolean;
  const ratio = Math.max(0, Math.min(1, (data as any)?.ratio ?? 0));
  const strokeWidth = 1.5 + ratio * 3.5;
  // Faster dash animation for higher power flow.
  const duration = 2.4 - ratio * 1.9;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: energized ? "hsl(var(--primary) / 0.25)" : "hsl(var(--muted-foreground) / 0.2)",
          strokeWidth,
        }}
      />
      {energized && (
        <path
          d={path}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={Math.max(1.5, strokeWidth - 1)}
          strokeDasharray="6 8"
          className="sld-flow-dash"
          style={{ animationDuration: `${duration}s` }}
        />
      )}
    </>
  );
}

// ---- Fault Simulator -------------------------------------------------------

interface ActiveFaultEntry {
  key: string;
  label: string;
  target: { kind: "plant" } | { kind: "inverter"; inverterId: string };
  expiresAt: string;
  remainingMs: number;
}

const DURATIONS = [
  { label: "30 s", value: 30 },
  { label: "1 min", value: 60 },
  { label: "2 min", value: 120 },
];

function useActiveFaults(plantId: string, enabled: boolean) {
  const [faults, setFaults] = useState<ActiveFaultEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/plants/${plantId}/fault-inject`);
      if (res.ok) {
        const data = await res.json();
        setFaults(data.faults ?? []);
      }
    } catch {}
  }, [plantId]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    timerRef.current = setInterval(refresh, 2000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, refresh]);

  return { faults, refresh };
}

function FaultCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now())
  );
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 500);
    return () => clearInterval(id);
  }, [expiresAt]);

  const secs = Math.ceil(remaining / 1000);
  return (
    <span className={cn("font-mono tabular-nums", secs <= 10 ? "text-status-fault" : "text-status-warning")}>
      {secs}s
    </span>
  );
}

function FaultSimulatorPanel({
  plantId,
  inverterCount,
}: {
  plantId: string;
  inverterCount: number;
}) {
  const queryClient = useQueryClient();
  const sldQueryKey = getGetPlantSldQueryKey(plantId);

  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<"plant" | string>("plant");
  const [duration, setDuration] = useState(30);
  const [injecting, setInjecting] = useState(false);

  const { faults, refresh } = useActiveFaults(plantId, open);
  const hasFaults = faults.length > 0;

  const invalidateSld = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: sldQueryKey });
  }, [queryClient, sldQueryKey]);

  const inject = useCallback(async () => {
    setInjecting(true);
    try {
      const body =
        target === "plant"
          ? { target: "plant", durationSeconds: duration }
          : { target: "inverter", inverterId: target, durationSeconds: duration };
      await fetch(`/api/plants/${plantId}/fault-inject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await refresh();
      invalidateSld();
    } finally {
      setInjecting(false);
    }
  }, [plantId, target, duration, refresh, invalidateSld]);

  const clearAll = useCallback(async () => {
    await fetch(`/api/plants/${plantId}/fault-inject`, { method: "DELETE" });
    await refresh();
    invalidateSld();
  }, [plantId, refresh, invalidateSld]);

  const clearOne = useCallback(async (key: string) => {
    // key = "<plantId>:<suffix>"; route only accepts the suffix segment
    const suffix = key.split(":").slice(1).join(":");
    await fetch(`/api/plants/${plantId}/fault-inject/by/${encodeURIComponent(suffix)}`, {
      method: "DELETE",
    });
    await refresh();
    invalidateSld();
  }, [plantId, refresh, invalidateSld]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all",
          hasFaults
            ? "border-status-warning/50 bg-status-warning/10 text-status-warning shadow-[0_0_10px_rgba(251,191,36,0.3)] hover:bg-status-warning/20"
            : "border-border/50 bg-card/40 text-foreground hover:bg-brand/10 hover:border-brand/50 hover:text-brand",
        )}
      >
        <ShieldAlert className="w-3.5 h-3.5" />
        DRILL SIMULATOR
        {hasFaults && (
          <span className="ml-1 bg-status-warning text-black px-1.5 py-0.5 leading-none font-bold animate-pulse">
            {faults.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-none border border-brand/50 bg-card/90 backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,255,170,0.05)] p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <TriangleAlert className="w-4 h-4 text-status-warning" />
              <span className="font-mono text-sm uppercase tracking-widest text-foreground">DRILL SIMULATOR</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-brand transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground leading-relaxed">
            INJECT A TRANSIENT FAULT TO OBSERVE LIVE TOPOLOGY REACTIONS: BREAKER TRIPS, DE-ENERGIZED VECTORS, AND ALARM PROPAGATION.
          </p>

          {/* Target selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-brand uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-brand inline-block" /> FAULT VECTOR
            </label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full bg-card/40 border border-border/50 rounded-none px-3 py-2 text-xs font-mono uppercase tracking-widest text-foreground focus:outline-none focus:border-brand/50"
            >
              <option value="plant">⚡ FULL ZONE DISCONNECT</option>
              {Array.from({ length: inverterCount }, (_, i) => {
                const invId = `${plantId}-inv-${i}`;
                return (
                  <option key={invId} value={invId}>
                    INVERTER {String(i + 1).padStart(2, '0')} FAULT
                  </option>
                );
              })}
            </select>
          </div>

          {/* Duration selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-brand uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-brand inline-block" /> DURATION
            </label>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={cn(
                    "flex-1 border px-2 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-all",
                    duration === d.value
                      ? "border-brand bg-brand/20 text-brand shadow-[0_0_10px_rgba(0,255,170,0.3)]"
                      : "border-border/50 bg-card/40 text-foreground/70 hover:border-brand/50 hover:text-foreground",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Inject button */}
          <button
            onClick={inject}
            disabled={injecting}
            className="w-full flex items-center justify-center gap-2 border border-status-warning/50 bg-status-warning/10 text-status-warning hover:bg-status-warning/20 transition-all px-3 py-2.5 text-xs font-mono uppercase tracking-widest font-bold disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-status-warning/50 group-hover:bg-status-warning transition-colors" />
            <ZapIcon className="w-4 h-4" />
            {injecting ? "INJECTING..." : "EXECUTE DRILL"}
          </button>

          {/* Active faults list */}
          {faults.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-status-warning uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-status-warning animate-pulse inline-block" /> ACTIVE DRILLS
                </span>
                <button
                  onClick={clearAll}
                  className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-brand transition-colors border-b border-dashed border-muted-foreground/50 hover:border-brand/50"
                >
                  ABORT ALL
                </button>
              </div>
              <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1 custom-scrollbar">
                {faults.map((f) => (
                  <div
                    key={f.key}
                    className="flex items-center justify-between border border-status-warning/30 bg-status-warning/5 px-3 py-2 relative"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-status-warning/50" />
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono uppercase tracking-widest truncate text-status-warning">{f.label}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <div className="text-[10px] text-status-warning/80">
                        <FaultCountdown expiresAt={f.expiresAt} />
                      </div>
                      <button
                        onClick={() => clearOne(f.key)}
                        className="text-muted-foreground hover:text-status-warning transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {faults.length === 0 && (
            <div className="pt-3 border-t border-border/50 text-center">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">NO ACTIVE DRILLS</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main page -------------------------------------------------------------

const nodeTypes = { sld: SldFlowNode };
const edgeTypes = { flow: FlowEdge };

export default function PlantSld() {
  const { plantId } = useParams();

  const { data: sld, isLoading } = useGetPlantSld(plantId || "", {
    query: {
      enabled: !!plantId,
      refetchInterval: 5000,
      queryKey: getGetPlantSldQueryKey(plantId || ""),
    },
  });

  // Load inverter count for fault simulator target list
  const { data: inverterList } = useListInverters(plantId || "", {
    query: { queryKey: ["inverters", plantId], enabled: !!plantId },
  });

  const [fullscreen, setFullscreen] = useState(false);

  /** True when at least one SLD node carries a simulated fault status. */
  const hasSimulatedNodes = useMemo(() => {
    if (!sld) return false;
    return (sld.nodes as Array<{ simulated?: boolean }>).some((n) => n.simulated === true);
  }, [sld]);

  const { nodes, edges } = useMemo(() => {
    if (!sld) return { nodes: [] as Node[], edges: [] as Edge[] };

    // Group nodes by their hierarchy level for layout, then position each
    // node's column based on the average column of the nodes it feeds, so
    // upstream equipment sits centered above the cluster it serves. Inverters
    // are the widest layer and seed sequential columns (grouped by combiner
    // so each combiner's cluster stays contiguous); every other layer's
    // column is derived from its neighbors' columns.
    const inverters = sld.nodes
      .filter((n) => n.type === "inverter")
      .slice()
      .sort((a, b) => (a.parentId ?? "").localeCompare(b.parentId ?? "") || a.id.localeCompare(b.id));

    const colByNodeId = new Map<string, number>();
    inverters.forEach((n, i) => colByNodeId.set(n.id, i));

    const avgColOf = (ids: string[]): number | null => {
      const cols = ids.map((id) => colByNodeId.get(id)).filter((c): c is number => c !== undefined);
      if (cols.length === 0) return null;
      return cols.reduce((sum, c) => sum + c, 0) / cols.length;
    };

    // Some layers (e.g. a combiner sized for headroom that has no inverters
    // assigned yet) can have zero children. Spread those evenly across the
    // available columns by sibling index rather than collapsing them to 0,
    // which would otherwise overlap every empty-child node on top of node 0.
    const fallbackCol = (index: number, siblingCount: number, totalCols: number): number =>
      siblingCount > 1 ? (index / (siblingCount - 1)) * Math.max(0, totalCols - 1) : totalCols / 2;

    const combinerNodes = sld.nodes.filter((n) => n.type === "combiner");
    combinerNodes.forEach((n, idx) => {
      const children = sld.nodes.filter((c) => c.type === "inverter" && c.parentId === n.id).map((c) => c.id);
      colByNodeId.set(n.id, avgColOf(children) ?? fallbackCol(idx, combinerNodes.length, inverters.length));
    });

    const arrayNodes = sld.nodes.filter((n) => n.type === "panel_array");
    arrayNodes.forEach((n, idx) => {
      const children = sld.nodes.filter((c) => c.type === "combiner" && c.parentId === n.id).map((c) => c.id);
      colByNodeId.set(n.id, avgColOf(children) ?? fallbackCol(idx, arrayNodes.length, inverters.length));
    });
    for (const n of sld.nodes) {
      if (n.type === "transformer") {
        colByNodeId.set(n.id, avgColOf(inverters.map((i) => i.id)) ?? inverters.length / 2);
      }
    }
    for (const n of sld.nodes) {
      if (n.type === "switchyard" && n.parentId) {
        colByNodeId.set(n.id, colByNodeId.get(n.parentId) ?? avgColOf(inverters.map((i) => i.id)) ?? inverters.length / 2);
      }
      if (n.type === "grid" && n.parentId) {
        colByNodeId.set(n.id, colByNodeId.get(n.parentId) ?? avgColOf(inverters.map((i) => i.id)) ?? inverters.length / 2);
      }
    }

    const totalColumns = Math.max(1, inverters.length);
    const flowNodes: Node[] = sld.nodes.map((n) => {
      const level = TYPE_LEVEL[n.type] ?? 3;
      const col = colByNodeId.get(n.id) ?? 0;
      return {
        id: n.id,
        type: "sld",
        position: {
          x: col * COLUMN_WIDTH - (totalColumns * COLUMN_WIDTH) / 2 + NODE_WIDTH / 2,
          y: level * LEVEL_HEIGHT,
        },
        data: { ...n, plantId } as unknown as Record<string, unknown>,
        sourcePosition: Position.Top,
        targetPosition: Position.Bottom,
        draggable: false,
      };
    });

    const maxEdgePower = Math.max(1, ...sld.edges.map((e) => e.powerKw));
    const flowEdges: Edge[] = sld.edges.map((e) => ({
      id: e.id,
      source: e.fromId,
      target: e.toId,
      type: "flow",
      data: { energized: e.energized, ratio: e.powerKw / maxEdgePower },
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [sld, plantId]);

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-100px)] space-y-6">
        <div className="border border-border/50 bg-card/40 p-5 relative flex-shrink-0">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
          
          <div className="flex items-center mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Link href="/" className="hover:text-brand transition-colors">Portfolio</Link>
            <span className="mx-2 text-border/50">/</span>
            <Link href={`/plants/${plantId}`} className="hover:text-brand transition-colors">Zone Overview</Link>
            <span className="mx-2 text-border/50">/</span>
            <span className="text-foreground">Topology Matrix</span>
          </div>

          <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
            <div>
              <h1 className="text-xl font-mono uppercase tracking-widest text-foreground flex items-center gap-3">
                <Network className="w-5 h-5 text-brand" />
                Live Topology Matrix
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">
                REAL-TIME SINGLE LINE DIAGRAM / HARDWARE CONNECTIVITY GRAPH
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-brand border border-brand/20 bg-brand/5 px-2 py-1 hidden md:block">
                T-MINUS 00:00:00 (LIVE)
              </div>
              {plantId && (
                <FaultSimulatorPanel
                  plantId={plantId}
                  inverterCount={inverterList?.length ?? 0}
                />
              )}
              <button
                onClick={() => setFullscreen((v) => !v)}
                className="inline-flex items-center gap-2 border border-border/50 bg-card/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-foreground hover:bg-brand/10 hover:text-brand hover:border-brand/50 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                {fullscreen ? "CONTRACT" : "EXPAND"}
              </button>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex-1 bg-card/60 rounded-none border border-border/50 overflow-hidden relative shadow-[inset_0_0_50px_rgba(0,0,0,0.8)]",
            fullscreen && "fixed inset-4 z-50 min-h-0 bg-background border-brand/50",
          )}
        >
          {/* SIMULATION ACTIVE banner — displayed when any SLD node carries an operator-injected fault */}
          {hasSimulatedNodes && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 border border-status-warning bg-status-warning/10 text-status-warning text-[10px] font-mono uppercase tracking-widest whitespace-nowrap pointer-events-none shadow-[0_0_15px_rgba(251,191,36,0.2)]">
              <FlaskConical className="w-3.5 h-3.5 shrink-0" />
              SIMULATION ACTIVE // FAULTS SHOWN ARE OPERATOR-INJECTED DRILLS
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-4 text-brand">
                <Network className="w-8 h-8 animate-pulse" />
                <span className="font-mono text-[10px] uppercase tracking-widest">INITIALIZING GRAPH...</span>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={true}
              proOptions={{ hideAttribution: true }}
              colorMode="dark"
            >
              <Background color="rgba(255,255,255,0.05)" gap={24} />
              <Controls showInteractive={false} className="border-border/50 bg-card/60 fill-foreground" />
            </ReactFlow>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
