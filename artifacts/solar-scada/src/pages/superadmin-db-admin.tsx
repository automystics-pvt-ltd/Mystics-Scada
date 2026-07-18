/**
 * Database Administration Console — /superadmin/db
 * Full DB management: Record Browser, SQL Console, Global Search,
 * Bulk Ops, Import/Export, Integrity, Maintenance, Danger Zone.
 */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import {
  Database, Table2, Terminal, Search, Download, Upload,
  ShieldCheck, Wrench, AlertTriangle, Trash2, Edit2, RefreshCw,
  Play, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  FileJson, FileText, Loader2, Copy, X, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL as string;
const H = { "Content-Type": "application/json", "X-SCADA-Request": "1" } as const;

const TABS = [
  { id: "browser",   label: "Record Browser",  icon: Table2 },
  { id: "sql",       label: "SQL Console",      icon: Terminal },
  { id: "search",    label: "Global Search",    icon: Search },
  { id: "bulk",      label: "Bulk Operations",  icon: RefreshCw },
  { id: "io",        label: "Import / Export",  icon: Download },
  { id: "integrity", label: "Integrity",         icon: ShieldCheck },
  { id: "stats",     label: "DB Stats",          icon: Database },
  { id: "maintain",  label: "Maintenance",       icon: Wrench },
  { id: "danger",    label: "Danger Zone",       icon: AlertTriangle },
] as const;

type TabId = typeof TABS[number]["id"];

interface TableInfo { name: string; row_count: number }
interface ColInfo { name: string; dataType: string; isNullable: string; columnDefault: string | null; isPrimaryKey: boolean }
interface RecordsResult { records: Record<string, unknown>[]; total: number; columns: string[] }
interface IntegrityCheck { name: string; description: string; count: number; status: "ok" | "warning" | "error" }

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  return String(v);
}

