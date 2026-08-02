/**
 * Security Events — /superadmin/security
 */
import { useQuery } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { Shield, AlertTriangle, UserCheck, ShieldAlert, RefreshCw, Lock, LogIn, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL as string;

interface SecurityEvent {
  id: string; orgId: string; userId: string | null;
  actorName: string | null; actorEmail: string | null;
  action: string; resourceType: string | null; resourceId: string | null;
  metadata: Record<string, unknown> | null; createdAt: string;
}

interface SecurityData {
  events: SecurityEvent[];
  summary: { failedLogins24h: number; activeUsers24h: number; superAdminActions24h: number; total: number };
}

const ACTION_META: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  login:                  { label: "LOGIN",             icon: LogIn,      color: "text-status-normal border-status-normal bg-status-normal/10" },
  login_failed:           { label: "LOGIN FAILED",      icon: UserX,      color: "text-status-fault border-status-fault bg-status-fault/10" },
  password_changed:       { label: "PASSWORD CHANGED",  icon: Lock,       color: "text-status-warning border-status-warning bg-status-warning/10" },
  user_created:           { label: "USER CREATED",      icon: UserCheck,  color: "text-blue-400 border-blue-500 bg-blue-500/10" },
  user_deleted:           { label: "USER DELETED",      icon: UserX,      color: "text-status-fault border-status-fault bg-status-fault/10" },
  role_changed:           { label: "ROLE CHANGED",      icon: Shield,     color: "text-status-warning border-status-warning bg-status-warning/10" },
  superadmin_login:       { label: "SA LOGIN",          icon: ShieldAlert, color: "text-purple-400 border-purple-500 bg-purple-500/10" },
  impersonation_started:  { label: "IMPERSONATION",     icon: ShieldAlert, color: "text-status-warning border-status-warning bg-status-warning/10" },
};

