import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Download, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { AppLayout } from "@/components/layout";
import { OrgNav } from "@/components/org-nav";

const BASE = import.meta.env.BASE_URL;

interface AuditEntry {
  id: string;
  userId: string | null;
  userName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface AuditLogResponse {
  data: AuditEntry[];
  page: number;
  limit: number;
  hasMore: boolean;
}

const RESOURCE_TYPES = [
  "user", "organisation", "role", "alert", "work_order", "device",
  "notification_config", "report",
];

const ACTION_COLORS: Record<string, string> = {
  "user.invite":            "text-accent-brand bg-accent-brand/10 border border-accent-brand/20 shadow-[0_0_5px_hsl(var(--accent-brand)/0.15)]",
  "user.update":            "text-primary bg-primary/10 border border-primary/20",
  "user.disable":           "text-status-fault bg-status-fault/10 border border-status-fault/20 shadow-[0_0_5px_hsl(var(--status-fault)/0.15)]",
  "org.update":             "text-primary bg-primary/10 border border-primary/20",
  "notifications.update":   "text-primary bg-primary/10 border border-primary/20",
  "alert.acknowledge":      "text-status-warning bg-status-warning/10 border border-status-warning/20 shadow-[0_0_5px_hsl(var(--status-warning)/0.15)]",
  "alert.resolve":          "text-status-normal bg-status-normal/10 border border-status-normal/20 shadow-[0_0_5px_hsl(var(--status-normal)/0.15)]",
  "work_order.create":      "text-accent-brand bg-accent-brand/10 border border-accent-brand/20",
  "work_order.update":      "text-primary bg-primary/10 border border-primary/20",
  "work_order.close":       "text-status-normal bg-status-normal/10 border border-status-normal/20",
  "device.register":        "text-accent-brand bg-accent-brand/10 border border-accent-brand/20",
  "device.update":          "text-primary bg-primary/10 border border-primary/20",
  "device.restart":         "text-status-warning bg-status-warning/10 border border-status-warning/20",
  "device.sync":            "text-status-normal bg-status-normal/10 border border-status-normal/20",
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_COLORS[action] ?? "text-muted-foreground border border-border bg-muted/30";
  return <code className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${cls}`}>{action}</code>;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).toUpperCase();
}

export default function OrgAuditLogPage() {
  const [page, setPage] = useState(1);
  const [filterResourceType, setFilterResourceType] = useState("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const LIMIT = 50;

  const params = new URLSearchParams({
    page: String(page),
    limit: String(LIMIT),
    ...(filterResourceType !== "all" && { resourceType: filterResourceType }),
    ...(filterFrom && { from: filterFrom }),
    ...(filterTo && { to: filterTo }),
  });

  const { data, isLoading, isFetching } = useQuery<AuditLogResponse>({
    queryKey: ["org-audit-log", page, filterResourceType, filterFrom, filterTo],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/org/audit-log?${params.toString()}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load audit log");
      return r.json() as Promise<AuditLogResponse>;
    },
    staleTime: 60_000,
  });

  function exportCsv() {
    const exportParams = new URLSearchParams(params);
    exportParams.set("format", "csv");
    exportParams.delete("page");
    exportParams.delete("limit");
    window.open(`${BASE}api/org/audit-log?${exportParams.toString()}`, "_blank");
  }

  function resetFilters() {
    setFilterResourceType("all");
    setFilterFrom("");
    setFilterTo("");
    setPage(1);
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto flex flex-col space-y-6 h-full">
        <div className="animate-fade-up">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <ScrollText className="h-7 w-7 text-accent-brand" />
            Organisation Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Manage your org profile, users, notifications, and activity log
          </p>
        </div>

        <OrgNav />

        {/* Toolbar */}
        <div className="flex items-center justify-between animate-fade-up" style={{ animationDelay: '50ms' }}>
          <div className="flex items-center gap-3">
            <button
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm ${filtersOpen ? "bg-accent-brand/10 border-accent-brand/40 text-accent-brand" : "bg-card border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
              {(filterResourceType !== "all" || filterFrom || filterTo) && (
                <span className="ml-1 bg-accent-brand text-background text-[9px] px-1.5 py-0.5 rounded shadow-[0_0_5px_hsl(var(--accent-brand)/0.3)]">
                  {[filterResourceType !== "all", !!filterFrom, !!filterTo].filter(Boolean).length}
                </span>
              )}
            </button>
            {(filterResourceType !== "all" || filterFrom || filterTo) && (
              <button className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:underline transition-all" onClick={resetFilters}>
                Clear
              </button>
            )}
          </div>
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border/50 bg-card shadow-sm text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>

        {/* Filter panel */}
        {filtersOpen && (
          <div className="rounded-xl border border-card-border bg-card/40 backdrop-blur-md p-6 grid grid-cols-1 md:grid-cols-3 gap-6 shadow-sm animate-fade-up" style={{ animationDelay: '100ms' }}>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Resource Type</label>
              <select className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm font-medium text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all" value={filterResourceType} onChange={(e) => { setFilterResourceType(e.target.value); setPage(1); }}>
                <option value="all">ALL TYPES</option>
                {RESOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ").toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">From Date</label>
              <input
                type="date"
                className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm font-mono text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all [color-scheme:dark]"
                value={filterFrom}
                onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">To Date</label>
              <input
                type="date"
                className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm font-mono text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all [color-scheme:dark]"
                value={filterTo}
                onChange={(e) => { setFilterTo(e.target.value); setPage(1); }}
              />
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-card-border bg-card/40 backdrop-blur-md overflow-hidden shadow-sm animate-fade-up" style={{ animationDelay: '150ms' }}>
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-border/50 bg-muted/10">
                <th className="text-left px-5 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest w-48 whitespace-nowrap">Timestamp</th>
                <th className="text-left px-5 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Actor</th>
                <th className="text-left px-5 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Action</th>
                <th className="text-left px-5 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Resource Target</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/30 bg-card/20"><td colSpan={4} className="px-5 py-4"><div className="h-5 w-full bg-muted/30 rounded animate-shimmer" style={{ width: `${60 + (i * 13) % 30}%` }} /></td></tr>
                ))
              ) : !data?.data.length ? (
                <tr>
                  <td colSpan={4} className="px-5 py-20 text-center bg-card/20 border-dashed">
                    <ScrollText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-sm font-bold text-foreground mb-1 uppercase tracking-wider">No activity recorded</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Actions taken via the platform will appear here
                    </p>
                  </td>
                </tr>
              ) : (
                data.data.map((entry) => (
                  <tr key={entry.id} className={`border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors bg-card/20 ${isFetching ? "opacity-60 grayscale-[0.3]" : ""}`}>
                    <td className="px-5 py-4 text-[10px] font-bold font-mono text-muted-foreground tabular-nums whitespace-nowrap tracking-widest">
                      {timeLabel(entry.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm font-bold text-foreground truncate max-w-[200px] block" title={entry.userName}>
                        {entry.userName}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-5 py-4 flex items-center gap-3">
                      <span className="text-[9px] font-bold uppercase tracking-widest border border-border/50 bg-muted/30 px-2 py-0.5 rounded text-muted-foreground">
                        {entry.resourceType.replace(/_/g, " ")}
                      </span>
                      <code className="text-[10px] font-bold text-muted-foreground/80 font-mono tracking-widest">
                        {entry.resourceId.length > 24
                          ? `${entry.resourceId.slice(0, 16)}…`
                          : entry.resourceId}
                      </code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(data && (data.hasMore || page > 1)) && (
          <div className="flex items-center justify-between px-2 pt-2 pb-6 animate-fade-up" style={{ animationDelay: '200ms' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              PAGE <span className="text-foreground font-mono">{page}</span> · <span className="text-foreground font-mono">{data.data.length}</span> ENTRIES
            </p>
            <div className="flex gap-2">
              <button
                className="flex items-center justify-center h-10 w-10 rounded-lg border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                className="flex items-center justify-center h-10 w-10 rounded-lg border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.hasMore}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
