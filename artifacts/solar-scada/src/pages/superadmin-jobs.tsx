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
  "retry-worker":      "text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.6)]",
  "ftp-scheduler":     "text-purple-400 drop-shadow-[0_0_5px_rgba(192,132,252,0.6)]",
  "offline-detection": "text-status-warning drop-shadow-[0_0_5px_rgba(245,158,11,0.6)]",
};

function lastRunLabel(job: JobState): string {
  const raw = job.lastRunAt ?? job.lastTickAt ?? job.lastSweepAt ?? null;
  if (!raw) return "NEVER";
  const diff = Date.now() - new Date(raw).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}S AGO`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}M AGO`;
  return new Date(raw).toLocaleTimeString().toUpperCase();
}

function runCount(job: JobState): number {
  return job.runsCompleted ?? job.ticksCompleted ?? job.sweepsCompleted ?? 0;
}

function intervalLabel(job: JobState): string {
  const ms = job.pollIntervalMs ?? job.tickIntervalMs ?? job.sweepIntervalMs ?? 0;
  if (ms >= 60_000) return `${ms / 60_000}M`;
  return `${ms / 1000}S`;
}

function extraStat(job: JobState): { label: string; value: string | number } | null {
  if (job.id === "retry-worker" && job.lastBatchSize !== undefined)
    return { label: "LAST BATCH", value: job.lastBatchSize };
  if (job.id === "ftp-scheduler" && job.sourcesProcessed !== undefined)
    return { label: "SOURCES PROCESSED", value: job.sourcesProcessed };
  if (job.id === "offline-detection" && job.totalOfflineTransitions !== undefined)
    return { label: "OFFLINE TRANSITIONS", value: job.totalOfflineTransitions };
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
          <div className="flex items-center justify-between border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <div>
              <h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">
                <Timer className="h-6 w-6 text-accent-brand" />
                BACKGROUND JOBS
              </h1>
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">
                MONITOR AND MANUALLY TRIGGER BACKGROUND WORKERS
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="font-mono text-[9px] uppercase tracking-widest border-accent-brand/30 text-accent-brand hover:bg-accent-brand/10 rounded-none gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> REFRESH
            </Button>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "TOTAL WORKERS",    value: jobs.length,  icon: BarChart2,    color: "text-muted-foreground" },
              { label: "RUNNING",          value: allRunning,   icon: CheckCircle2, color: "text-status-normal" },
              { label: "WORKERS W/ ERRORS",value: withErrors,   icon: ServerCrash,  color: withErrors ? "text-status-fault" : "text-muted-foreground" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="border border-border/50 bg-card/40 p-4 relative group hover:border-accent-brand/30 transition-colors">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-border/30 group-hover:bg-accent-brand/50 transition-colors" />
                <div className="flex items-center justify-between mb-3">
                  <p className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                {isLoading
                  ? <div className="h-8 bg-white/5 animate-pulse w-16" />
                  : <p className={`text-3xl font-bold font-mono ${color}`}>{value}</p>}
              </div>
            ))}
          </div>

          {/* Job Cards */}
          <div className="space-y-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="border border-border/50 bg-card/40 animate-pulse h-36" />
              ))
            ) : jobs.map((job) => {
              const Icon = JOB_ICONS[job.id] ?? Activity;
              const color = JOB_COLORS[job.id] ?? "text-muted-foreground";
              const extra = extraStat(job);
              const isBusy = triggering[job.id];

              return (
                <div key={job.id} className="border border-border/50 bg-card/40 p-5 relative overflow-hidden group hover:border-border transition-colors">
                  <div className={`absolute top-0 left-0 w-1 h-full ${job.running ? "bg-status-normal shadow-[0_0_10px_rgba(34,197,94,0.8)]" : "bg-border/50"}`} />
                  <div className="flex items-start justify-between gap-5 ml-2">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={`p-2 border border-border/30 bg-card/60 ${color}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-mono text-sm font-bold uppercase tracking-widest text-foreground">{job.name}</h3>
                          <Badge
                            variant="outline"
                            className={`font-mono text-[8px] font-bold uppercase tracking-widest rounded-none border px-1.5 py-0.5 ${
                              job.running
                                ? "border-status-normal/50 text-status-normal bg-status-normal/10"
                                : "border-muted-foreground/30 text-muted-foreground"
                            }`}
                          >
                            {job.running ? "● RUNNING" : "○ STOPPED"}
                          </Badge>
                          {job.lastError && (
                            <Badge variant="outline" className="font-mono text-[8px] font-bold uppercase tracking-widest rounded-none px-1.5 py-0.5 border-status-fault/50 text-status-fault bg-status-fault/10">
                              ⚠ ERROR
                            </Badge>
                          )}
                        </div>
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1.5">{job.description}</p>

                        {/* Metrics row */}
                        <div className="flex flex-wrap gap-5 mt-4">
                          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>LAST RUN: <span className="text-foreground font-bold">{lastRunLabel(job)}</span></span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>COMPLETED: <span className="text-foreground font-bold">{runCount(job)}</span></span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                            <Timer className="h-3.5 w-3.5" />
                            <span>INTERVAL: <span className="text-foreground font-bold">{intervalLabel(job)}</span></span>
                          </div>
                          {extra && (
                            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                              <BarChart2 className="h-3.5 w-3.5" />
                              <span>{extra.label}: <span className="text-foreground font-bold">{extra.value}</span></span>
                            </div>
                          )}
                          {job.startedAt && (
                            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                              <Activity className="h-3.5 w-3.5" />
                              <span>STARTED: <span className="text-foreground font-bold">{new Date(job.startedAt).toLocaleTimeString().toUpperCase()}</span></span>
                            </div>
                          )}
                        </div>

                        {/* Last error */}
                        {job.lastError && (
                          <div className="mt-4 flex items-start gap-3 p-3 bg-status-fault/10 border border-status-fault/30">
                            <AlertTriangle className="h-4 w-4 text-status-fault flex-shrink-0" />
                            <p className="font-mono text-[10px] text-status-fault font-bold uppercase tracking-widest break-all leading-relaxed">{job.lastError}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Trigger button */}
                    <Button
                      variant="outline"
                      className={`gap-2 flex-shrink-0 font-mono text-[9px] uppercase tracking-widest font-bold rounded-none border-border/50 text-muted-foreground transition-colors ${isBusy ? "" : "hover:border-accent-brand hover:text-accent-brand hover:bg-accent-brand/10"}`}
                      disabled={isBusy}
                      onClick={() => triggerMut.mutate(job.id)}
                    >
                      {isBusy
                        ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> RUNNING...</>
                        : <><Play className="h-3.5 w-3.5" /> TRIGGER NOW</>}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info note */}
          <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/30">
            <Zap className="h-4 w-4 flex-shrink-0 text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.6)] mt-0.5" />
            <span className="font-mono text-[9px] uppercase tracking-widest text-blue-400 leading-relaxed font-bold">
              TRIGGERING A JOB STARTS ONE IMMEDIATE CYCLE WITHOUT AFFECTING THE NORMAL SCHEDULE.<br/>
              WORKERS AUTOMATICALLY RECOVER FROM TRANSIENT ERRORS ON THE NEXT CYCLE.
            </span>
          </div>

        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}