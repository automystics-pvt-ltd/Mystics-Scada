/**
 * Maintenance — /superadmin/maintenance
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { Wrench, Database, ShieldCheck, Clock, Loader2, CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL as string;
const H = { "Content-Type": "application/json", "X-SCADA-Request": "1" } as const;

interface SystemHealth {
  uptime: number; memory: { heapUsed: number; heapTotal: number };
  db: { connected: boolean; latencyMs: number }; timestamp: string;
}

interface IntegrityCheck {
  name: string; count: number; status: "ok" | "warning";
}

export default function SuperAdminMaintenance() {
  const { toast } = useToast();
  const [vacuumResult, setVacuumResult] = useState<string | null>(null);
  const [vacuumRunning, setVacuumRunning] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<{ checks: IntegrityCheck[]; passedAll: boolean } | null>(null);
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const { data: health } = useQuery<SystemHealth>({
    queryKey: ["superadmin", "system-health"],
    queryFn: () => fetch(`${BASE}api/superadmin/system-health`, { credentials: "include" }).then(r => r.json()) as Promise<SystemHealth>,
    refetchInterval: 30_000,
  });

  async function runVacuum() {
    setVacuumRunning(true);
    const r = await fetch(`${BASE}api/superadmin/db/maintenance/vacuum`, { method: "POST", credentials: "include", headers: H });
    const d = await r.json() as { ok: boolean; message: string };
    setVacuumResult(d.message);
    setVacuumRunning(false);
    toast({ title: "Maintenance complete", description: d.message });
  }

  async function runIntegrity() {
    setIntegrityRunning(true);
    const r = await fetch(`${BASE}api/superadmin/db/integrity`, { credentials: "include" });
    setIntegrityResult(await r.json() as { checks: IntegrityCheck[]; passedAll: boolean });
    setIntegrityRunning(false);
  }

  const heapPct = health ? Math.round((health.memory.heapUsed / health.memory.heapTotal) * 100) : 0;

  const TASKS = [
    { label: "DATABASE VACUUM",      desc: "RECLAIM DEAD TUPLE STORAGE AND UPDATE QUERY PLANNER STATISTICS",            action: () => void runVacuum(),        running: vacuumRunning,    icon: Database,     done: !!vacuumResult },
    { label: "INTEGRITY CHECK",      desc: "VERIFY REFERENTIAL INTEGRITY ACROSS ALL TABLES",                             action: () => void runIntegrity(),     running: integrityRunning, icon: ShieldCheck,  done: !!integrityResult },
  ];

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div className="border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">
              <Wrench className="h-6 w-6 text-accent-brand" />
              MAINTENANCE
            </h1>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">SCHEDULED MAINTENANCE TASKS, DB HOUSEKEEPING, AND SYSTEM MANAGEMENT</p>
          </div>

          {/* Quick health snapshot */}
          {health && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "DB LATENCY", value: `${health.db.latencyMs} MS`, ok: health.db.latencyMs < 20 },
                { label: "HEAP USAGE", value: `${heapPct}%`,              ok: heapPct < 70 },
                { label: "DB STATUS",  value: health.db.connected ? "ONLINE" : "OFFLINE", ok: health.db.connected },
              ].map(({ label, value, ok }) => (
                <div key={label} className="border border-border/50 bg-black/40 p-4 flex items-center gap-4 group hover:border-border transition-colors">
                  {ok ? <CheckCircle2 className="h-6 w-6 text-status-normal drop-shadow-[0_0_5px_rgba(34,197,94,0.6)]" /> : <AlertTriangle className="h-6 w-6 text-status-warning drop-shadow-[0_0_5px_rgba(245,158,11,0.6)]" />}
                  <div>
                    <p className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
                    <p className={`text-2xl font-bold font-mono ${ok ? "text-status-normal" : "text-status-warning"}`}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Maintenance mode toggle */}
          <div className={`border p-5 relative overflow-hidden ${maintenanceMode ? "border-status-warning/50 bg-status-warning/10" : "border-border/50 bg-black/40"}`}>
            {maintenanceMode && <div className="absolute top-0 left-0 w-1 h-full bg-status-warning shadow-[0_0_10px_rgba(245,158,11,0.8)]" />}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Wrench className={`h-6 w-6 ml-2 ${maintenanceMode ? "text-status-warning drop-shadow-[0_0_5px_rgba(245,158,11,0.6)]" : "text-muted-foreground"}`} />
                <div>
                  <p className="font-mono text-sm font-bold uppercase tracking-widest text-foreground">MAINTENANCE MODE</p>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1">
                    {maintenanceMode
                      ? "⚠ ACTIVE — USERS SEE A MAINTENANCE PAGE. DISABLE WHEN DONE."
                      : "DISABLED — PLATFORM IS SERVING USERS NORMALLY."}
                  </p>
                </div>
              </div>
              <Button
                variant={maintenanceMode ? "destructive" : "outline"}
                className={`font-mono text-[10px] uppercase tracking-widest font-bold rounded-none ${maintenanceMode ? "" : "border-border/50 hover:border-accent-brand hover:text-accent-brand"}`}
                onClick={() => {
                  setMaintenanceMode(!maintenanceMode);
                  toast({ title: maintenanceMode ? "Maintenance mode disabled" : "Maintenance mode enabled", variant: maintenanceMode ? "default" : "destructive" });
                }}
              >
                {maintenanceMode ? "DISABLE" : "ENABLE"}
              </Button>
            </div>
          </div>

          {/* Maintenance tasks */}
          <div className="border border-border/50 bg-black/40">
            <div className="bg-black/60 px-4 py-3 border-b border-border/50">
              <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground">MAINTENANCE TASKS</h2>
            </div>
            <div className="divide-y divide-border/30">
              {TASKS.map(task => (
                <div key={task.label} className="flex items-center gap-4 px-4 py-4 hover:bg-white/5 transition-colors">
                  <task.icon className={`h-4 w-4 flex-shrink-0 ${task.done ? "text-status-normal" : "text-muted-foreground"}`} />
                  <div className="flex-1">
                    <p className="font-mono text-[10px] font-bold text-foreground flex items-center gap-2 uppercase tracking-widest">
                      {task.label}
                      {task.done && <CheckCircle2 className="h-3.5 w-3.5 text-status-normal drop-shadow-[0_0_5px_rgba(34,197,94,0.6)]" />}
                    </p>
                    <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-widest mt-1">{task.desc}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={task.action} disabled={task.running} className="gap-2 flex-shrink-0 font-mono text-[9px] uppercase tracking-widest font-bold border-border/50 text-muted-foreground hover:border-accent-brand hover:text-accent-brand rounded-none transition-colors">
                    {task.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {task.running ? "RUNNING..." : "EXECUTE"}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Results */}
          {vacuumResult && (
            <div className="bg-status-normal/10 border border-status-normal/30 px-4 py-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest font-bold text-status-normal relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-status-normal shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 ml-1" /> {vacuumResult}
            </div>
          )}
          {integrityResult && (
            <div className={`border p-5 relative overflow-hidden ${integrityResult.passedAll ? "border-status-normal/30 bg-status-normal/10" : "border-status-warning/50 bg-status-warning/10"}`}>
              <div className={`absolute top-0 left-0 w-1 h-full ${integrityResult.passedAll ? "bg-status-normal shadow-[0_0_10px_rgba(34,197,94,0.8)]" : "bg-status-warning shadow-[0_0_10px_rgba(245,158,11,0.8)]"}`} />
              <p className={`font-mono text-[10px] font-bold uppercase tracking-widest mb-4 ml-1 ${integrityResult.passedAll ? "text-status-normal" : "text-status-warning"}`}>
                {integrityResult.passedAll ? "✓ ALL INTEGRITY CHECKS PASSED" : `⚠ ${integrityResult.checks.filter(c => c.status !== "ok").length} ISSUES FOUND`}
              </p>
              <div className="grid grid-cols-2 gap-3 ml-1">
                {integrityResult.checks.map(c => (
                  <div key={c.name} className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-widest bg-black/40 px-3 py-2 border border-border/30">
                    {c.status === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 text-status-normal" /> : <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />}
                    <span className="text-muted-foreground">{c.name}</span>
                    {c.count > 0 && <span className="font-bold text-status-warning ml-auto">{c.count}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Links to advanced tools */}
          <div className="border border-border/50 bg-black/40 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground mb-4">ADVANCED TOOLS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Link href="/superadmin/db">
                <div className="flex items-center gap-3 px-4 py-3 border border-border/50 bg-black/60 hover:border-accent-brand hover:bg-accent-brand/5 transition-colors cursor-pointer group relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-accent-brand transition-colors" />
                  <Database className="h-4 w-4 text-muted-foreground group-hover:text-accent-brand transition-colors ml-1" />
                  <span className="font-mono text-[10px] font-bold group-hover:text-accent-brand transition-colors uppercase tracking-widest">DATABASE ADMIN CONSOLE</span>
                </div>
              </Link>
              <Link href="/superadmin/system-health">
                <div className="flex items-center gap-3 px-4 py-3 border border-border/50 bg-black/60 hover:border-accent-brand hover:bg-accent-brand/5 transition-colors cursor-pointer group relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-accent-brand transition-colors" />
                  <Clock className="h-4 w-4 text-muted-foreground group-hover:text-accent-brand transition-colors ml-1" />
                  <span className="font-mono text-[10px] font-bold group-hover:text-accent-brand transition-colors uppercase tracking-widest">SYSTEM HEALTH MONITOR</span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
