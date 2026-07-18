/**
 * Fleet-wide Audit Logs — /superadmin/audit-logs
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { ClipboardList, Search, ChevronLeft, ChevronRight, RefreshCw, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL as string;

interface AuditLog {
  id: string; orgId: string; userId: string | null;
  actorName: string | null; actorEmail: string | null;
  action: string; resourceType: string | null; resourceId: string | null;
  metadata: Record<string, unknown> | null; createdAt: string;
}

const ACTION_COLOR: Record<string, string> = {
  login:            "bg-status-normal/10 text-status-normal",
  login_failed:     "bg-status-fault/10 text-status-fault",
  user_created:     "bg-blue-500/10 text-blue-400",
  user_deleted:     "bg-status-fault/10 text-status-fault",
  role_changed:     "bg-status-warning/10 text-status-warning",
  password_changed: "bg-status-warning/10 text-status-warning",
};

const PAGE_SIZE = 100;

export default function SuperAdminAuditLogs() {
  const [q, setQ] = useState({ orgId: "", action: "", resourceType: "" });
  const [draft, setDraft] = useState({ orgId: "", action: "", resourceType: "" });
  const [page, setPage] = useState(0);

  const { data, isLoading, refetch } = useQuery<{ logs: AuditLog[]; total: number }>({
    queryKey: ["superadmin", "audit-logs", q, page],
    queryFn: () => {
      const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (q.orgId)        p.set("orgId",        q.orgId);
      if (q.action)       p.set("action",       q.action);
      if (q.resourceType) p.set("resourceType", q.resourceType);
      return fetch(`${BASE}api/superadmin/audit-logs?${p}`, { credentials: "include" }).then(r => r.json()) as Promise<{ logs: AuditLog[]; total: number }>;
    },
    refetchInterval: 60_000,
  });

  const logs  = data?.logs  ?? [];
  const total = data?.total ?? 0;

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="h-6 w-6 text-primary" />Audit Logs</h1>
              <p className="text-sm text-muted-foreground mt-1">Complete activity trail across all organisations — {total.toLocaleString()} entries</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Org ID</label>
              <Input value={draft.orgId} onChange={e => setDraft(d => ({ ...d, orgId: e.target.value }))}
                placeholder="org-abc123…" className="w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Action</label>
              <Input value={draft.action} onChange={e => setDraft(d => ({ ...d, action: e.target.value }))}
                placeholder="login, user_created…" className="w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Resource Type</label>
              <Input value={draft.resourceType} onChange={e => setDraft(d => ({ ...d, resourceType: e.target.value }))}
                placeholder="user, device…" className="w-36" />
            </div>
            <Button onClick={() => { setQ(draft); setPage(0); }} className="gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Apply
            </Button>
            <Button variant="ghost" onClick={() => { setDraft({ orgId: "", action: "", resourceType: "" }); setQ({ orgId: "", action: "", resourceType: "" }); setPage(0); }}>
              Clear
            </Button>
          </div>

          {/* Table */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Timestamp</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Actor</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Action</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Resource</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Org</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i} className="border-t border-border/50">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-20" /></td>
                        ))}
                      </tr>
                    ))
                  ) : logs.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No audit log entries found</td></tr>
                  ) : logs.map(log => (
                    <tr key={log.id} className="border-t border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <div className="text-xs font-mono text-muted-foreground">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground/60">
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-medium">{log.actorName ?? "System"}</p>
                        <p className="text-[10px] text-muted-foreground">{log.actorEmail ?? log.userId ?? "—"}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`text-[10px] font-mono ${ACTION_COLOR[log.action] ?? "bg-muted text-muted-foreground"}`}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {log.resourceType && <span className="font-mono">{log.resourceType}</span>}
                        {log.resourceId && <span className="block text-[10px] text-muted-foreground/60 font-mono truncate max-w-[120px]">{log.resourceId}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground/60 truncate max-w-[100px]">{log.orgId}</td>
                      <td className="px-4 py-2.5 text-[10px] font-mono text-muted-foreground/50 max-w-[200px] truncate">
                        {log.metadata ? JSON.stringify(log.metadata).slice(0, 60) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border px-4 py-2.5 flex items-center justify-between bg-muted/20">
              <p className="text-xs text-muted-foreground">
                {total > 0 ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total.toLocaleString()}` : "0 results"}
              </p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
