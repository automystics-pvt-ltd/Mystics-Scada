/**
 * System Health — /superadmin/system-health
 */
import { useQuery } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { Activity, Cpu, HardDrive, Zap, Database, CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL as string;

interface SystemHealth {
  uptime: number; nodeVersion: string; platform: string; env: string;
  memory: { rss: number; heapUsed: number; heapTotal: number; external: number };
  db: { connected: boolean; latencyMs: number };
  timestamp: string;
}

function fmtBytes(b: number) {
  if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}

function fmtUptime(secs: number) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

export default function SuperAdminSystemHealth() {
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<SystemHealth>({
    queryKey: ["superadmin", "system-health"],
    queryFn: () => fetch(`${BASE}api/superadmin/system-health`, { credentials: "include" }).then(r => r.json()) as Promise<SystemHealth>,
    refetchInterval: 15_000,
  });

  const heapPct = data ? Math.round((data.memory.heapUsed / data.memory.heapTotal) * 100) : 0;
  const memColor = heapPct > 85 ? "text-status-fault" : heapPct > 65 ? "text-status-warning" : "text-status-normal";

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6 text-primary" />System Health</h1>
              <p className="text-sm text-muted-foreground mt-1">
                API server runtime metrics · Auto-refreshes every 15s
                {dataUpdatedAt ? ` · Last update ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh now
            </Button>
          </div>

          {/* Top KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Uptime",       value: data ? fmtUptime(data.uptime) : "—",  icon: Clock,      color: "text-status-normal" },
              { label: "Node Version", value: data?.nodeVersion ?? "—",               icon: Zap,        color: "text-blue-400" },
              { label: "Platform",     value: data?.platform ?? "—",                  icon: Cpu,        color: "text-muted-foreground" },
              { label: "Environment",  value: data?.env ?? "—",                        icon: Activity,   color: data?.env === "production" ? "text-status-normal" : "text-status-warning" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="border border-border rounded-xl p-4 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                {isLoading ? <div className="h-7 bg-muted animate-pulse rounded w-24" /> : (
                  <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
                )}
              </div>
            ))}
          </div>

          {/* Memory */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><HardDrive className="h-4 w-4" />Memory Usage</h2>
            {isLoading ? <div className="h-32 bg-muted animate-pulse rounded" /> : data ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "RSS",        value: fmtBytes(data.memory.rss),       sub: "Resident set size" },
                  { label: "Heap Used",  value: fmtBytes(data.memory.heapUsed),  sub: `${heapPct}% of heap`, className: memColor },
                  { label: "Heap Total", value: fmtBytes(data.memory.heapTotal), sub: "V8 heap allocated" },
                  { label: "External",   value: fmtBytes(data.memory.external),  sub: "C++ bindings" },
                ].map(({ label, value, sub, className }) => (
                  <div key={label} className="bg-muted/30 rounded-lg p-3 border border-border/50">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                    <p className={`text-xl font-bold font-mono ${className ?? "text-foreground"}`}>{value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Heap bar */}
            {data && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Heap utilisation</span>
                  <span className={`font-mono font-semibold ${memColor}`}>{heapPct}%</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${heapPct > 85 ? "bg-status-fault" : heapPct > 65 ? "bg-status-warning" : "bg-status-normal"}`}
                    style={{ width: `${heapPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Database */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><Database className="h-4 w-4" />Database Connectivity</h2>
            {isLoading ? <div className="h-16 bg-muted animate-pulse rounded" /> : data ? (
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  {data.db.connected
                    ? <CheckCircle2 className="h-6 w-6 text-status-normal" />
                    : <XCircle className="h-6 w-6 text-status-fault" />}
                  <div>
                    <p className={`font-semibold ${data.db.connected ? "text-status-normal" : "text-status-fault"}`}>
                      {data.db.connected ? "Connected" : "Disconnected"}
                    </p>
                    <p className="text-xs text-muted-foreground">PostgreSQL</p>
                  </div>
                </div>
                {data.db.connected && (
                  <div className="border-l border-border pl-6">
                    <p className="text-xs text-muted-foreground">Round-trip latency</p>
                    <p className={`text-2xl font-bold font-mono ${data.db.latencyMs < 10 ? "text-status-normal" : data.db.latencyMs < 50 ? "text-status-warning" : "text-status-fault"}`}>
                      {data.db.latencyMs}ms
                    </p>
                  </div>
                )}
                <div className="border-l border-border pl-6">
                  <p className="text-xs text-muted-foreground">Checked at</p>
                  <p className="text-sm font-mono">{new Date(data.timestamp).toLocaleTimeString()}</p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Process info */}
          {data && (
            <div className="border border-border rounded-xl p-5 bg-card">
              <h2 className="text-sm font-semibold mb-3">Process Details</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {[
                  ["PID",       "N/A (sandboxed)"],
                  ["Node",      data.nodeVersion],
                  ["Platform",  data.platform],
                  ["Env",       data.env],
                  ["Uptime",    fmtUptime(data.uptime)],
                  ["Heap %",    `${heapPct}%`],
                ].map(([k, v]) => (
                  <div key={k} className="bg-muted/30 rounded-lg px-3 py-2 border border-border/50 flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{k}</span>
                    <span className="font-mono font-semibold text-xs">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
