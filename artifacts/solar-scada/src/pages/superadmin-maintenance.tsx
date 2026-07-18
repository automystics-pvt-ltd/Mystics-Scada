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
    { label: "Database Vacuum",      desc: "Reclaim dead tuple storage and update query planner statistics",            action: () => void runVacuum(),        running: vacuumRunning,    icon: Database,     done: !!vacuumResult },
    { label: "Integrity Check",      desc: "Verify referential integrity across all tables",                             action: () => void runIntegrity(),     running: integrityRunning, icon: ShieldCheck,  done: !!integrityResult },
  ];

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6 text-primary" />Maintenance</h1>
            <p className="text-sm text-muted-foreground mt-1">Scheduled maintenance tasks, DB housekeeping, and system management</p>
          </div>

          {/* Quick health snapshot */}
          {health && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "DB Latency", value: `${health.db.latencyMs}ms`, ok: health.db.latencyMs < 20 },
                { label: "Heap Usage", value: `${heapPct}%`,              ok: heapPct < 70 },
                { label: "DB Status",  value: health.db.connected ? "Online" : "Offline", ok: health.db.connected },
              ].map(({ label, value, ok }) => (
                <div key={label} className="border border-border rounded-xl p-4 bg-card flex items-center gap-3">
                  {ok ? <CheckCircle2 className="h-4 w-4 text-status-normal" /> : <AlertTriangle className="h-4 w-4 text-status-warning" />}
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={`text-xl font-bold font-mono ${ok ? "text-status-normal" : "text-status-warning"}`}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Maintenance mode toggle */}
          <div className={`border rounded-xl p-5 ${maintenanceMode ? "border-status-warning/40 bg-status-warning/5" : "border-border bg-card"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wrench className={`h-5 w-5 ${maintenanceMode ? "text-status-warning" : "text-muted-foreground"}`} />
                <div>
                  <p className="font-semibold text-sm">Maintenance Mode</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {maintenanceMode
                      ? "⚠ Active — users see a maintenance page. Disable when done."
                      : "Disabled — platform is serving users normally."}
                  </p>
                </div>
              </div>
              <Button
                variant={maintenanceMode ? "destructive" : "outline"}
                size="sm"
                onClick={() => {
                  setMaintenanceMode(!maintenanceMode);
                  toast({ title: maintenanceMode ? "Maintenance mode disabled" : "Maintenance mode enabled", variant: maintenanceMode ? "default" : "destructive" });
                }}
              >
                {maintenanceMode ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>

          {/* Maintenance tasks */}
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <div className="bg-muted/30 px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">Maintenance Tasks</h2>
            </div>
            <div className="divide-y divide-border/50">
              {TASKS.map(task => (
                <div key={task.label} className="flex items-center gap-4 px-4 py-4">
                  <task.icon className={`h-4 w-4 flex-shrink-0 ${task.done ? "text-status-normal" : "text-muted-foreground"}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium flex items-center gap-2">
                      {task.label}
                      {task.done && <CheckCircle2 className="h-3.5 w-3.5 text-status-normal" />}
                    </p>
                    <p className="text-xs text-muted-foreground">{task.desc}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={task.action} disabled={task.running} className="gap-1.5 flex-shrink-0">
                    {task.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {task.running ? "Running…" : "Run"}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Results */}
          {vacuumResult && (
            <div className="bg-status-normal/5 border border-status-normal/20 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-status-normal">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> {vacuumResult}
            </div>
          )}
          {integrityResult && (
            <div className={`border rounded-xl p-4 ${integrityResult.passedAll ? "border-status-normal/20 bg-status-normal/5" : "border-status-warning/30 bg-status-warning/5"}`}>
              <p className={`font-semibold text-sm mb-3 ${integrityResult.passedAll ? "text-status-normal" : "text-status-warning"}`}>
                {integrityResult.passedAll ? "✓ All integrity checks passed" : `⚠ ${integrityResult.checks.filter(c => c.status !== "ok").length} issues found`}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {integrityResult.checks.map(c => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    {c.status === "ok" ? <CheckCircle2 className="h-3 w-3 text-status-normal" /> : <AlertTriangle className="h-3 w-3 text-status-warning" />}
                    <span className="text-muted-foreground">{c.name}</span>
                    {c.count > 0 && <span className="font-mono text-status-warning ml-auto">{c.count}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Links to advanced tools */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <h2 className="text-sm font-semibold mb-3">Advanced Tools</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Link href="/superadmin/db">
                <div className="flex items-center gap-2.5 px-3 py-2.5 border border-border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer group text-sm">
                  <Database className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  <span className="group-hover:text-primary transition-colors">Database Admin Console</span>
                </div>
              </Link>
              <Link href="/superadmin/system-health">
                <div className="flex items-center gap-2.5 px-3 py-2.5 border border-border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer group text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  <span className="group-hover:text-primary transition-colors">System Health Monitor</span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
