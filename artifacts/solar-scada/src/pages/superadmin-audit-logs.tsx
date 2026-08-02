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
  login:            "bg-status-normal/10 text-status-normal border-status-normal",
  login_failed:     "bg-status-fault/10 text-status-fault border-status-fault",
  user_created:     "bg-accent-brand/10 text-accent-brand border-accent-brand",
  user_deleted:     "bg-status-fault/10 text-status-fault border-status-fault",
  role_changed:     "bg-status-warning/10 text-status-warning border-status-warning",
  password_changed: "bg-status-warning/10 text-status-warning border-status-warning",
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
          <div className="flex items-center justify-between border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <div>
              <h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">
                <ClipboardList className="h-6 w-6 text-accent-brand" />
                AUDIT LOGS
              </h1>
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">COMPLETE ACTIVITY TRAIL ACROSS ALL ORGANISATIONS // {total.toLocaleString()} ENTRIES</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="font-mono text-[9px] uppercase tracking-widest border-accent-brand/30 text-accent-brand hover:bg-accent-brand/10 rounded-none gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> REFRESH
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-3 flex-wrap items-end bg-card/40 border border-border/50 p-4">
            <div>
              <label className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">ORG ID</label>
              <Input value={draft.orgId} onChange={e => setDraft(d => ({ ...d, orgId: e.target.value }))}
                placeholder="ORG-ABC123..." className="w-40 font-mono text-xs bg-card/60 border-border/50 rounded-none focus-visible:ring-accent-brand uppercase" />
            </div>
            <div>
              <label className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">ACTION</label>
              <Input value={draft.action} onChange={e => setDraft(d => ({ ...d, action: e.target.value }))}
                placeholder="LOGIN, USER_CREATED..." className="w-40 font-mono text-xs bg-card/60 border-border/50 rounded-none focus-visible:ring-accent-brand uppercase" />
            </div>
            <div>
              <label className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">RESOURCE TYPE</label>
              <Input value={draft.resourceType} onChange={e => setDraft(d => ({ ...d, resourceType: e.target.value }))}
                placeholder="USER, DEVICE..." className="w-40 font-mono text-xs bg-card/60 border-border/50 rounded-none focus-visible:ring-accent-brand uppercase" />
            </div>
            <Button onClick={() => { setQ(draft); setPage(0); }} className="gap-2 font-mono text-[9px] uppercase tracking-widest bg-accent-brand/10 text-accent-brand border border-accent-brand hover:bg-accent-brand hover:text-black rounded-none transition-colors">
              <Filter className="h-3.5 w-3.5" /> APPLY FILTER
            </Button>
            <Button variant="outline" onClick={() => { setDraft({ orgId: "", action: "", resourceType: "" }); setQ({ orgId: "", action: "", resourceType: "" }); setPage(0); }} className="font-mono text-[9px] uppercase tracking-widest border-border/50 text-muted-foreground hover:bg-white/5 rounded-none">
              CLEAR
            </Button>
          </div>

          {/* Table */}
          <div className="border border-border/50 bg-card/40">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-card/60 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">TIMESTAMP</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">ACTOR</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">ACTION</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">RESOURCE</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">ORG</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">METADATA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {isLoading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i} className="hover:bg-transparent">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-white/5 animate-pulse w-20" /></td>
                        ))}
                      </tr>
                    ))
                  ) : logs.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">NO AUDIT LOG ENTRIES FOUND</td></tr>
                  ) : logs.map(log => (
                    <tr key={log.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          {new Date(log.createdAt).toISOString().slice(0,10)}
                        </div>
                        <div className="font-mono text-[8px] text-muted-foreground/60 uppercase tracking-widest mt-0.5">
                          {new Date(log.createdAt).toISOString().slice(11,19)} UTC
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-[10px] font-bold text-foreground uppercase tracking-widest">{log.actorName ?? "SYSTEM"}</p>
                        <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-widest mt-0.5">{log.actorEmail ?? log.userId ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`font-mono text-[8px] font-bold uppercase tracking-widest rounded-none border ${ACTION_COLOR[log.action] ?? "bg-card/40 text-muted-foreground border-border/50"}`}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {log.resourceType && <span className="font-mono text-[10px] font-bold text-foreground uppercase tracking-widest">{log.resourceType}</span>}
                        {log.resourceId && <span className="block font-mono text-[8px] text-muted-foreground/60 uppercase tracking-widest truncate max-w-[120px] mt-0.5">{log.resourceId}</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-[8px] font-bold text-accent-brand uppercase tracking-widest truncate max-w-[100px]">{log.orgId}</td>
                      <td className="px-4 py-3 font-mono text-[8px] text-muted-foreground/60 uppercase tracking-widest max-w-[200px] truncate">
                        {log.metadata ? JSON.stringify(log.metadata).slice(0, 60) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border/50 px-4 py-3 flex items-center justify-between bg-card">
              <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                {total > 0 ? `${page * PAGE_SIZE + 1} TO ${Math.min((page + 1) * PAGE_SIZE, total)} OF ${total.toLocaleString()}` : "NO RESULTS"}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-none border-border/50 text-muted-foreground hover:text-accent-brand hover:border-accent-brand" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-none border-border/50 text-muted-foreground hover:text-accent-brand hover:border-accent-brand" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
