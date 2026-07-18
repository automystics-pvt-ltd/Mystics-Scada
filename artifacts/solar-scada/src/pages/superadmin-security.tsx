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
  login:                  { label: "Login",             icon: LogIn,      color: "text-status-normal" },
  login_failed:           { label: "Login Failed",      icon: UserX,      color: "text-status-fault" },
  password_changed:       { label: "Password Changed",  icon: Lock,       color: "text-status-warning" },
  user_created:           { label: "User Created",      icon: UserCheck,  color: "text-blue-400" },
  user_deleted:           { label: "User Deleted",      icon: UserX,      color: "text-status-fault" },
  role_changed:           { label: "Role Changed",      icon: Shield,     color: "text-status-warning" },
  superadmin_login:       { label: "SA Login",          icon: ShieldAlert, color: "text-purple-400" },
  impersonation_started:  { label: "Impersonation",     icon: ShieldAlert, color: "text-status-warning" },
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-primary" />Security</h1>
              <p className="text-sm text-muted-foreground mt-1">Security-relevant events across all organisations · Last 200 events</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "Failed Logins (24h)",     value: summary?.failedLogins24h    ?? 0, color: summary?.failedLogins24h    ? "text-status-fault"    : "text-status-normal", icon: AlertTriangle },
              { label: "Active Users (24h)",       value: summary?.activeUsers24h      ?? 0, color: "text-status-normal",                                                        icon: UserCheck },
              { label: "Super Admin Actions (24h)",value: summary?.superAdminActions24h ?? 0, color: summary?.superAdminActions24h ? "text-status-warning" : "text-muted-foreground", icon: ShieldAlert },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="border border-border rounded-xl p-4 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                {isLoading ? <div className="h-8 bg-muted animate-pulse rounded w-16" /> : (
                  <p className={`text-3xl font-bold font-mono ${color}`}>{value}</p>
                )}
              </div>
            ))}
          </div>

          {/* Threat gauge — simple visual */}
          {summary && (
            <div className={`border rounded-xl p-4 flex items-center gap-4 ${
              summary.failedLogins24h > 10 ? "border-status-fault/30 bg-status-fault/5" :
              summary.failedLogins24h > 3  ? "border-status-warning/30 bg-status-warning/5" :
              "border-border bg-card"
            }`}>
              <Shield className={`h-8 w-8 flex-shrink-0 ${
                summary.failedLogins24h > 10 ? "text-status-fault" :
                summary.failedLogins24h > 3  ? "text-status-warning" : "text-status-normal"
              }`} />
              <div>
                <p className="font-semibold text-sm">
                  {summary.failedLogins24h > 10 ? "⚠ Elevated threat level — multiple failed logins detected" :
                   summary.failedLogins24h > 3  ? "Moderate activity — some failed logins in the last 24h" :
                   "✓ Security posture looks normal"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {summary.total} total security events in history · {summary.failedLogins24h} failed logins in last 24h
                </p>
              </div>
            </div>
          )}

          {/* Event stream */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/30 px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold">Security Event Stream</h2>
              <span className="text-xs text-muted-foreground">{events.length} events</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Time</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Event</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Actor</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Org</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-t border-border/50">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-20" /></td>
                        ))}
                      </tr>
                    ))
                  ) : events.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No security events found</td></tr>
                  ) : events.map(ev => {
                    const meta = ACTION_META[ev.action];
                    const Icon = meta?.icon ?? Shield;
                    return (
                      <tr key={ev.id} className={`border-t border-border/50 hover:bg-muted/20 ${ev.action === "login_failed" ? "bg-status-fault/3" : ""}`}>
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
                          {new Date(ev.createdAt).toLocaleDateString()} {new Date(ev.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Icon className={`h-3.5 w-3.5 ${meta?.color ?? "text-muted-foreground"}`} />
                            <Badge variant="outline" className={`text-[10px] font-mono ${meta?.color ?? ""}`}>
                              {meta?.label ?? ev.action}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="text-sm">{ev.actorName ?? "System"}</p>
                          <p className="text-[10px] text-muted-foreground">{ev.actorEmail ?? ev.userId ?? "—"}</p>
                        </td>
                        <td className="px-4 py-2.5 text-[10px] font-mono text-muted-foreground/60 max-w-[100px] truncate">{ev.orgId}</td>
                        <td className="px-4 py-2.5 text-[10px] font-mono text-muted-foreground/50 max-w-[200px] truncate">
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
