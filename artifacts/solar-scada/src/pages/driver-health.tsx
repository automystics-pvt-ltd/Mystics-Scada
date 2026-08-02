/**
 * Driver Health Monitoring Dashboard
 * Real-time view of all protocol drivers — status, RTT, reading count, errors.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Wifi, WifiOff, AlertCircle, RotateCcw,
  Clock, Zap, TrendingUp, Filter, RefreshCw, Trash2,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BASE = import.meta.env.BASE_URL;

interface DriverStat {
  deviceId: string;
  deviceName: string;
  protocol: string;
  orgId: string;
  plantId: string;
  status: "connected" | "connecting" | "error" | "disconnected" | "idle" | "no_driver";
  startedAt: string | null;
  lastReadingAt: string | null;
  lastRttMs: number | null;
  readingCount: number;
  errorCount: number;
  subscriptionCount: number | null;
}

const STATUS_META = {
  connected:    { label: "CONNECTED",    dot: "bg-status-normal",  text: "text-status-normal shadow-[0_0_10px_rgba(34,197,94,0.3)]",  icon: Wifi       },
  connecting:   { label: "CONNECTING",   dot: "bg-brand animate-pulse", text: "text-brand shadow-[0_0_10px_rgba(0,255,170,0.3)]", icon: Wifi },
  error:        { label: "ERROR",        dot: "bg-status-fault shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-pulse",    text: "text-status-fault",    icon: AlertCircle },
  disconnected: { label: "DISCONNECTED", dot: "bg-muted-foreground", text: "text-muted-foreground", icon: WifiOff },
  idle:         { label: "IDLE",         dot: "bg-muted-foreground", text: "text-muted-foreground", icon: WifiOff },
  no_driver:    { label: "NO DRIVER",    dot: "bg-border/50",   text: "text-muted-foreground opacity-50", icon: WifiOff },
};

const PROTOCOL_COLORS: Record<string, string> = {
  modbus: "text-amber-400 border-amber-400/30 bg-amber-400/10", 
  modbus_tcp: "text-amber-400 border-amber-400/30 bg-amber-400/10", 
  modbus_rtu: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  mqtt: "text-blue-400 border-blue-400/30 bg-blue-400/10", 
  http: "text-green-400 border-green-400/30 bg-green-400/10", 
  websocket: "text-purple-400 border-purple-400/30 bg-purple-400/10", 
  ws: "text-purple-400 border-purple-400/30 bg-purple-400/10",
  opcua: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10", 
  bacnet: "text-[#e67e22] border-[#e67e22]/30 bg-[#e67e22]/10",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "NEVER";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `T-${s}S`;
  const m = Math.floor(s / 60);
  if (m < 60) return `T-${m}M`;
  return `T-${Math.floor(m / 60)}H`;
}

function rttColor(ms: number | null): string {
  if (ms === null) return "text-muted-foreground";
  if (ms < 100)  return "text-status-normal";
  if (ms < 500)  return "text-status-warning";
  return "text-status-fault font-bold";
}

export default function DriverHealthPage() {
  const { toast }        = useToast();
  const queryClient      = useQueryClient();
  const { user }         = useAuth();
  const canManage        = user?.permissions?.includes("device.manage") ?? false;
  const [search, setSearch]         = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<DriverStat | null>(null);

  const { data: stats = [], isLoading, dataUpdatedAt } = useQuery<DriverStat[]>({
    queryKey: ["driver-health"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices/health-stats`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load driver health");
      return r.json() as Promise<DriverStat[]>;
    },
    refetchInterval: 10_000,
  });

  const restartMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const r = await fetch(`${BASE}api/devices/${deviceId}/restart`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error("Restart failed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["driver-health"] });
      toast({ title: "Restart sent", description: "Driver will reconnect shortly." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const r = await fetch(`${BASE}api/devices/${deviceId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: (_, deviceId) => {
      void queryClient.invalidateQueries({ queryKey: ["driver-health"] });
      toast({ title: "Device deleted", description: "Device and its data have been removed." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = stats.filter((s) => {
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.deviceName.toLowerCase().includes(q) && !s.protocol.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Summary counts
  const connected    = stats.filter((s) => s.status === "connected").length;
  const errors       = stats.filter((s) => s.status === "error").length;
  const connecting   = stats.filter((s) => s.status === "connecting").length;
  const noDriver     = stats.filter((s) => s.status === "no_driver").length;
  const avgRtt       = (() => {
    const rtts = stats.filter((s) => s.lastRttMs !== null).map((s) => s.lastRttMs!);
    return rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null;
  })();

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6 h-[calc(100vh-100px)]">
        {/* Header */}
        <div className="border border-border/50 bg-black/40 p-5 relative flex-shrink-0 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
          <div>
            <h1 className="text-xl font-mono font-bold uppercase tracking-widest text-foreground flex items-center gap-3">
              <Activity className="h-5 w-5 text-brand" />
              PROTOCOL DRIVER HEALTH
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2 ml-8">
              LIVE STATUS FOR ALL {stats.length} DRIVERS
              {dataUpdatedAt ? ` // SYNCED ${timeAgo(new Date(dataUpdatedAt).toISOString())}` : ""}
            </p>
          </div>
          <button
            className="font-mono text-[10px] uppercase tracking-widest font-bold border border-brand bg-brand/10 text-brand hover:bg-brand/20 px-4 py-2 flex items-center gap-2 transition-colors shadow-[0_0_10px_rgba(0,255,170,0.2)]"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["driver-health"] })}
          >
            <RefreshCw className="h-3.5 w-3.5" /> REFRESH
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-shrink-0">
          {[
            { label: "CONNECTED",   value: connected,  sub: "LIVE DRIVERS",   color: "text-status-normal", bg: "border-status-normal/50 bg-status-normal/10 shadow-[inset_0_0_20px_rgba(34,197,94,0.1)]", bar: "bg-status-normal" },
            { label: "ERROR",       value: errors,     sub: "NEED ATTENTION", color: "text-status-fault",  bg: errors > 0 ? "border-status-fault bg-status-fault/20 shadow-[inset_0_0_20px_rgba(239,68,68,0.2)] animate-pulse" : "border-border/50 bg-black/60", bar: "bg-status-fault" },
            { label: "CONNECTING",  value: connecting, sub: "IN PROGRESS",    color: "text-brand", bg: connecting > 0 ? "border-brand bg-brand/10 shadow-[inset_0_0_20px_rgba(0,255,170,0.1)]" : "border-border/50 bg-black/60", bar: "bg-brand" },
            { label: "AVG RTT",     value: avgRtt !== null ? `${avgRtt}ms` : "—", sub: "LAST READS", color: rttColor(avgRtt), bg: "border-border/50 bg-black/60", bar: "bg-muted-foreground" },
          ].map(({ label, value, sub, color, bg, bar }) => (
            <div key={label} className={`relative p-5 flex flex-col justify-center border ${bg}`}>
              <div className={`absolute top-0 left-0 w-full h-0.5 ${bar}`} />
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-2">{label}</div>
              <div className={`text-2xl font-mono font-bold tracking-widest ${color}`}>{isLoading ? "..." : value}</div>
              <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mt-2">{sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center border border-border/50 bg-black/60 p-3 flex-shrink-0">
          <div className="relative flex-1 min-w-[240px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand" />
            <input
              placeholder="SEARCH DEVICE OR PROTOCOL…"
              className="w-full h-10 pl-10 pr-4 bg-black/40 border border-border/50 font-mono text-[10px] uppercase tracking-widest text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/50 focus:ring-0 transition-colors"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["all", "connected", "error", "connecting", "disconnected", "no_driver"].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`font-mono text-[9px] uppercase tracking-widest font-bold px-3 py-1.5 border transition-colors ${
                  filterStatus === s
                    ? "bg-brand/20 border-brand text-brand shadow-[0_0_5px_rgba(0,255,170,0.3)]"
                    : "bg-black/40 border-border/50 text-muted-foreground hover:border-brand/50 hover:text-brand"
                }`}
              >
                {s === "all" ? "ALL" : s.replace("_", " ")}
                {s !== "all" && (
                  <span className="ml-1.5 opacity-60">[{stats.filter((d) => d.status === s).length}]</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Driver table */}
        <div className="flex-1 min-h-0 border border-border/50 bg-black/60 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
          <div className="h-full overflow-auto custom-scrollbar">
            <table className="w-full text-sm text-left min-w-[1000px]">
              <thead className="bg-black/90 backdrop-blur border-b border-border/50 sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">TARGET DEVICE</th>
                  <th className="px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">PROTOCOL</th>
                  <th className="px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">STATE</th>
                  <th className="px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">LAST READ</th>
                  <th className="px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">RTT (MS)</th>
                  <th className="px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">OP COUNT</th>
                  <th className="px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">FAULTS</th>
                  <th className="px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">SUBS</th>
                  <th className="px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">UPTIME</th>
                  {canManage && <th className="w-28 px-5 py-4" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 font-mono">
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}><td colSpan={10} className="px-5 py-6 text-center text-brand text-[10px] uppercase tracking-widest animate-pulse">QUERYING DRIVERS...</td></tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-20 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      NO DRIVERS MATCH CURRENT PARAMETERS.
                    </td>
                  </tr>
                ) : filtered.map((s) => {
                  const meta = STATUS_META[s.status] ?? STATUS_META.no_driver;
                  const errorRate = s.readingCount + s.errorCount > 0
                    ? Math.round((s.errorCount / (s.readingCount + s.errorCount)) * 100)
                    : 0;

                  return (
                    <tr key={s.deviceId} className="hover:bg-brand/5 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="font-bold text-foreground group-hover:text-brand transition-colors text-xs uppercase">{s.deviceName}</div>
                        <div className="text-[9px] text-muted-foreground mt-1">ID:{s.deviceId.slice(0, 8)}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 border ${PROTOCOL_COLORS[s.protocol] ?? "text-muted-foreground border-border/50 bg-black/40"}`}>
                          {s.protocol.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 ${meta.dot}`} />
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.text}`}>{meta.label}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className={`flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold ${s.lastReadingAt ? "text-foreground" : "text-muted-foreground"}`}>
                          {timeAgo(s.lastReadingAt)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] font-bold tracking-widest ${rttColor(s.lastRttMs)}`}>
                          {s.lastRttMs !== null ? `${s.lastRttMs}ms` : "—"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-[10px] font-bold text-foreground">
                          {s.readingCount.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className={`text-[10px] font-bold ${s.errorCount > 0 ? "text-status-fault" : "text-muted-foreground"}`}>
                          {s.errorCount > 0 ? `${s.errorCount.toLocaleString()} (${errorRate}%)` : "—"}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[10px] font-bold text-muted-foreground">
                        {s.subscriptionCount !== null ? s.subscriptionCount.toLocaleString() : "—"}
                      </td>
                      <td className="px-5 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        {s.startedAt ? timeAgo(s.startedAt).replace(" AGO", "") : "—"}
                      </td>
                      {canManage && (
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              className="p-1.5 border border-brand/50 text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
                              title="RESTART DRIVER"
                              onClick={() => restartMutation.mutate(s.deviceId)}
                              disabled={restartMutation.isPending || deleteMutation.isPending}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="p-1.5 border border-status-fault/50 text-status-fault hover:bg-status-fault/10 transition-colors disabled:opacity-50"
                              title="TERMINATE DEVICE"
                              onClick={() => setDeleteTarget(s)}
                              disabled={restartMutation.isPending || deleteMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {!isLoading && noDriver > 0 && (
          <div className="border border-border/50 bg-black/40 p-4 text-center">
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground font-bold">
              {noDriver} DEVICE{noDriver !== 1 ? "S" : ""} LACK ACTIVE PROTOCOL DRIVERS — MISSING TELEMETRY CONFIGURATION.
            </p>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="rounded-none border border-status-fault/50 bg-black/90 backdrop-blur-xl shadow-[0_0_30px_rgba(239,68,68,0.2)] p-0 gap-0">
          <AlertDialogHeader className="p-5 border-b border-border/50">
            <AlertDialogTitle className="font-mono text-base font-bold uppercase tracking-widest text-status-fault flex items-center gap-3">
              <AlertCircle className="w-5 h-5" /> TERMINATE DEVICE RECORD?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground leading-relaxed mt-4">
              <strong className="text-foreground">{deleteTarget?.deviceName}</strong> WILL BE PERMANENTLY DELETED FROM THE REGISTRY. ALL HISTORICAL TELEMETRY WILL BE LOST.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="p-5 border-t border-border/50 bg-black/40 sm:justify-between flex-row">
            <AlertDialogCancel className="font-mono text-[10px] uppercase tracking-widest font-bold border border-border/50 bg-black/40 text-muted-foreground hover:bg-white/5 transition-colors rounded-none h-10 px-4 mt-0">ABORT</AlertDialogCancel>
            <AlertDialogAction
              className="font-mono text-[10px] uppercase tracking-widest font-bold border border-status-fault bg-status-fault/10 text-status-fault hover:bg-status-fault/20 transition-colors shadow-[0_0_10px_rgba(239,68,68,0.2)] rounded-none h-10 px-4"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.deviceId);
                  setDeleteTarget(null);
                }
              }}
            >
              CONFIRM TERMINATION
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
