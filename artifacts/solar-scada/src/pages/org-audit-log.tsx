import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Download, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { AppLayout } from "@/components/layout";
import { OrgNav } from "@/components/org-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  "user.invite":            "text-blue-400",
  "user.update":            "text-primary",
  "user.disable":           "text-status-fault",
  "org.update":             "text-primary",
  "notifications.update":   "text-primary",
  "alert.acknowledge":      "text-status-warning",
  "alert.resolve":          "text-status-normal",
  "work_order.create":      "text-blue-400",
  "work_order.update":      "text-primary",
  "work_order.close":       "text-status-normal",
  "device.register":        "text-blue-400",
  "device.update":          "text-primary",
  "device.restart":         "text-status-warning",
  "device.sync":            "text-status-normal",
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_COLORS[action] ?? "text-muted-foreground";
  return <code className={`text-xs font-mono ${cls}`}>{action}</code>;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
      <div className="max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            Organisation Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your org profile, users, notifications, and activity log
          </p>
        </div>

        <OrgNav />

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline" className="h-9 gap-1.5"
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
              {(filterResourceType !== "all" || filterFrom || filterTo) && (
                <span className="ml-1 bg-primary text-primary-foreground text-[10px] font-bold px-1 rounded-full">
                  {[filterResourceType !== "all", !!filterFrom, !!filterTo].filter(Boolean).length}
                </span>
              )}
            </Button>
            {(filterResourceType !== "all" || filterFrom || filterTo) && (
              <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" onClick={resetFilters}>
                Clear filters
              </Button>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-9 gap-2" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>

        {/* Filter panel */}
        {filtersOpen && (
          <div className="rounded-lg border border-border bg-muted/20 p-4 mb-4 grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Resource Type</label>
              <Select value={filterResourceType} onValueChange={(v) => { setFilterResourceType(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">From Date</label>
              <Input
                type="date" className="h-8 text-sm"
                value={filterFrom}
                onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">To Date</label>
              <Input
                type="date" className="h-8 text-sm"
                value={filterTo}
                onChange={(e) => { setFilterTo(e.target.value); setPage(1); }}
              />
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-44">Timestamp</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Actor</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Action</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Resource</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading audit log…</td></tr>
              ) : !data?.data.length ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center">
                    <ScrollText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No activity recorded yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Actions taken via the org portal will appear here
                    </p>
                  </td>
                </tr>
              ) : (
                data.data.map((entry) => (
                  <tr key={entry.id} className={`border-b border-border last:border-0 hover:bg-muted/20 ${isFetching ? "opacity-60" : ""}`}>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {timeLabel(entry.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm text-foreground/80 truncate max-w-[180px] block" title={entry.userName}>
                        {entry.userName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {entry.resourceType}
                      </span>
                      <code className="text-xs text-muted-foreground/60 ml-2 font-mono">
                        {entry.resourceId.length > 24
                          ? `${entry.resourceId.slice(0, 12)}…`
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
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">
              Page {page} · {data.data.length} entries
            </p>
            <div className="flex gap-2">
              <Button
                size="sm" variant="outline" className="h-8 gap-1.5"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <Button
                size="sm" variant="outline" className="h-8 gap-1.5"
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.hasMore}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
