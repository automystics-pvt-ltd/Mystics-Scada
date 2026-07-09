/**
 * Driver Health Monitoring Dashboard
 * Real-time view of all protocol drivers — status, RTT, reading count, errors.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Wifi, WifiOff, AlertCircle, RotateCcw,
  Clock, Zap, TrendingUp, Filter, RefreshCw,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

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
}

const STATUS_META = {
  connected:    { label: "Connected",    dot: "bg-green-400",  text: "text-green-400",  icon: Wifi       },
  connecting:   { label: "Connecting",   dot: "bg-amber-400 animate-pulse", text: "text-amber-400", icon: Wifi },
  error:        { label: "Error",        dot: "bg-red-400",    text: "text-red-400",    icon: AlertCircle },
  disconnected: { label: "Disconnected", dot: "bg-muted-foreground", text: "text-muted-foreground", icon: WifiOff },
  idle:         { label: "Idle",         dot: "bg-muted-foreground", text: "text-muted-foreground", icon: WifiOff },
  no_driver:    { label: "No Driver",    dot: "bg-muted/50",   text: "text-muted-foreground", icon: WifiOff },
};

const PROTOCOL_COLORS: Record<string, string> = {
  modbus: "text-amber-400", modbus_tcp: "text-amber-400", modbus_rtu: "text-amber-400",
  mqtt: "text-blue-400", http: "text-green-400", websocket: "text-purple-400", ws: "text-purple-400",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function rttColor(ms: number | null): string {
  if (ms === null) return "text-muted-foreground";
  if (ms < 100)  return "text-green-400";
  if (ms < 500)  return "text-amber-400";
  return "text-red-400";
}

export default function DriverHealthPage() {
  const { toast }        = useToast();
  const queryClient      = useQueryClient();
  const { user }         = useAuth();
  const canManage        = user?.permissions?.includes("device.manage") ?? false;
  const [search, setSearch]     = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Driver Health
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live status for all {stats.length} protocol drivers
              {dataUpdatedAt ? ` — refreshed ${timeAgo(new Date(dataUpdatedAt).toISOString())}` : ""}
            </p>
          </div>
          <Button
            variant="outline" size="sm" className="gap-2"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["driver-health"] })}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Connected",   value: connected,  sub: "live drivers",   color: "text-green-400" },
            { label: "Error",       value: errors,     sub: "need attention", color: "text-red-400"   },
            { label: "Connecting",  value: connecting, sub: "in progress",    color: "text-amber-400" },
            { label: "Avg RTT",     value: avgRtt !== null ? `${avgRtt}ms` : "—", sub: "last reads", color: rttColor(avgRtt) },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-4">
              <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
              <div className="text-xs font-medium mt-0.5">{label}</div>
              <div className="text-[10px] text-muted-foreground">{sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search device or protocol…"
              className="pl-8 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {["all", "connected", "error", "connecting", "disconnected", "no_driver"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors capitalize ${
                filterStatus === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-foreground/40"
              }`}
            >
              {s === "all" ? "All" : s.replace("_", " ")}
              {s !== "all" && (
                <span className="ml-1 opacity-70">({stats.filter((d) => d.status === s).length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Driver table */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Loading driver stats…</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Device</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Protocol</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Last Reading</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">RTT</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reads</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Errors</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Uptime</th>
                  {canManage && <th className="w-20 px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                      No drivers match your filter.
                    </td>
                  </tr>
                ) : filtered.map((s) => {
                  const meta = STATUS_META[s.status] ?? STATUS_META.no_driver;
                  const errorRate = s.readingCount + s.errorCount > 0
                    ? Math.round((s.errorCount / (s.readingCount + s.errorCount)) * 100)
                    : 0;

                  return (
                    <tr key={s.deviceId} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
                      <td className="px-4 py-3">
                        <div className="font-medium">{s.deviceName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{s.deviceId.slice(0, 8)}…</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium text-xs ${PROTOCOL_COLORS[s.protocol] ?? "text-muted-foreground"}`}>
                          {s.protocol.toUpperCase().replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                          <span className={`text-xs ${meta.text}`}>{meta.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className={s.lastReadingAt ? "text-foreground" : "text-muted-foreground"}>
                            {timeAgo(s.lastReadingAt)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-mono ${rttColor(s.lastRttMs)}`}>
                          {s.lastRttMs !== null ? `${s.lastRttMs}ms` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs">
                          <TrendingUp className="h-3 w-3 text-muted-foreground" />
                          {s.readingCount.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`text-xs ${s.errorCount > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                          {s.errorCount > 0 ? `${s.errorCount} (${errorRate}%)` : "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {s.startedAt ? timeAgo(s.startedAt).replace(" ago", "") : "—"}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            title="Restart driver"
                            onClick={() => restartMutation.mutate(s.deviceId)}
                            disabled={restartMutation.isPending}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {noDriver > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            {noDriver} device{noDriver !== 1 ? "s" : ""} have no active driver — they lack a connection address or use an unsupported protocol.
          </p>
        )}
      </div>
    </AppLayout>
  );
}
