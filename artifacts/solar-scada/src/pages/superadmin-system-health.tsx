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
  if (d) parts.push(`${d}D`);
  if (h) parts.push(`${h}H`);
  parts.push(`${m}M`);
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
          <div className="flex items-center justify-between border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <div>
              <h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">
                <Activity className="h-6 w-6 text-accent-brand" />
                SYSTEM HEALTH
              </h1>
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">
                API SERVER RUNTIME METRICS // AUTO-REFRESH 15S
                {dataUpdatedAt ? ` // LAST UPDATE ${new Date(dataUpdatedAt).toLocaleTimeString()} UTC` : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="font-mono text-[9px] uppercase tracking-widest border-accent-brand/30 text-accent-brand hover:bg-accent-brand/10 rounded-none gap-2">
              <RefreshCw className="h-3 w-3" /> PULL TELEMETRY
            </Button>
          </div>

          {/* Top KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "UPTIME",       value: data ? fmtUptime(data.uptime) : "—",  icon: Clock,      color: "text-status-normal" },
              { label: "NODE VERSION", value: data?.nodeVersion ?? "—",               icon: Zap,        color: "text-blue-400" },
              { label: "PLATFORM",     value: data?.platform ?? "—",                  icon: Cpu,        color: "text-muted-foreground" },
              { label: "ENVIRONMENT",  value: data?.env ?? "—",                        icon: Activity,   color: data?.env === "production" ? "text-status-normal" : "text-status-warning" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="border border-border/50 bg-card/40 p-4 relative group hover:border-accent-brand/50 transition-colors">
                <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-accent-brand transition-colors" />
                <div className="flex items-center justify-between mb-3 pl-2">
                  <p className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                {isLoading ? <div className="h-7 bg-white/5 animate-pulse ml-2 w-24" /> : (
                  <p className={`text-2xl font-bold font-mono pl-2 uppercase ${color}`}>{value}</p>
                )}
              </div>
            ))}
          </div>

          {/* Memory */}
          <div className="border border-border/50 bg-card/40 flex flex-col relative overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 bg-card/60 flex items-center justify-between">
              <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5 text-accent-brand" />
                MEMORY ALLOCATION
              </h3>
            </div>
            <div className="p-5">
              {isLoading ? <div className="h-32 bg-white/5 animate-pulse" /> : data ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "RSS",        value: fmtBytes(data.memory.rss),       sub: "RESIDENT SET SIZE" },
                    { label: "HEAP USED",  value: fmtBytes(data.memory.heapUsed),  sub: `${heapPct}% OF HEAP`, className: memColor },
                    { label: "HEAP TOTAL", value: fmtBytes(data.memory.heapTotal), sub: "V8 HEAP ALLOCATED" },
                    { label: "EXTERNAL",   value: fmtBytes(data.memory.external),  sub: "C++ BINDINGS" },
                  ].map(({ label, value, sub, className }) => (
                    <div key={label} className="bg-card/60 p-4 border border-border/30">
                      <p className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{label}</p>
                      <p className={`font-mono text-xl font-bold uppercase ${className ?? "text-foreground"}`}>{value}</p>
                      <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-widest mt-1">{sub}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Heap bar */}
              {data && (
                <div className="mt-6">
                  <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest font-bold mb-2">
                    <span className="text-muted-foreground">HEAP UTILISATION</span>
                    <span className={memColor}>{heapPct}%</span>
                  </div>
                  <div className="h-1 bg-border/50 w-full">
                    <div
                      className={`h-full transition-all duration-1000 ${heapPct > 85 ? "bg-status-fault shadow-[0_0_10px_rgba(239,68,68,0.8)]" : heapPct > 65 ? "bg-status-warning shadow-[0_0_10px_rgba(245,158,11,0.8)]" : "bg-status-normal shadow-[0_0_10px_rgba(34,197,94,0.8)]"}`}
                      style={{ width: `${heapPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Database */}
          <div className="border border-border/50 bg-card/40 flex flex-col">
            <div className="px-4 py-3 border-b border-border/50 bg-card/60 flex items-center justify-between">
              <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-accent-brand" />
                DATABASE CONNECTIVITY
              </h3>
            </div>
            <div className="p-5">
              {isLoading ? <div className="h-16 bg-white/5 animate-pulse" /> : data ? (
                <div className="flex items-center gap-8">
                  <div className="flex items-center gap-4">
                    {data.db.connected
                      ? <CheckCircle2 className="h-8 w-8 text-status-normal drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                      : <XCircle className="h-8 w-8 text-status-fault drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]" />}
                    <div>
                      <p className={`font-mono text-sm font-bold uppercase tracking-widest ${data.db.connected ? "text-status-normal" : "text-status-fault"}`}>
                        {data.db.connected ? "CONNECTED" : "DISCONNECTED"}
                      </p>
                      <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest mt-1">POSTGRESQL</p>
                    </div>
                  </div>
                  {data.db.connected && (
                    <div className="border-l border-border/50 pl-8">
                      <p className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">LATENCY (RTT)</p>
                      <p className={`font-mono text-2xl font-bold uppercase tracking-widest ${data.db.latencyMs < 10 ? "text-status-normal" : data.db.latencyMs < 50 ? "text-status-warning" : "text-status-fault"}`}>
                        {data.db.latencyMs} MS
                      </p>
                    </div>
                  )}
                  <div className="border-l border-border/50 pl-8">
                    <p className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">LAST HEARTBEAT</p>
                    <p className="font-mono text-sm font-bold uppercase tracking-widest">{new Date(data.timestamp).toLocaleTimeString()}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Process info */}
          {data && (
            <div className="border border-border/50 bg-card/40 flex flex-col">
              <div className="px-4 py-3 border-b border-border/50 bg-card/60 flex items-center justify-between">
                <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5 text-accent-brand" />
                  RUNTIME CONTEXT
                </h3>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    ["PID",       "N/A (SANDBOXED)"],
                    ["NODE",      data.nodeVersion],
                    ["PLATFORM",  data.platform],
                    ["ENV",       data.env],
                    ["UPTIME",    fmtUptime(data.uptime)],
                    ["HEAP %",    `${heapPct}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-card/60 px-4 py-3 border border-border/30 flex items-center justify-between hover:border-accent-brand/30 transition-colors">
                      <span className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{k}</span>
                      <span className="font-mono text-[10px] font-bold text-accent-brand uppercase tracking-widest">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