export default function SuperAdminDbAdmin() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>("browser");

  // ── Table list ──────────────────────────────────────────────────────────────
  const [tableFilter, setTableFilter] = useState("");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const { data: tables = [], refetch: refetchTables } = useQuery<TableInfo[]>({
    queryKey: ["superadmin", "db", "tables"],
    queryFn: () => fetch(`${BASE}api/superadmin/db/tables`, { credentials: "include" }).then(r => r.json()) as Promise<TableInfo[]>,
  });

  const filteredTables = tables.filter(t => t.name.includes(tableFilter.toLowerCase()));

  // ── Record Browser ──────────────────────────────────────────────────────────
  const [page, setPage]         = useState(0);
  const [editRow, setEditRow]   = useState<Record<string, unknown> | null>(null);
  const [editField, setEditField] = useState<string>("");
  const [editVal, setEditVal]   = useState<string>("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const { data: schema }   = useQuery<{ columns: ColInfo[] }>({
    queryKey: ["superadmin", "db", "schema", selectedTable],
    queryFn: () => fetch(`${BASE}api/superadmin/db/tables/${selectedTable}/schema`, { credentials: "include" }).then(r => r.json()) as Promise<{ columns: ColInfo[] }>,
    enabled: !!selectedTable,
  });

  const { data: records, isLoading: loadingRecords, refetch: refetchRecords } = useQuery<RecordsResult>({
    queryKey: ["superadmin", "db", "records", selectedTable, page],
    queryFn: () => fetch(`${BASE}api/superadmin/db/tables/${selectedTable}/records?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { credentials: "include" }).then(r => r.json()) as Promise<RecordsResult>,
    enabled: !!selectedTable,
  });

  const patchMut = useMutation({
    mutationFn: ({ field, value }: { field: string; value: string }) =>
      fetch(`${BASE}api/superadmin/db/tables/${selectedTable}/records/${(editRow as Record<string,unknown>)["id"]}`, {
        method: "PATCH", credentials: "include", headers: H,
        body: JSON.stringify({ field, value }),
      }).then(r => r.json()),
    onSuccess: () => { void refetchRecords(); setEditRow(null); toast({ title: "Record updated" }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`${BASE}api/superadmin/db/tables/${selectedTable}/records/${id}`, {
        method: "DELETE", credentials: "include", headers: H,
      }).then(r => r.json()),
    onSuccess: () => { void refetchRecords(); setDeleteId(null); toast({ title: "Record deleted", variant: "destructive" }); },
  });

  // ── SQL Console ─────────────────────────────────────────────────────────────
  const [sqlInput, setSqlInput]   = useState("SELECT * FROM organizations LIMIT 10;");
  const [sqlResult, setSqlResult] = useState<{ rows: Record<string,unknown>[]; rowCount: number; executionMs: number; error?: string } | null>(null);
  const [sqlRunning, setSqlRunning] = useState(false);

  async function runSql() {
    setSqlRunning(true);
    const r = await fetch(`${BASE}api/superadmin/db/query`, {
      method: "POST", credentials: "include", headers: H,
      body: JSON.stringify({ sql: sqlInput }),
    });
    const d = await r.json() as typeof sqlResult;
    setSqlResult(d);
    setSqlRunning(false);
  }

  const QUICK_TEMPLATES = [
    { label: "List tables",       sql: "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;" },
    { label: "DB size",           sql: "SELECT pg_size_pretty(pg_database_size(current_database())) AS size;" },
    { label: "Active connections",sql: "SELECT pid, usename, state, query FROM pg_stat_activity WHERE state='active' LIMIT 20;" },
    { label: "Largest tables",    sql: "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;" },
    { label: "Long running queries",sql:"SELECT pid, now()-query_start AS duration, query FROM pg_stat_activity WHERE state='active' AND now()-query_start > interval '1s' ORDER BY duration DESC;" },
    { label: "Index usage",       sql: "SELECT schemaname, tablename, indexname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan DESC LIMIT 20;" },
  ];

  // ── Global Search ───────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm]     = useState("");
  const [searchTable, setSearchTable]   = useState("all");
  const [searchResults, setSearchResults] = useState<{ table: string; rows: Record<string,unknown>[] }[]>([]);
  const [searching, setSearching]       = useState(false);

  async function runGlobalSearch() {
    if (!searchTerm.trim()) return;
    setSearching(true);
    const targets = searchTable === "all"
      ? tables.filter(t => !t.name.includes("reading") && !t.name.includes("comm_log")).map(t => t.name).slice(0, 8)
      : [searchTable];
    const results: typeof searchResults = [];
    for (const t of targets) {
      try {
        const r = await fetch(`${BASE}api/superadmin/db/query`, {
          method: "POST", credentials: "include", headers: H,
          body: JSON.stringify({ sql: `SELECT * FROM "${t}" WHERE CAST(to_json("${t}") AS TEXT) ILIKE '%${searchTerm.replace(/'/g, "''")}%' LIMIT 5` }),
        });
        const d = await r.json() as { rows: Record<string,unknown>[] };
        if (d.rows?.length) results.push({ table: t, rows: d.rows });
      } catch { /* skip table */ }
    }
    setSearchResults(results);
    setSearching(false);
  }

  // ── Bulk Operations ─────────────────────────────────────────────────────────
  const [bulkConfirm, setBulkConfirm] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  const BULK_OPS = [
    { id: "clear_old_audit",   label: "Clear audit logs > 90 days",   description: "Permanently deletes audit_logs older than 90 days.", sql: "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days'", color: "text-status-warning", danger: false },
    { id: "clear_comm_logs",   label: "Clear device comm logs > 30 days", description: "Deletes device_comm_logs older than 30 days.", sql: "DELETE FROM device_comm_logs WHERE created_at < NOW() - INTERVAL '30 days'", color: "text-status-warning", danger: false },
    { id: "clear_old_readings",label: "Clear device readings > 7 days",   description: "Deletes device_readings older than 7 days.", sql: "DELETE FROM device_readings WHERE recorded_at < NOW() - INTERVAL '7 days'", color: "text-orange-400", danger: false },
    { id: "clear_closed_wo",   label: "Archive closed work orders",        description: "Deletes work_orders with status='closed' or 'verified'.", sql: "DELETE FROM work_orders WHERE status IN ('closed','verified')", color: "text-orange-400", danger: true },
  ];

  async function runBulkOp(op: typeof BULK_OPS[0]) {
    setBulkRunning(true);
    const r = await fetch(`${BASE}api/superadmin/db/query`, {
      method: "POST", credentials: "include", headers: H,
      body: JSON.stringify({ sql: op.sql }),
    });
    const d = await r.json() as { rowCount: number; error?: string };
    setBulkRunning(false);
    setBulkConfirm(null);
    if (d.error) toast({ title: "Bulk op failed", description: d.error, variant: "destructive" });
    else toast({ title: "Bulk operation complete", description: `${d.rowCount ?? 0} rows affected` });
    void qc.invalidateQueries({ queryKey: ["superadmin", "db"] });
  }

  // ── Import / Export ─────────────────────────────────────────────────────────
  const [exportTable, setExportTable] = useState("");
  const [exportFmt, setExportFmt]     = useState<"json" | "csv">("json");
  const fileRef = useRef<HTMLInputElement>(null);

  function doExport() {
    if (!exportTable) return;
    window.open(`${BASE}api/superadmin/db/export/${exportTable}?format=${exportFmt}`, "_blank");
  }

  // ── Integrity ───────────────────────────────────────────────────────────────
  const [integrityResult, setIntegrityResult] = useState<{ checks: IntegrityCheck[]; passedAll: boolean; checkedAt: string } | null>(null);
  const [integrityRunning, setIntegrityRunning] = useState(false);

  async function runIntegrity() {
    setIntegrityRunning(true);
    const r = await fetch(`${BASE}api/superadmin/db/integrity`, { credentials: "include" });
    setIntegrityResult(await r.json() as typeof integrityResult);
    setIntegrityRunning(false);
  }

  // ── DB Stats ─────────────────────────────────────────────────────────────────
  const { data: dbStats } = useQuery<{ dbSize: string; tables: Record<string,unknown>[]; activeConnections: number }>({
    queryKey: ["superadmin", "db", "stats"],
    queryFn: () => fetch(`${BASE}api/superadmin/db/stats`, { credentials: "include" }).then(r => r.json()) as Promise<{ dbSize: string; tables: Record<string,unknown>[]; activeConnections: number }>,
    enabled: tab === "stats",
    refetchInterval: 30_000,
  });

  // ── Maintenance ─────────────────────────────────────────────────────────────
  const [maintResult, setMaintResult] = useState<string | null>(null);
  const [maintRunning, setMaintRunning] = useState(false);

  async function runVacuum() {
    setMaintRunning(true);
    const r = await fetch(`${BASE}api/superadmin/db/maintenance/vacuum`, { method: "POST", credentials: "include", headers: H });
    const d = await r.json() as { ok: boolean; message: string };
    setMaintResult(d.message);
    setMaintRunning(false);
    toast({ title: "Maintenance complete", description: d.message });
  }

  // ── Danger Zone ─────────────────────────────────────────────────────────────
  const [truncateTable, setTruncateTable] = useState("");
  const [truncateConfirmInput, setTruncateConfirmInput] = useState("");
  const [truncating, setTruncating] = useState(false);

  async function doTruncate() {
    if (truncateConfirmInput !== truncateTable) return;
    setTruncating(true);
    await fetch(`${BASE}api/superadmin/db/query`, {
      method: "POST", credentials: "include", headers: H,
      body: JSON.stringify({ sql: `TRUNCATE TABLE "${truncateTable}" RESTART IDENTITY CASCADE` }),
    });
    setTruncating(false);
    setTruncateTable(""); setTruncateConfirmInput("");
    toast({ title: `Table ${truncateTable} truncated`, variant: "destructive" });
    void refetchTables();
  }

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Database className="h-6 w-6 text-primary" />
                Database Administration Console
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Full-featured DB management — browse, query, schema inspect, bulk ops, import/export, integrity checks
              </p>
            </div>
            <Badge className="bg-status-fault text-white text-[10px] font-bold px-2 py-1">
              ⊗ SUPER ADMIN ONLY
            </Badge>
          </div>

          {/* Tab bar */}
          <div className="border-b border-border -mx-0">
            <nav className="flex gap-0 overflow-x-auto scrollbar-none">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    tab === t.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {/* ── RECORD BROWSER ─────────────────────────────────────────────── */}
          {tab === "browser" && (
            <div className="flex gap-4 h-[calc(100vh-280px)] min-h-[500px]">
              {/* Table sidebar */}
              <div className="w-56 flex flex-col border border-border rounded-xl overflow-hidden bg-card flex-shrink-0">
                <div className="p-2 border-b border-border flex items-center gap-1">
                  <Input
                    placeholder="Filter tables..."
                    value={tableFilter}
                    onChange={e => setTableFilter(e.target.value)}
                    className="h-7 text-xs"
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => void refetchTables()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredTables.map(t => (
                    <button
                      key={t.name}
                      onClick={() => { setSelectedTable(t.name); setPage(0); }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left transition-colors ${
                        selectedTable === t.name
                          ? "bg-primary/10 text-primary border-l-2 border-l-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="ml-1 text-[10px] font-mono opacity-60">{(t.row_count ?? 0).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Records panel */}
              <div className="flex-1 flex flex-col border border-border rounded-xl overflow-hidden bg-card min-w-0">
                {!selectedTable ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <Database className="h-10 w-10 opacity-30" />
                    <p className="text-sm">Select a table to browse or inspect its schema</p>
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm">{selectedTable}</span>
                        {records && (
                          <span className="text-[10px] text-muted-foreground">
                            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, records.total)} of {records.total.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => void refetchRecords()}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={!records || (page + 1) * PAGE_SIZE >= records.total} onClick={() => setPage(p => p + 1)}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Records table */}
                    <div className="flex-1 overflow-auto">
                      {loadingRecords ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : records && records.records.length > 0 ? (
                        <table className="w-full text-xs border-collapse">
                          <thead className="bg-muted/50 sticky top-0 z-10">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground border-b border-border w-16">Actions</th>
                              {records.columns.map(col => (
                                <th key={col} className="px-3 py-1.5 text-left font-medium text-muted-foreground border-b border-border whitespace-nowrap">
                                  {col}
                                  {schema?.columns.find(c => c.name === col)?.isPrimaryKey && (
                                    <span className="ml-1 text-[9px] text-primary font-bold">PK</span>
                                  )}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {records.records.map((row, i) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                                <td className="px-2 py-1">
                                  <div className="flex items-center gap-0.5">
                                    <button onClick={() => { setEditRow(row); setEditField(""); setEditVal(""); }} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                    <button onClick={() => setDeleteId(String(row["id"] ?? i))} className="p-1 rounded hover:bg-status-fault/10 text-muted-foreground hover:text-status-fault">
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </td>
                                {records.columns.map(col => (
                                  <td key={col} className="px-3 py-1 font-mono text-foreground/80 max-w-[200px] truncate" title={fmt(row[col])}>
                                    {row[col] === null ? <span className="text-muted-foreground/40 italic">null</span> : fmt(row[col])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No records</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── SQL CONSOLE ─────────────────────────────────────────────────── */}
          {tab === "sql" && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {QUICK_TEMPLATES.map(tpl => (
                  <button key={tpl.label} onClick={() => setSqlInput(tpl.sql)}
                    className="text-[11px] px-2 py-1 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border transition-colors">
                    {tpl.label}
                  </button>
                ))}
              </div>
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="bg-muted/30 px-3 py-1.5 border-b border-border flex items-center gap-2 text-xs text-muted-foreground">
                  <Terminal className="h-3.5 w-3.5" />
                  <span className="font-mono">SQL Console — superadmin access, all statements permitted</span>
                </div>
                <textarea
                  value={sqlInput}
                  onChange={e => setSqlInput(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  className="w-full bg-[#0d1117] text-[#e6edf3] font-mono text-sm p-4 resize-none outline-none"
                  placeholder="SELECT * FROM organizations LIMIT 10;"
                  onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void runSql(); } }}
                />
                <div className="bg-muted/30 border-t border-border px-3 py-2 flex items-center gap-2">
                  <Button size="sm" onClick={() => void runSql()} disabled={sqlRunning} className="gap-1.5 h-7">
                    {sqlRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    Run (Ctrl+Enter)
                  </Button>
                  {sqlResult && !sqlResult.error && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {sqlResult.rowCount} rows · {sqlResult.executionMs}ms
                    </span>
                  )}
                </div>
              </div>

              {sqlResult && (
                <div className="border border-border rounded-xl overflow-hidden">
                  {sqlResult.error ? (
                    <div className="p-4 bg-status-fault/5 border-border text-status-fault text-sm font-mono">
                      <div className="font-bold mb-1">Error</div>
                      {sqlResult.error}
                    </div>
                  ) : sqlResult.rows.length === 0 ? (
                    <div className="p-4 text-muted-foreground text-sm">Query returned 0 rows.</div>
                  ) : (
                    <div className="overflow-auto max-h-[400px]">
                      <table className="w-full text-xs border-collapse">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            {Object.keys(sqlResult.rows[0]!).map(col => (
                              <th key={col} className="px-3 py-1.5 text-left font-medium text-muted-foreground border-b border-border whitespace-nowrap">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sqlResult.rows.map((row, i) => (
                            <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                              {Object.values(row).map((v, j) => (
                                <td key={j} className="px-3 py-1 font-mono text-foreground/80 max-w-[240px] truncate">
                                  {v === null ? <span className="text-muted-foreground/40 italic">null</span> : fmt(v)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── GLOBAL SEARCH ───────────────────────────────────────────────── */}
          {tab === "search" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="Search across tables..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && void runGlobalSearch()} className="flex-1" />
                <select value={searchTable} onChange={e => setSearchTable(e.target.value)}
                  className="border border-border rounded-md bg-background text-sm px-2">
                  <option value="all">All tables</option>
                  {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
                <Button onClick={() => void runGlobalSearch()} disabled={searching} className="gap-1.5">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Search
                </Button>
              </div>
              {searchResults.map(sr => (
                <div key={sr.table} className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center gap-2 text-sm font-mono font-semibold">
                    <Table2 className="h-4 w-4 text-primary" />
                    {sr.table}
                    <span className="text-muted-foreground font-normal text-xs ml-1">{sr.rows.length} match{sr.rows.length !== 1 ? "es" : ""}</span>
                  </div>
                  <div className="overflow-auto max-h-[300px]">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>{Object.keys(sr.rows[0] ?? {}).slice(0, 8).map(c => (
                          <th key={c} className="px-3 py-1.5 text-left text-muted-foreground border-b border-border">{c}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {sr.rows.map((row, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                            {Object.values(row).slice(0, 8).map((v, j) => (
                              <td key={j} className="px-3 py-1 font-mono text-foreground/80 max-w-[200px] truncate">{fmt(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {searchResults.length === 0 && searchTerm && !searching && (
                <p className="text-muted-foreground text-sm text-center py-8">No results found for "{searchTerm}"</p>
              )}
            </div>
          )}

          {/* ── BULK OPERATIONS ─────────────────────────────────────────────── */}
          {tab === "bulk" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Execute bulk data operations. All operations are immediate and irreversible.</p>
              {BULK_OPS.map(op => (
                <div key={op.id} className={`border rounded-xl p-4 ${op.danger ? "border-status-fault/30" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className={`font-semibold text-sm ${op.color}`}>{op.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{op.description}</p>
                      <code className="text-[10px] text-muted-foreground/60 font-mono mt-1 block">{op.sql}</code>
                    </div>
                    {bulkConfirm === op.id ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">Confirm?</span>
                        <Button size="sm" variant="destructive" className="h-7" onClick={() => void runBulkOp(op)} disabled={bulkRunning}>
                          {bulkRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Execute"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => setBulkConfirm(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant={op.danger ? "destructive" : "outline"} className="h-7 flex-shrink-0" onClick={() => setBulkConfirm(op.id)}>
                        Run
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── IMPORT / EXPORT ─────────────────────────────────────────────── */}
          {tab === "io" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border border-border rounded-xl p-5 space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><Download className="h-4 w-4 text-primary" />Export</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Table</label>
                    <select value={exportTable} onChange={e => setExportTable(e.target.value)}
                      className="w-full border border-border rounded-md bg-background text-sm px-3 py-2">
                      <option value="">Select table…</option>
                      {tables.map(t => <option key={t.name} value={t.name}>{t.name} ({t.row_count ?? 0} rows)</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Format</label>
                    <div className="flex gap-2">
                      <button onClick={() => setExportFmt("json")} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border text-sm transition-colors ${exportFmt === "json" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                        <FileJson className="h-3.5 w-3.5" /> JSON
                      </button>
                      <button onClick={() => setExportFmt("csv")} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border text-sm transition-colors ${exportFmt === "csv" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                        <FileText className="h-3.5 w-3.5" /> CSV
                      </button>
                    </div>
                  </div>
                  <Button onClick={doExport} disabled={!exportTable} className="w-full gap-2">
                    <Download className="h-4 w-4" /> Download {exportFmt.toUpperCase()}
                  </Button>
                </div>
              </div>
              <div className="border border-border rounded-xl p-5 space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><Upload className="h-4 w-4 text-primary" />Import</h3>
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>CSV import coming soon</p>
                  <p className="text-xs mt-1">Use the SQL Console to import data via COPY or INSERT statements</p>
                </div>
              </div>
            </div>
          )}

          {/* ── INTEGRITY ───────────────────────────────────────────────────── */}
          {tab === "integrity" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Button onClick={() => void runIntegrity()} disabled={integrityRunning} className="gap-2">
                  {integrityRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Run Integrity Checks
                </Button>
                {integrityResult && (
                  <span className={`text-sm font-semibold ${integrityResult.passedAll ? "text-status-normal" : "text-status-warning"}`}>
                    {integrityResult.passedAll ? "✓ All checks passed" : `⚠ ${integrityResult.checks.filter(c => c.status !== "ok").length} issues found`}
                  </span>
                )}
              </div>
              {integrityResult && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {integrityResult.checks.map(check => (
                    <div key={check.name} className={`border rounded-xl p-4 flex items-start gap-3 ${check.status === "ok" ? "border-status-normal/20 bg-status-normal/5" : "border-status-warning/30 bg-status-warning/5"}`}>
                      {check.status === "ok"
                        ? <CheckCircle2 className="h-4 w-4 text-status-normal mt-0.5 flex-shrink-0" />
                        : <AlertTriangle className="h-4 w-4 text-status-warning mt-0.5 flex-shrink-0" />}
                      <div>
                        <p className="text-sm font-semibold">{check.name}</p>
                        <p className="text-xs text-muted-foreground">{check.description}</p>
                        {check.count > 0 && (
                          <p className="text-xs font-mono text-status-warning mt-1">{check.count} issue{check.count !== 1 ? "s" : ""} found</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── DB STATS ────────────────────────────────────────────────────── */}
          {tab === "stats" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: "Database Size",         value: dbStats?.dbSize ?? "—" },
                  { label: "Active Connections",     value: String(dbStats?.activeConnections ?? "—") },
                  { label: "Tables",                 value: String(tables.length) },
                ].map(kpi => (
                  <div key={kpi.label} className="border border-border rounded-xl p-4 bg-card">
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-2xl font-bold font-mono mt-1">{kpi.value}</p>
                  </div>
                ))}
              </div>
              {dbStats?.tables && Array.isArray(dbStats.tables) && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted/30 px-4 py-2 border-b border-border text-sm font-semibold">Table Sizes (top 20)</div>
                  <div className="overflow-auto max-h-[400px]">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          {["name","size","rows","dead_rows"].map(c => (
                            <th key={c} className="px-3 py-1.5 text-left font-medium text-muted-foreground border-b border-border">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(dbStats.tables as Record<string,unknown>[]).map((row, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                            {["name","size","rows","dead_rows"].map(c => (
                              <td key={c} className="px-3 py-1 font-mono text-foreground/80">{fmt(row[c])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── MAINTENANCE ─────────────────────────────────────────────────── */}
          {tab === "maintain" && (
            <div className="space-y-4">
              <div className="border border-border rounded-xl p-5">
                <h3 className="font-semibold mb-1">VACUUM ANALYZE</h3>
                <p className="text-sm text-muted-foreground mb-3">Reclaims storage occupied by dead tuples and updates statistics for the query planner.</p>
                <Button onClick={() => void runVacuum()} disabled={maintRunning} className="gap-2">
                  {maintRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                  Run VACUUM ANALYZE
                </Button>
                {maintResult && <p className="mt-3 text-sm text-status-normal">✓ {maintResult}</p>}
              </div>
              <div className="border border-border rounded-xl p-5">
                <h3 className="font-semibold mb-1">Table List (REINDEX preview)</h3>
                <p className="text-sm text-muted-foreground mb-3">Current public tables. Run per-table REINDEX in the SQL Console if needed.</p>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                  {tables.map(t => (
                    <div key={t.name} className="bg-muted/30 rounded px-2 py-1 text-xs font-mono text-muted-foreground border border-border/50">
                      {t.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── DANGER ZONE ─────────────────────────────────────────────────── */}
          {tab === "danger" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-status-fault/5 border border-status-fault/30 rounded-xl p-4">
                <AlertTriangle className="h-5 w-5 text-status-fault flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-status-fault">Danger Zone</p>
                  <p className="text-sm text-muted-foreground mt-1">Operations here are irreversible. All data loss is permanent. Proceed with extreme caution.</p>
                </div>
              </div>

              <div className="border border-status-fault/30 rounded-xl p-5 space-y-4">
                <h3 className="font-semibold text-status-fault flex items-center gap-2">
                  <Trash2 className="h-4 w-4" /> Truncate Table
                </h3>
                <p className="text-sm text-muted-foreground">Removes ALL rows from the selected table. Identity sequences are reset. Cascades to dependent tables.</p>
                <div className="space-y-3">
                  <select value={truncateTable} onChange={e => { setTruncateTable(e.target.value); setTruncateConfirmInput(""); }}
                    className="w-full border border-border rounded-md bg-background text-sm px-3 py-2">
                    <option value="">Select table…</option>
                    {tables.map(t => <option key={t.name} value={t.name}>{t.name} ({t.row_count ?? 0} rows)</option>)}
                  </select>
                  {truncateTable && (
                    <>
                      <p className="text-sm text-muted-foreground">Type <code className="bg-muted px-1 rounded font-mono text-xs">{truncateTable}</code> to confirm:</p>
                      <Input
                        value={truncateConfirmInput}
                        onChange={e => setTruncateConfirmInput(e.target.value)}
                        placeholder={`Type "${truncateTable}" to confirm`}
                        className="border-status-fault/30"
                      />
                      <Button
                        variant="destructive"
                        onClick={() => void doTruncate()}
                        disabled={truncateConfirmInput !== truncateTable || truncating}
                        className="gap-2"
                      >
                        {truncating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        TRUNCATE {truncateTable}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Edit modal ─────────────────────────────────────────────────────── */}
        {editRow && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="font-semibold text-sm">Edit Record — {selectedTable}</h3>
                <button onClick={() => setEditRow(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {Object.entries(editRow).map(([k, v]) => (
                  <div key={k} className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${editField === k ? "border-primary bg-primary/5" : "border-border/50 hover:border-border"}`}
                    onClick={() => { setEditField(k); setEditVal(fmt(v)); }}>
                    <div className="w-32 flex-shrink-0">
                      <p className="text-[10px] font-mono text-muted-foreground">{k}</p>
                    </div>
                    <p className="text-xs font-mono text-foreground/80 truncate flex-1">{fmt(v)}</p>
                  </div>
                ))}
              </div>
              {editField && (
                <div className="border-t border-border p-4 space-y-2">
                  <p className="text-xs text-muted-foreground">Editing field: <code className="font-mono text-foreground">{editField}</code></p>
                  <Input value={editVal} onChange={e => setEditVal(e.target.value)} className="font-mono text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => patchMut.mutate({ field: editField, value: editVal })} disabled={patchMut.isPending}>
                      {patchMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Change"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditField("")}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Delete confirm ──────────────────────────────────────────────────── */}
        {deleteId && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Trash2 className="h-5 w-5 text-status-fault" />
                <h3 className="font-semibold">Delete Record?</h3>
              </div>
              <p className="text-sm text-muted-foreground">This will permanently delete record <code className="font-mono bg-muted px-1 rounded text-xs">{deleteId}</code> from <strong>{selectedTable}</strong>. This action cannot be undone.</p>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={() => deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}>
                  {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
                </Button>
                <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
