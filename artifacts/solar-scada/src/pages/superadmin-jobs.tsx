/**
 * Background Jobs Monitor — /superadmin/jobs
 *
 * Shows status of all background workers with live state,
 * last-run timestamps, run counts, and manual trigger buttons.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import {
  RefreshCw, Play, Zap, Database, Wifi, Clock, CheckCircle2,
  AlertTriangle, Activity, Timer, BarChart2, ServerCrash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL as string;

interface JobState {
  id: string;
  name: string;
  description: string;
  running: boolean;
  startedAt: string | null;
  lastRunAt?: string | null;
  lastTickAt?: string | null;
  lastSweepAt?: string | null;
  runsCompleted?: number;
  ticksCompleted?: number;
  sweepsCompleted?: number;
  lastBatchSize?: number;
  sourcesProcessed?: number;
  totalOfflineTransitions?: number;
  lastError: string | null;
  pollIntervalMs?: number;
  tickIntervalMs?: number;
  sweepIntervalMs?: number;
}

const JOB_ICONS: Record<string, typeof Zap> = {
  "retry-worker":      Database,
  "ftp-scheduler":     Wifi,
  "offline-detection": Activity,
};

const JOB_COLORS: Record<string, string> = {
  "retry-worker":      "text-blue-400",
  "ftp-scheduler":     "text-purple-400",
  "offline-detection": "text-status-warning",
};

function lastRunLabel(job: JobState): string {
  const raw = job.lastRunAt ?? job.lastTickAt ?? job.lastSweepAt ?? null;
  if (!raw) return "Never";
  const diff = Date.now() - new Date(raw).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return new Date(raw).toLocaleTimeString();
}

function runCount(job: JobState): number {
  return job.runsCompleted ?? job.ticksCompleted ?? job.sweepsCompleted ?? 0;
}

function intervalLabel(job: JobState): string {
  const ms = job.pollIntervalMs ?? job.tickIntervalMs ?? job.sweepIntervalMs ?? 0;
  if (ms >= 60_000) return `${ms / 60_000}m`;
  return `${ms / 1000}s`;
}

function extraStat(job: JobState): { label: string; value: string | number } | null {
  if (job.id === "retry-worker" && job.lastBatchSize !== undefined)
    return { label: "Last batch", value: job.lastBatchSize };
  if (job.id === "ftp-scheduler" && job.sourcesProcessed !== undefined)
    return { label: "Sources processed", value: job.sourcesProcessed };
  if (job.id === "offline-detection" && job.totalOfflineTransitions !== undefined)
    return { label: "Offline transitions", value: job.totalOfflineTransitions };
  return null;
}

export default function SuperAdminJobs() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [triggering, setTriggering] = useState<Record<string, boolean>>({});

  const { data: jobs = [], isLoading, refetch } = useQuery<JobState[]>({
    queryKey: ["superadmin", "jobs"],
    queryFn: () =>
      fetch(`${BASE}api/superadmin/jobs`, { credentials: "include" })
        .then((r) => r.json()) as Promise<JobState[]>,
    refetchInterval: 10_000,
  });

  const triggerMut = useMutation({
    mutationFn: (jobId: string) =>
      fetch(`${BASE}api/superadmin/jobs/${jobId}/trigger`, {
        method: "POST",
        credentials: "include",
        headers: { "X-SCADA-Request": "1" },
      }).then((r) => r.json()),
    onMutate: (jobId) => setTriggering((p) => ({ ...p, [jobId]: true })),
    onSettled: (_, __, jobId) => {
      setTriggering((p) => ({ ...p, [jobId]: false }));
      void qc.invalidateQueries({ queryKey: ["superadmin", "jobs"] });
    },
    onSuccess: (_, jobId) => {
      const job = jobs.find((j) => j.id === jobId);
      toast({ title: `${job?.name ?? jobId} triggered`, description: "Job cycle started immediately." });
    },
    onError: () => toast({ title: "Trigger failed", variant: "destructive" }),
  });

  const allRunning = jobs.filter((j) => j.running).length;
  const withErrors = jobs.filter((j) => j.lastError).length;

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Timer className="h-6 w-6 text-primary" />
                Background Jobs
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Monitor and manually trigger background workers
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Workers",    value: jobs.length,  icon: BarChart2,    color: "text-muted-foreground" },
              { label: "Running",          value: allRunning,   icon: CheckCircle2, color: "text-status-normal" },
              { label: "Workers w/ Errors",value: withErrors,   icon: ServerCrash,  color: withErrors ? "text-status-fault" : "text-muted-foreground" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="border border-border rounded-xl p-4 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                {isLoading
                  ? <div className="h-8 bg-muted animate-pulse rounded w-16" />
                  : <p className={`text-3xl font-bold font-mono ${color}`}>{value}</p>}
              </div>
            ))}
          </div>

          {/* Job Cards */}
          <div className="space-y-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="border border-border rounded-xl p-5 bg-card animate-pulse h-36" />
              ))
            ) : jobs.map((job) => {
              const Icon = JOB_ICONS[job.id] ?? Activity;
              const color = JOB_COLORS[job.id] ?? "text-muted-foreground";
              const extra = extraStat(job);
              const isBusy = triggering[job.id];

              return (
                <div key={job.id} className="border border-border rounded-xl p-5 bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg bg-muted/50 ${color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold">{job.name}</h3>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${
                              job.running
                                ? "border-status-normal/30 text-status-normal bg-status-normal/5"
                                : "border-muted-foreground/30 text-muted-foreground"
                            }`}
                          >
                            {job.running ? "● RUNNING" : "○ STOPPED"}
                          </Badge>
                          {job.lastError && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-status-fault/30 text-status-fault bg-status-fault/5">
                              ⚠ ERROR
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{job.description}</p>

                        {/* Metrics row */}
                        <div className="flex flex-wrap gap-4 mt-3">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>Last run: <span className="text-foreground font-mono">{lastRunLabel(job)}</span></span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Completed: <span className="text-foreground font-mono">{runCount(job)}</span></span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Timer className="h-3 w-3" />
                            <span>Interval: <span className="text-foreground font-mono">{intervalLabel(job)}</span></span>
                          </div>
                          {extra && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <BarChart2 className="h-3 w-3" />
                              <span>{extra.label}: <span className="text-foreground font-mono">{extra.value}</span></span>
                            </div>
                          )}
                          {job.startedAt && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Activity className="h-3 w-3" />
                              <span>Started: <span className="text-foreground font-mono">{new Date(job.startedAt).toLocaleTimeString()}</span></span>
                            </div>
                          )}
                        </div>

                        {/* Last error */}
                        {job.lastError && (
                          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-status-fault/5 border border-status-fault/20">
                            <AlertTriangle className="h-3.5 w-3.5 text-status-fault flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-status-fault font-mono break-all">{job.lastError}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Trigger button */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 flex-shrink-0"
                      disabled={isBusy}
                      onClick={() => triggerMut.mutate(job.id)}
                    >
                      {isBusy
                        ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Running…</>
                        : <><Play className="h-3.5 w-3.5" /> Trigger Now</>}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-400">
            <Zap className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Triggering a job starts one immediate cycle without affecting the normal schedule.
              Workers automatically recover from transient errors on the next cycle.
            </span>
          </div>

        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
