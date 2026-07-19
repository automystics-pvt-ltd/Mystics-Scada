/**
 * Login History — /superadmin/login-history
 *
 * Paginated log of all authentication events: logins, logouts,
 * OTP sends, failed attempts, superadmin logins, and impersonations.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import {
  LogIn, LogOut, UserX, ShieldAlert, RefreshCw, Search,
  Key, UserCheck, Clock, ChevronLeft, ChevronRight, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL as string;

interface LoginEvent {
  id: string;
  orgId: string;
  userId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface LoginHistoryData {
  logs: LoginEvent[];
  total: number;
}

const ACTION_META: Record<string, {
  label: string;
  icon: typeof LogIn;
  color: string;
  bg: string;
}> = {
  login:                 { label: "Login",            icon: LogIn,      color: "text-status-normal",  bg: "bg-status-normal/10" },
  login_failed:          { label: "Login Failed",     icon: UserX,      color: "text-status-fault",   bg: "bg-status-fault/10" },
  logout:                { label: "Logout",           icon: LogOut,     color: "text-muted-foreground",bg: "bg-muted/30" },
  otp_sent:              { label: "OTP Sent",         icon: Key,        color: "text-blue-400",        bg: "bg-blue-500/10" },
  otp_verified:          { label: "OTP Verified",     icon: UserCheck,  color: "text-status-normal",  bg: "bg-status-normal/10" },
  superadmin_login:      { label: "SA Login",         icon: ShieldAlert, color: "text-purple-400",    bg: "bg-purple-500/10" },
  impersonation_started: { label: "Impersonation",    icon: ShieldAlert, color: "text-status-warning",bg: "bg-status-warning/10" },
};

const ACTION_FILTERS = [
  { value: "",                    label: "All Events" },
  { value: "login",               label: "Logins" },
  { value: "login_failed",        label: "Failed" },
  { value: "logout",              label: "Logouts" },
  { value: "otp_sent",            label: "OTP Sent" },
  { value: "superadmin_login",    label: "SA Logins" },
  { value: "impersonation_started",label: "Impersonations" },
];

const PAGE_SIZE = 50;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)      return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000)   return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000)  return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SuperAdminLoginHistory() {
  const [search, setSearch]         = useState("");
  const [actionFilter, setAction]   = useState("");
  const [page, setPage]             = useState(0);

  const { data, isLoading, refetch } = useQuery<LoginHistoryData>({
    queryKey: ["superadmin", "login-history", actionFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit:  String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (actionFilter) params.set("action", actionFilter);
      return fetch(`${BASE}api/superadmin/login-history?${params}`, { credentials: "include" })
        .then((r) => r.json()) as Promise<LoginHistoryData>;
    },
    refetchInterval: 30_000,
  });

  const logs       = data?.logs ?? [];
  const total      = data?.total ?? 0;
  const pageCount  = Math.ceil(total / PAGE_SIZE);

  // Client-side search on visible page (name / email)
  const filtered = search.trim()
    ? logs.filter((l) =>
        (l.actorEmail ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (l.actorName  ?? "").toLowerCase().includes(search.toLowerCase()))
    : logs;

  // Summary counts from visible page
  const counts = {
    logins:       logs.filter((l) => l.action === "login").length,
    failed:       logs.filter((l) => l.action === "login_failed").length,
    superadmin:   logs.filter((l) => l.action === "superadmin_login").length,
  };

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <LogIn className="h-6 w-6 text-primary" />
                Login History
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Authentication events across all organisations · {total.toLocaleString()} total records
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Logins (this page)",    value: counts.logins,     color: "text-status-normal" },
              { label: "Failed (this page)",    value: counts.failed,     color: counts.failed ? "text-status-fault" : "text-muted-foreground" },
              { label: "SA Logins (this page)", value: counts.superadmin, color: counts.superadmin ? "text-purple-400" : "text-muted-foreground" },
            ].map(({ label, value, color }) => (
              <div key={label} className="border border-border rounded-xl p-4 bg-card">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className={`text-3xl font-bold font-mono ${color}`}>
                  {isLoading ? "—" : value}
                </p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="pl-8 text-sm h-8"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              {ACTION_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => { setAction(value); setPage(0); }}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    actionFilter === value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Event</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">IP / Device</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 4 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground text-sm">
                      <Clock className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      No authentication events found
                    </td>
                  </tr>
                ) : filtered.map((evt) => {
                  const meta  = ACTION_META[evt.action];
                  const Icon  = meta?.icon ?? LogIn;
                  const color = meta?.color ?? "text-muted-foreground";
                  const bg    = meta?.bg    ?? "bg-muted/30";
                  const ip    = (evt.metadata?.ip as string | undefined) ?? null;
                  const ua    = (evt.metadata?.userAgent as string | undefined) ?? null;
                  const browser = ua
                    ? ua.includes("Firefox") ? "Firefox"
                      : ua.includes("Chrome")  ? "Chrome"
                      : ua.includes("Safari")  ? "Safari"
                      : ua.includes("Edge")    ? "Edge"
                      : "Browser"
                    : null;

                  return (
                    <tr key={evt.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`p-1 rounded ${bg}`}>
                            <Icon className={`h-3.5 w-3.5 ${color}`} />
                          </div>
                          <span className={`text-xs font-medium ${color}`}>
                            {meta?.label ?? evt.action}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium truncate max-w-[180px]">
                          {evt.actorEmail ?? evt.metadata?.email as string ?? "—"}
                        </p>
                        {evt.actorName && (
                          <p className="text-xs text-muted-foreground truncate">{evt.actorName}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {ip ? (
                          <>
                            <p className="text-xs font-mono text-foreground">{ip}</p>
                            {browser && <p className="text-xs text-muted-foreground">{browser}</p>}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-muted-foreground">{timeAgo(evt.createdAt)}</p>
                        <p className="text-[10px] text-muted-foreground/60 font-mono">
                          {new Date(evt.createdAt).toLocaleString()}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="icon"
                  className="h-7 w-7"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-3 py-1 text-xs border border-border rounded">
                  {page + 1} / {pageCount}
                </span>
                <Button
                  variant="outline" size="icon"
                  className="h-7 w-7"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Note about IP capture */}
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-400">
            <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            IP address and browser data are captured when login events include metadata.
            Older events may show "—" for these fields until IP capture middleware is fully deployed.
          </div>

        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
