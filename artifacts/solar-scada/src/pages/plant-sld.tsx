import { useMemo, useState } from "react";
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
import { useGetPlantSld, getGetPlantSldQueryKey, SldNode as SldNodeData, HealthState } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import { Network, Box, Server, Factory, Zap, Cpu, Lock, Unlock, Maximize2, AlertTriangle } from "lucide-react";
import { cn } from "@/components/ui/scada";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

type SldNodeDatum = SldNodeData & { plantId: string };

// ReactFlow requires data to satisfy Record<string,unknown>. We receive the
// payload as that generic and immediately cast to our typed shape.
function SldFlowNode({ data }: NodeProps<Node<Record<string, unknown>>>) {
  const node = data as unknown as SldNodeDatum;
  const Icon = TYPE_ICONS[node.type] || Box;
  const hasBreaker = node.breakerState !== undefined && node.breakerState !== null;

  const content = (
    <div
      className={cn(
        "bg-card w-[180px] border-2 rounded-lg p-3 flex flex-col items-center text-center relative transition-colors cursor-pointer hover:bg-muted/20",
        STATUS_COLOR[node.status],
      )}
    >
      <Handle type="target" position={Position.Bottom} className="!opacity-0" />
      <Handle type="source" position={Position.Top} className="!opacity-0" />
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[node.status])} />
      </div>
      <span className="font-semibold text-sm truncate w-full">{node.label}</span>

      <div className="mt-2 w-full border-t border-border pt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
        {node.powerKw !== undefined && node.powerKw !== null && (
          <div className="flex flex-col items-start">
            <span className="text-muted-foreground">Power</span>
            <span className="font-mono">{node.powerKw.toFixed(0)} kW</span>
          </div>
        )}
        {node.voltageV !== undefined && node.voltageV !== null && (
          <div className="flex flex-col items-start">
            <span className="text-muted-foreground">Volt</span>
            <span className="font-mono">
              {node.voltageV >= 1000 ? `${(node.voltageV / 1000).toFixed(1)} kV` : `${node.voltageV.toFixed(0)} V`}
            </span>
          </div>
        )}
        {node.currentA !== undefined && node.currentA !== null && (
          <div className="flex flex-col items-start">
            <span className="text-muted-foreground">Current</span>
            <span className="font-mono">{node.currentA.toFixed(0)} A</span>
          </div>
        )}
      </div>

      {hasBreaker && (
        <div
          className={cn(
            "mt-2 w-full flex items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border",
            node.breakerState === "closed"
              ? "text-status-normal border-status-normal/30 bg-status-normal/10"
              : "text-status-fault border-status-fault/30 bg-status-fault/10",
          )}
        >
          {node.breakerState === "closed" ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          Breaker {node.breakerState === "closed" ? "Closed" : "Open"}
        </div>
      )}

      {node.type === "combiner" && node.stringFaultCount != null && node.stringFaultCount > 0 && (
        <div className="mt-2 w-full flex items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border border-status-warning/40 bg-status-warning/10 text-status-warning">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {node.stringFaultCount} string{node.stringFaultCount !== 1 ? "s" : ""} faulted
        </div>
      )}

      {node.type === "combiner" && (node.stringFaultCount == null || node.stringFaultCount === 0) && (
        <div className="mt-2 w-full flex items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border border-status-normal/30 bg-status-normal/10 text-status-normal">
          All strings nominal
        </div>
      )}

      <div className="absolute -top-2 -right-2">
        {node.status === "fault" && <div className="w-4 h-4 rounded-full bg-status-fault animate-ping absolute" />}
        {node.status === "fault" && <div className="w-4 h-4 rounded-full bg-status-fault" />}
      </div>
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>{content}</PopoverTrigger>
      <PopoverContent side="right" className="w-64">
        <SldNodeDetail node={node} />
      </PopoverContent>
    </Popover>
  );
}

function SldNodeDetail({ node }: { node: SldNodeDatum }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{node.label}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{node.type.replace("_", " ")}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Status</div>
          <div className="font-medium capitalize">{node.status}</div>
        </div>
        {node.powerKw !== undefined && node.powerKw !== null && (
          <div>
            <div className="text-muted-foreground">Power</div>
            <div className="font-mono">{node.powerKw.toFixed(1)} kW</div>
          </div>
        )}
        {node.voltageV !== undefined && node.voltageV !== null && (
          <div>
            <div className="text-muted-foreground">Voltage</div>
            <div className="font-mono">
              {node.voltageV >= 1000 ? `${(node.voltageV / 1000).toFixed(2)} kV` : `${node.voltageV.toFixed(0)} V`}
            </div>
          </div>
        )}
        {node.currentA !== undefined && node.currentA !== null && (
          <div>
            <div className="text-muted-foreground">Current</div>
            <div className="font-mono">{node.currentA.toFixed(1)} A</div>
          </div>
        )}
        {node.breakerState && (
          <div>
            <div className="text-muted-foreground">Breaker</div>
            <div className="font-medium capitalize">{node.breakerState}</div>
          </div>
        )}
      </div>
      {node.type === "combiner" && node.stringFaultCount != null && (
        <div className={cn(
          "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium border",
          node.stringFaultCount > 0
            ? "border-status-warning/40 bg-status-warning/10 text-status-warning"
            : "border-status-normal/30 bg-status-normal/10 text-status-normal"
        )}>
          {node.stringFaultCount > 0 ? (
            <><AlertTriangle className="w-3 h-3 shrink-0" />{node.stringFaultCount} string{node.stringFaultCount !== 1 ? "s" : ""} faulted</>
          ) : (
            "All strings nominal"
          )}
        </div>
      )}
      {node.detailPath && (
        <Link href={node.detailPath} className="inline-block text-xs text-primary hover:underline pt-1">
          {node.type === "combiner" ? "View string diagnostics →" : "View equipment detail →"}
        </Link>
      )}
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

const nodeTypes = { sld: SldFlowNode };
const edgeTypes = { flow: FlowEdge };

export default function PlantSld() {
  const { plantId } = useParams();

  const { data: sld, isLoading } = useGetPlantSld(plantId || "", {
    query: {
      enabled: !!plantId,
      refetchInterval: 15000,
      queryKey: getGetPlantSldQueryKey(plantId || ""),
    },
  });

  const [fullscreen, setFullscreen] = useState(false);

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
      <div className="flex flex-col space-y-6 h-full">
        <div>
          <div className="flex items-center mb-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Portfolio</Link>
            <span className="mx-2">/</span>
            <Link href={`/plants/${plantId}`} className="hover:text-foreground transition-colors">Plant Overview</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">Single Line Diagram</span>
          </div>

          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <Network className="w-6 h-6 mr-2 text-primary" />
              Live Topology (SLD)
            </h1>
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Last updated: {new Date().toLocaleTimeString()}
              </div>
              <button
                onClick={() => setFullscreen((v) => !v)}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-card-border bg-card hover:bg-muted/30 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                {fullscreen ? "Exit Full Screen" : "Full Screen"}
              </button>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex-1 bg-[#0a0a0a] rounded-xl border border-card-border overflow-hidden relative min-h-[600px]",
            fullscreen && "fixed inset-4 z-50 min-h-0",
          )}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin text-primary"><Network className="w-8 h-8" /></div>
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
              <Background color="#333" gap={24} />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