export default function SuperAdminSecurity() {
  const { data, isLoading, refetch } = useQuery<SecurityData>({
    queryKey: ["superadmin", "security"],
    queryFn: () => fetch(`${BASE}api/superadmin/security`, { credentials: "include" }).then(r => r.json()) as Promise<SecurityData>,
    refetchInterval: 30_000,
  });

  const events  = data?.events  ?? [];
  const summary = data?.summary;

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <div>
              <h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">
                <Shield className="h-6 w-6 text-accent-brand" />
                SECURITY LOG
              </h1>
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">SECURITY-RELEVANT EVENTS ACROSS ALL ORGANISATIONS // LAST 200 EVENTS</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="font-mono text-[9px] uppercase tracking-widest border-accent-brand/30 text-accent-brand hover:bg-accent-brand/10 rounded-none gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> REFRESH
            </Button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "FAILED LOGINS (24H)",     value: summary?.failedLogins24h    ?? 0, color: summary?.failedLogins24h    ? "text-status-fault"    : "text-status-normal", icon: AlertTriangle },
              { label: "ACTIVE USERS (24H)",       value: summary?.activeUsers24h      ?? 0, color: "text-accent-brand",                                                        icon: UserCheck },
              { label: "SUPER ADMIN ACTIONS (24H)",value: summary?.superAdminActions24h ?? 0, color: summary?.superAdminActions24h ? "text-status-warning" : "text-muted-foreground", icon: ShieldAlert },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="border border-border/50 bg-card/40 p-4 relative group transition-colors hover:border-accent-brand/50">
                <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-accent-brand transition-colors" />
                <div className="flex items-center justify-between mb-3 pl-2">
                  <p className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                {isLoading ? <div className="h-8 bg-white/5 animate-pulse w-16 ml-2" /> : (
                  <p className={`text-3xl font-bold font-mono pl-2 ${color}`}>{value}</p>
                )}
              </div>
            ))}
          </div>

          {/* Threat gauge — simple visual */}
          {summary && (
            <div className={`border p-4 flex items-center gap-5 relative overflow-hidden ${
              summary.failedLogins24h > 10 ? "border-status-fault/50 bg-status-fault/10 shadow-[0_0_15px_rgba(239,68,68,0.15)]" :
              summary.failedLogins24h > 3  ? "border-status-warning/50 bg-status-warning/10" :
              "border-status-normal/30 bg-status-normal/5"
            }`}>
              <div className={`absolute top-0 left-0 w-1 h-full ${
                summary.failedLogins24h > 10 ? "bg-status-fault shadow-[0_0_10px_rgba(239,68,68,0.8)]" :
                summary.failedLogins24h > 3  ? "bg-status-warning shadow-[0_0_10px_rgba(245,158,11,0.8)]" :
                "bg-status-normal"
              }`} />
              <Shield className={`h-8 w-8 flex-shrink-0 ml-2 ${
                summary.failedLogins24h > 10 ? "text-status-fault drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" :
                summary.failedLogins24h > 3  ? "text-status-warning drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" : "text-status-normal drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]"
              }`} />
              <div>
                <p className="font-mono text-sm font-bold uppercase tracking-widest text-foreground">
                  {summary.failedLogins24h > 10 ? "⚠ ELEVATED THREAT LEVEL — MULTIPLE FAILED LOGINS DETECTED" :
                   summary.failedLogins24h > 3  ? "MODERATE ACTIVITY — SOME FAILED LOGINS IN THE LAST 24H" :
                   "✓ SECURITY POSTURE LOOKS NORMAL"}
                </p>
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1">
                  {summary.total} TOTAL SECURITY EVENTS IN HISTORY // {summary.failedLogins24h} FAILED LOGINS IN LAST 24H
                </p>
              </div>
            </div>
          )}

          {/* Event stream */}
          <div className="border border-border/50 bg-card/40">
            <div className="px-4 py-3 border-b border-border/50 bg-card/60 flex items-center justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground">EVENT STREAM</h2>
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{events.length} EVENTS</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-card/60 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">TIME</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">EVENT</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">ACTOR</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">ORG</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">DETAILS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="hover:bg-transparent">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-white/5 animate-pulse w-20" /></td>
                        ))}
                      </tr>
                    ))
                  ) : events.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">NO SECURITY EVENTS FOUND</td></tr>
                  ) : events.map(ev => {
                    const meta = ACTION_META[ev.action];
                    const Icon = meta?.icon ?? Shield;
                    return (
                      <tr key={ev.id} className={`hover:bg-white/5 transition-colors ${ev.action === "login_failed" ? "bg-status-fault/5 border-l-2 border-l-status-fault" : "border-l-2 border-l-transparent"}`}>
                        <td className="px-4 py-3">
                          <div className="font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            {new Date(ev.createdAt).toISOString().slice(0,10)}
                          </div>
                          <div className="font-mono text-[8px] text-muted-foreground/60 uppercase tracking-widest mt-0.5">
                            {new Date(ev.createdAt).toISOString().slice(11,19)} UTC
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${meta?.color ? meta.color.split(" ")[0] : "text-muted-foreground"}`} />
                            <Badge variant="outline" className={`font-mono text-[8px] font-bold uppercase tracking-widest rounded-none border px-1.5 py-0.5 ${meta?.color ?? "bg-card/40 text-muted-foreground border-border/50"}`}>
                              {meta?.label ?? ev.action}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-mono text-[10px] font-bold text-foreground uppercase tracking-widest">{ev.actorName ?? "SYSTEM"}</p>
                          <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-widest mt-0.5">{ev.actorEmail ?? ev.userId ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-[8px] font-bold text-accent-brand uppercase tracking-widest truncate max-w-[100px]">{ev.orgId}</td>
                        <td className="px-4 py-3 font-mono text-[8px] text-muted-foreground/60 uppercase tracking-widest max-w-[200px] truncate">
                          {ev.metadata ? JSON.stringify(ev.metadata).slice(0, 60) : ev.resourceId ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
