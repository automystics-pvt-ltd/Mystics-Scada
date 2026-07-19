/**
 * Database Administration Console — /superadmin/db
 * Enhanced: schema inspector, index/FK viewer, multi-field editor,
 * query history, visual stats, connections monitor, slow queries,
 * per-table REINDEX, bulk ops, import/export, integrity, danger zone.
 */
import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import {
  Database, Table2, Terminal, Search, Download, Upload,
  ShieldCheck, Wrench, AlertTriangle, Trash2, Edit2, RefreshCw,
  Play, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  FileJson, FileText, Loader2, Copy, X, Info, Activity,
  Key, Link2, BarChart3, Zap, Clock, Server, Eye,
  ChevronDown, ChevronUp, History, RotateCcw, ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL as string;
const H = { "Content-Type": "application/json", "X-SCADA-Request": "1" } as const;

const TABS = [
  { id: "browser",     label: "Record Browser",   icon: Table2 },
  { id: "sql",         label: "SQL Console",       icon: Terminal },
  { id: "search",      label: "Global Search",     icon: Search },
  { id: "bulk",        label: "Bulk Operations",   icon: RefreshCw },
  { id: "io",          label: "Import / Export",   icon: Download },
  { id: "integrity",   label: "Integrity",          icon: ShieldCheck },
  { id: "stats",       label: "DB Stats",           icon: BarChart3 },
  { id: "connections", label: "Connections",        icon: Server },
  { id: "maintain",    label: "Maintenance",        icon: Wrench },
  { id: "danger",      label: "Danger Zone",        icon: AlertTriangle },
] as const;

type TabId = typeof TABS[number]["id"];

interface TableInfo   { name: string; row_count: number }
interface ColInfo     { name: string; dataType: string; isNullable: string; columnDefault: string | null; isPrimaryKey: boolean }
interface IndexInfo   { indexName: string; isUnique: boolean; isPrimary: boolean; columns: string; size: string }
interface FkInfo      { column: string; referencedTable: string; referencedColumn: string; constraintName: string; onDelete: string; onUpdate: string }
interface RecordsResult { records: Record<string, unknown>[]; total: number; columns: string[] }
interface IntegrityCheck { name: string; description: string; count: number; status: "ok" | "warning" | "error" }
interface ConnRow     { pid: number; user: string; app: string; clientAddr: string; state: string; waitType: string | null; waitEvent: string | null; queryAgeSecs: number | null; stateAgeSecs: number | null; query: string }
interface SlowQuery   { pid: number; user: string; state: string; waitType: string | null; waitEvent: string | null; durationSecs: number; query: string }
interface DbStats     { dbSize: string; dbSizeBytes: number; tables: Record<string, unknown>[]; activeConnections: number }

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 120);
  return String(v);
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

// ── Schema sub-panel ──────────────────────────────────────────────────────────
function SchemaPanel({ table }: { table: string }) {
  const { data: schema, isLoading: schemaLoading } = useQuery<{ columns: ColInfo[] }>({
    queryKey: ["superadmin", "db", "schema", table],
    queryFn: () => fetch(`${BASE}api/superadmin/db/tables/${table}/schema`, { credentials: "include" }).then(r => r.json()) as Promise<{ columns: ColInfo[] }>,
  });
  const { data: indexes = [], isLoading: indexLoading } = useQuery<IndexInfo[]>({
    queryKey: ["superadmin", "db", "indexes", table],
    queryFn: () => fetch(`${BASE}api/superadmin/db/tables/${table}/indexes`, { credentials: "include" }).then(r => r.json()) as Promise<IndexInfo[]>,
  });
  const { data: fks = [], isLoading: fkLoading } = useQuery<FkInfo[]>({
    queryKey: ["superadmin", "db", "fks", table],
    queryFn: () => fetch(`${BASE}api/superadmin/db/tables/${table}/foreign-keys`, { credentials: "include" }).then(r => r.json()) as Promise<FkInfo[]>,
  });

  if (schemaLoading) return <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 p-4">
      {/* Columns */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Table2 className="h-3 w-3" /> Columns ({schema?.columns.length ?? 0})
        </p>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {["Column", "Type", "Nullable", "Default", "Flags"].map(h => (
                  <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schema?.columns.map(col => (
                <tr key={col.name} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="px-3 py-1.5 font-mono font-medium text-foreground">{col.name}</td>
                  <td className="px-3 py-1.5 font-mono text-primary text-[11px]">{col.dataType}</td>
                  <td className="px-3 py-1.5">
                    <span className={`text-[10px] font-medium ${col.isNullable === "YES" ? "text-muted-foreground" : "text-orange-400"}`}>
                      {col.isNullable === "YES" ? "nullable" : "NOT NULL"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground text-[11px] max-w-[140px] truncate">
                    {col.columnDefault ?? <span className="italic opacity-40">—</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1">
                      {col.isPrimaryKey && <Badge className="text-[9px] h-4 px-1 bg-primary/15 text-primary border-primary/30">PK</Badge>}
                      {fks.some(f => f.column === col.name) && <Badge className="text-[9px] h-4 px-1 bg-blue-500/15 text-blue-400 border-blue-500/30">FK</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indexes */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Key className="h-3 w-3" /> Indexes ({indexLoading ? "…" : indexes.length})
        </p>
        {indexes.length === 0 && !indexLoading ? (
          <p className="text-xs text-muted-foreground italic">No indexes</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Index Name", "Columns", "Type", "Size"].map(h => (
                    <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground border-b border-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {indexes.map(idx => (
                  <tr key={idx.indexName} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-1.5 font-mono text-[11px]">{idx.indexName}</td>
                    <td className="px-3 py-1.5 font-mono text-primary text-[11px]">{idx.columns}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1">
                        {idx.isPrimary && <Badge className="text-[9px] h-4 px-1 bg-primary/15 text-primary border-primary/30">PRIMARY</Badge>}
                        {idx.isUnique && !idx.isPrimary && <Badge className="text-[9px] h-4 px-1 bg-purple-500/15 text-purple-400 border-purple-500/30">UNIQUE</Badge>}
                        {!idx.isPrimary && !idx.isUnique && <Badge variant="outline" className="text-[9px] h-4 px-1">INDEX</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground text-[11px]">{idx.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Foreign Keys */}
      {(fks.length > 0 || fkLoading) && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Link2 className="h-3 w-3" /> Foreign Keys ({fkLoading ? "…" : fks.length})
          </p>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Column", "References", "On Delete", "On Update"].map(h => (
                    <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground border-b border-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fks.map(fk => (
                  <tr key={fk.constraintName} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-1.5 font-mono text-[11px] text-blue-400">{fk.column}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">
                      <span className="text-foreground">{fk.referencedTable}</span>
                      <span className="text-muted-foreground">.</span>
                      <span className="text-primary">{fk.referencedColumn}</span>
                    </td>
                    <td className="px-3 py-1.5 text-[11px] text-muted-foreground">{fk.onDelete}</td>
                    <td className="px-3 py-1.5 text-[11px] text-muted-foreground">{fk.onUpdate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Multi-field edit modal ─────────────────────────────────────────────────────
function EditModal({
  row, table, columns,
  onClose, onSaved,
}: {
  row: Record<string, unknown>; table: string; columns: string[];
  onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(columns.map(c => [c, row[c] === null || row[c] === undefined ? "" : String(row[c])]))
  );
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState<Set<string>>(new Set());

  function handleChange(col: string, val: string) {
    setValues(prev => ({ ...prev, [col]: val }));
    setChanged(prev => new Set([...prev, col]));
  }

  async function save() {
    const changedFields: Record<string, unknown> = {};
    changed.forEach(c => { changedFields[c] = values[c] === "" ? null : values[c]; });
    if (Object.keys(changedFields).length === 0) { onClose(); return; }

    setSaving(true);
    try {
      const r = await fetch(
        `${BASE}api/superadmin/db/tables/${table}/records/${String(row["id"] ?? "")}`,
        { method: "PATCH", credentials: "include", headers: H, body: JSON.stringify({ fields: changedFields }) }
      );
      const d = await r.json() as { error?: string };
      if (d.error) throw new Error(d.error);
      toast({ title: "Record updated", description: `${Object.keys(changedFields).length} field(s) saved` });
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  const pkCols = new Set(["id"]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
          <div>
            <h3 className="font-semibold text-sm">Edit Record</h3>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{table} · id: {String(row["id"] ?? "—")}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {columns.map(col => {
            const isPk = pkCols.has(col);
            const isChanged = changed.has(col);
            const origVal = row[col] === null || row[col] === undefined ? "" : String(row[col]);
            const isLong = origVal.length > 80;
            return (
              <div key={col} className={`rounded-lg border p-3 transition-colors ${isChanged ? "border-primary/50 bg-primary/5" : "border-border/60"}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-mono font-medium text-foreground">{col}</span>
                  {isPk && <Badge className="text-[9px] h-3.5 px-1 bg-primary/10 text-primary border-primary/20">PK</Badge>}
                  {isChanged && <Badge className="text-[9px] h-3.5 px-1 bg-amber-500/10 text-amber-400 border-amber-500/20">modified</Badge>}
                </div>
                {isLong ? (
                  <textarea
                    rows={3}
                    value={values[col]}
                    onChange={e => handleChange(col, e.target.value)}
                    disabled={isPk}
                    className="w-full font-mono text-xs bg-background border border-border rounded px-2 py-1.5 resize-y disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                ) : (
                  <input
                    type="text"
                    value={values[col]}
                    onChange={e => handleChange(col, e.target.value)}
                    disabled={isPk}
                    className="w-full font-mono text-xs bg-background border border-border rounded px-2 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="border-t border-border px-5 py-3 flex items-center justify-between flex-shrink-0 bg-muted/20">
          <span className="text-xs text-muted-foreground">
            {changed.size > 0 ? <span className="text-amber-400">{changed.size} field(s) modified</span> : "No changes yet"}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => void save()} disabled={saving || changed.size === 0}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save {changed.size > 0 ? `(${changed.size})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminDbAdmin() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>("browser");

  // ── Table list ──────────────────────────────────────────────────────────────
  const [tableFilter, setTableFilter] = useState("");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [browserView, setBrowserView] = useState<"data" | "schema">("data");

  const { data: tables = [], refetch: refetchTables } = useQuery<TableInfo[]>({
    queryKey: ["superadmin", "db", "tables"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/superadmin/db/tables`, { credentials: "include" });
      const json = await res.json();
      // API may return { tables: [...] } or a bare array
      return (Array.isArray(json) ? json : (json?.tables ?? [])) as TableInfo[];
    },
  });

  const filteredTables = tables.filter(t => t.name.toLowerCase().includes(tableFilter.toLowerCase()));

  // ── Record Browser ──────────────────────────────────────────────────────────
  const [page, setPage]       = useState(0);
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sortCol, setSortCol]   = useState<string>("id");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc");
  const PAGE_SIZE = 50;

  const { data: records, isLoading: loadingRecords, refetch: refetchRecords } = useQuery<RecordsResult>({
    queryKey: ["superadmin", "db", "records", selectedTable, page, sortCol, sortDir],
    queryFn: () => fetch(
      `${BASE}api/superadmin/db/tables/${selectedTable}/records?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&orderBy=${sortCol}&orderDir=${sortDir}`,
      { credentials: "include" }
    ).then(r => r.json()) as Promise<RecordsResult>,
    enabled: !!selectedTable && browserView === "data",
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`${BASE}api/superadmin/db/tables/${selectedTable}/records/${id}`, {
        method: "DELETE", credentials: "include", headers: H,
      }).then(r => r.json()),
    onSuccess: () => { void refetchRecords(); setDeleteId(null); toast({ title: "Record deleted", variant: "destructive" }); },
  });

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
    setPage(0);
  }

  // ── SQL Console ─────────────────────────────────────────────────────────────
  const [sqlInput, setSqlInput]   = useState("SELECT * FROM organizations LIMIT 10;");
  const [sqlResult, setSqlResult] = useState<{ rows: Record<string,unknown>[]; rowCount: number; executionMs: number; error?: string } | null>(null);
  const [sqlRunning, setSqlRunning] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const runSql = useCallback(async () => {
    setSqlRunning(true);
    try {
      const r = await fetch(`${BASE}api/superadmin/db/query`, {
        method: "POST", credentials: "include", headers: H,
        body: JSON.stringify({ sql: sqlInput }),
      });
      const d = await r.json() as typeof sqlResult;
      setSqlResult(d);
      setQueryHistory(prev => [sqlInput, ...prev.filter(q => q !== sqlInput)].slice(0, 20));
    } finally {
      setSqlRunning(false);
    }
  }, [sqlInput]);

  const QUICK_TEMPLATES = [
    { label: "List tables",        sql: "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;" },
    { label: "DB size",            sql: "SELECT pg_size_pretty(pg_database_size(current_database())) AS size;" },
    { label: "Active connections", sql: "SELECT pid, usename, state, left(query,80) AS query FROM pg_stat_activity WHERE state='active' LIMIT 20;" },
    { label: "Largest tables",     sql: "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;" },
    { label: "Slow queries",       sql: "SELECT pid, now()-query_start AS duration, left(query,120) AS query FROM pg_stat_activity WHERE state='active' AND now()-query_start > interval '1s' ORDER BY duration DESC;" },
    { label: "Index usage",        sql: "SELECT schemaname, tablename, indexname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size FROM pg_stat_user_indexes ORDER BY idx_scan DESC LIMIT 20;" },
    { label: "Lock waits",         sql: "SELECT pid, wait_event_type, wait_event, state, left(query,80) AS query FROM pg_stat_activity WHERE wait_event IS NOT NULL LIMIT 20;" },
    { label: "Bloat check",        sql: "SELECT relname, n_dead_tup, n_live_tup, round(n_dead_tup::numeric/NULLIF(n_live_tup+n_dead_tup,0)*100,1) AS dead_pct FROM pg_stat_user_tables WHERE n_dead_tup > 1000 ORDER BY n_dead_tup DESC LIMIT 15;" },
  ];

  // ── Global Search ───────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm]       = useState("");
  const [searchTable, setSearchTable]     = useState("all");
  const [searchResults, setSearchResults] = useState<{ table: string; rows: Record<string,unknown>[] }[]>([]);
  const [searching, setSearching]         = useState(false);

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
      } catch { /* skip */ }
    }
    setSearchResults(results);
    setSearching(false);
  }

  // ── Bulk Operations ─────────────────────────────────────────────────────────
  const [bulkConfirm, setBulkConfirm] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  const BULK_OPS = [
    { id: "clear_old_audit",    label: "Clear audit logs > 90 days",        description: "Permanently deletes audit_logs older than 90 days.", sql: "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days'", danger: false },
    { id: "clear_comm_logs",    label: "Clear device comm logs > 30 days",  description: "Deletes device_comm_logs older than 30 days.", sql: "DELETE FROM device_comm_logs WHERE created_at < NOW() - INTERVAL '30 days'", danger: false },
    { id: "clear_old_readings", label: "Clear device readings > 7 days",    description: "Deletes device_readings older than 7 days.", sql: "DELETE FROM device_readings WHERE recorded_at < NOW() - INTERVAL '7 days'", danger: false },
    { id: "clear_closed_wo",    label: "Archive closed work orders",         description: "Deletes work_orders with status=closed/verified.", sql: "DELETE FROM work_orders WHERE status IN ('closed','verified')", danger: true },
    { id: "reset_dismissed",    label: "Reset all dismissed AI insights",    description: "Clears dismissedInsightIds from all userPreferences.", sql: "UPDATE user_preferences SET preferences = preferences - 'dismissedInsightIds' WHERE preferences ? 'dismissedInsightIds'", danger: false },
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
  const { data: dbStats, refetch: refetchStats } = useQuery<DbStats>({
    queryKey: ["superadmin", "db", "stats"],
    queryFn: () => fetch(`${BASE}api/superadmin/db/stats`, { credentials: "include" }).then(r => r.json()) as Promise<DbStats>,
    enabled: tab === "stats",
    refetchInterval: 30_000,
  });

  const maxTableBytes = Math.max(...((dbStats?.tables as Record<string,unknown>[])?.map(t => Number(t["pg_total_relation_size"] ?? 0)) ?? [1]));

  // ── Connections ──────────────────────────────────────────────────────────────
  const { data: connData, refetch: refetchConns, isLoading: connLoading } = useQuery<{ connections: ConnRow[]; summary: { state: string; count: number }[] }>({
    queryKey: ["superadmin", "db", "connections"],
    queryFn: () => fetch(`${BASE}api/superadmin/db/connections`, { credentials: "include" }).then(r => r.json()) as Promise<{ connections: ConnRow[]; summary: { state: string; count: number }[] }>,
    enabled: tab === "connections",
    refetchInterval: 10_000,
  });

  const { data: slowQueries = [], refetch: refetchSlow } = useQuery<SlowQuery[]>({
    queryKey: ["superadmin", "db", "slow-queries"],
    queryFn: () => fetch(`${BASE}api/superadmin/db/slow-queries`, { credentials: "include" }).then(r => r.json()) as Promise<SlowQuery[]>,
    enabled: tab === "connections",
    refetchInterval: 10_000,
  });

  // ── Maintenance ─────────────────────────────────────────────────────────────
  const [maintLog, setMaintLog]       = useState<string[]>([]);
  const [maintRunning, setMaintRunning] = useState(false);
  const [reindexTable, setReindexTable] = useState("");
  const [reindexRunning, setReindexRunning] = useState(false);

  async function runVacuum() {
    setMaintRunning(true);
    try {
      const r = await fetch(`${BASE}api/superadmin/db/maintenance/vacuum`, { method: "POST", credentials: "include", headers: H });
      const d = await r.json() as { ok: boolean; message: string };
      setMaintLog(prev => [`[${new Date().toLocaleTimeString()}] ${d.message}`, ...prev]);
      toast({ title: "Maintenance complete", description: d.message });
    } catch (e: unknown) {
      toast({ title: "Vacuum failed", description: String(e), variant: "destructive" });
    } finally { setMaintRunning(false); }
  }

  async function runReindex() {
    if (!reindexTable) return;
    setReindexRunning(true);
    try {
      const r = await fetch(`${BASE}api/superadmin/db/maintenance/reindex-table`, {
        method: "POST", credentials: "include", headers: H,
        body: JSON.stringify({ table: reindexTable }),
      });
      const d = await r.json() as { ok: boolean; message: string; error?: string };
      if (d.error) throw new Error(d.error);
      setMaintLog(prev => [`[${new Date().toLocaleTimeString()}] ${d.message}`, ...prev]);
      toast({ title: "Reindex complete", description: d.message });
    } catch (e: unknown) {
      toast({ title: "Reindex failed", description: String(e), variant: "destructive" });
    } finally { setReindexRunning(false); }
  }

  // ── Danger Zone ─────────────────────────────────────────────────────────────
  const [truncateTable, setTruncateTable]           = useState("");
  const [truncateConfirmInput, setTruncateConfirmInput] = useState("");
  const [truncating, setTruncating]                  = useState(false);

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
                Schema inspector · Record browser · SQL console · Connections · Integrity · Maintenance
              </p>
            </div>
            <Badge className="bg-status-fault text-white text-[10px] font-bold px-2 py-1 flex-shrink-0">
              ⊗ SUPER ADMIN ONLY
            </Badge>
          </div>

          {/* Tab bar */}
          <div className="border-b border-border">
            <nav className="flex gap-0 overflow-x-auto scrollbar-none">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
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

          {/* ── RECORD BROWSER ─────────────────────────────────────────────────── */}
          {tab === "browser" && (
            <div className="flex gap-4" style={{ height: "calc(100vh - 300px)", minHeight: 520 }}>
              {/* Table sidebar */}
              <div className="w-56 flex flex-col border border-border rounded-xl overflow-hidden bg-card flex-shrink-0">
                <div className="p-2 border-b border-border flex items-center gap-1">
                  <Input placeholder="Filter tables…" value={tableFilter}
                    onChange={e => setTableFilter(e.target.value)} className="h-7 text-xs" />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => void refetchTables()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="px-2 py-1 border-b border-border/50 bg-muted/20">
                  <span className="text-[10px] text-muted-foreground">{filteredTables.length} tables</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredTables.map(t => (
                    <button
                      key={t.name}
                      onClick={() => { setSelectedTable(t.name); setPage(0); setBrowserView("data"); }}
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

              {/* Main panel */}
              <div className="flex-1 flex flex-col border border-border rounded-xl overflow-hidden bg-card min-w-0">
                {!selectedTable ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <Database className="h-12 w-12 opacity-20" />
                    <p className="text-sm">Select a table to browse records or inspect its schema</p>
                  </div>
                ) : (
                  <>
                    {/* Panel header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 flex-shrink-0">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-semibold text-sm">{selectedTable}</span>
                        {records && browserView === "data" && (
                          <span className="text-[10px] text-muted-foreground">
                            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, records.total)} of {records.total.toLocaleString()} rows
                          </span>
                        )}
                        {/* Data / Schema toggle */}
                        <div className="flex items-center border border-border rounded-md overflow-hidden bg-background">
                          <button
                            onClick={() => setBrowserView("data")}
                            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-colors ${browserView === "data" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            <Table2 className="h-3 w-3" /> Data
                          </button>
                          <button
                            onClick={() => setBrowserView("schema")}
                            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-colors ${browserView === "schema" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            <Eye className="h-3 w-3" /> Schema
                          </button>
                        </div>
                      </div>
                      {browserView === "data" && (
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
                      )}
                    </div>

                    {/* Panel body */}
                    <div className="flex-1 overflow-auto">
                      {browserView === "schema" ? (
                        <SchemaPanel table={selectedTable} />
                      ) : loadingRecords ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : records && records.records.length > 0 ? (
                        <table className="w-full text-xs border-collapse">
                          <thead className="bg-muted/50 sticky top-0 z-10">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground border-b border-border w-14">Act.</th>
                              {records.columns.map(col => (
                                <th
                                  key={col}
                                  onClick={() => handleSort(col)}
                                  className="px-3 py-1.5 text-left font-medium text-muted-foreground border-b border-border whitespace-nowrap cursor-pointer hover:text-foreground select-none group"
                                >
                                  <span className="flex items-center gap-1">
                                    {col}
                                    <ArrowUpDown className={`h-2.5 w-2.5 transition-opacity ${sortCol === col ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-40"}`} />
                                    {sortCol === col && (
                                      <span className="text-[9px] text-primary font-bold">
                                        {sortDir === "asc" ? "↑" : "↓"}
                                      </span>
                                    )}
                                  </span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {records.records.map((row, i) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                                <td className="px-2 py-1">
                                  <div className="flex items-center gap-0.5">
                                    <button
                                      onClick={() => setEditRow(row)}
                                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                      title="Edit record"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => setDeleteId(String(row["id"] ?? i))}
                                      className="p-1 rounded hover:bg-status-fault/10 text-muted-foreground hover:text-status-fault"
                                      title="Delete record"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </td>
                                {records.columns.map(col => (
                                  <td key={col} className="px-3 py-1.5 font-mono text-foreground/80 max-w-[200px] truncate" title={fmt(row[col])}>
                                    {row[col] === null
                                      ? <span className="text-muted-foreground/30 italic text-[10px]">null</span>
                                      : typeof row[col] === "boolean"
                                        ? <span className={row[col] ? "text-green-400" : "text-red-400"}>{String(row[col])}</span>
                                        : fmt(row[col])
                                    }
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
              {/* Quick templates */}
              <div className="flex gap-1.5 flex-wrap">
                {QUICK_TEMPLATES.map(tpl => (
                  <button key={tpl.label} onClick={() => setSqlInput(tpl.sql)}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border transition-colors">
                    {tpl.label}
                  </button>
                ))}
                {queryHistory.length > 0 && (
                  <button
                    onClick={() => setShowHistory(h => !h)}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border transition-colors flex items-center gap-1"
                  >
                    <History className="h-3 w-3" /> History ({queryHistory.length})
                    {showHistory ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                  </button>
                )}
              </div>

              {/* Query history */}
              {showHistory && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted/30 px-3 py-1.5 border-b border-border text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" /> Recent Queries
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {queryHistory.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => { setSqlInput(q); setShowHistory(false); }}
                        className="w-full text-left px-3 py-2 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted/30 border-b border-border/30 truncate transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Editor */}
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="bg-muted/30 px-3 py-1.5 border-b border-border flex items-center gap-2 text-xs text-muted-foreground">
                  <Terminal className="h-3.5 w-3.5" />
                  <span className="font-mono flex-1">SQL Console — all statements permitted</span>
                  <button onClick={() => copyToClipboard(sqlInput)} className="p-1 rounded hover:bg-muted" title="Copy">
                    <Copy className="h-3 w-3" />
                  </button>
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
                <div className="bg-muted/30 border-t border-border px-3 py-2 flex items-center gap-3">
                  <Button size="sm" onClick={() => void runSql()} disabled={sqlRunning} className="gap-1.5 h-7">
                    {sqlRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    Run (Ctrl+Enter)
                  </Button>
                  {sqlResult && !sqlResult.error && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {sqlResult.rowCount} rows · {sqlResult.executionMs}ms
                    </span>
                  )}
                  {sqlResult && (
                    <button onClick={() => setSqlResult(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Results */}
              {sqlResult && (
                <div className="border border-border rounded-xl overflow-hidden">
                  {sqlResult.error ? (
                    <div className="p-4 bg-status-fault/5 text-status-fault text-sm font-mono">
                      <div className="font-bold mb-1 flex items-center gap-1.5"><XCircle className="h-4 w-4" /> Error</div>
                      <pre className="whitespace-pre-wrap text-xs">{sqlResult.error}</pre>
                    </div>
                  ) : sqlResult.rows.length === 0 ? (
                    <div className="p-4 text-muted-foreground text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-status-normal" /> Query executed — 0 rows returned
                    </div>
                  ) : (
                    <>
                      <div className="bg-muted/30 px-3 py-1.5 border-b border-border flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-mono">{sqlResult.rowCount} rows · {sqlResult.executionMs}ms</span>
                        <button
                          onClick={() => copyToClipboard(JSON.stringify(sqlResult.rows, null, 2))}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          <Copy className="h-3 w-3" /> Copy JSON
                        </button>
                      </div>
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
                                  <td key={j} className="px-3 py-1.5 font-mono text-foreground/80 max-w-[300px] truncate">
                                    {v === null ? <span className="text-muted-foreground/30 italic text-[10px]">null</span> : fmt(v)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── GLOBAL SEARCH ───────────────────────────────────────────────── */}
          {tab === "search" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="Search across tables…" value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && void runGlobalSearch()}
                  className="flex-1" />
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
              <p className="text-xs text-muted-foreground">Searches up to 8 tables (excludes high-volume telemetry tables). Results limited to 5 rows per table.</p>
              {searchResults.map(sr => (
                <div key={sr.table} className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center gap-2">
                    <Table2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-mono font-semibold">{sr.table}</span>
                    <span className="text-xs text-muted-foreground">{sr.rows.length} match{sr.rows.length !== 1 ? "es" : ""}</span>
                  </div>
                  <div className="overflow-auto max-h-[250px]">
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
                              <td key={j} className="px-3 py-1.5 font-mono text-foreground/80 max-w-[200px] truncate">{fmt(v)}</td>
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
                <div key={op.id} className={`border rounded-xl p-4 ${op.danger ? "border-status-fault/30 bg-status-fault/3" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm ${op.danger ? "text-status-fault" : "text-status-warning"}`}>{op.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{op.description}</p>
                      <code className="text-[10px] text-muted-foreground/50 font-mono mt-1.5 block bg-muted/30 px-2 py-1 rounded truncate">{op.sql}</code>
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
                      <Button size="sm" variant={op.danger ? "destructive" : "outline"} className="h-7 flex-shrink-0"
                        onClick={() => setBulkConfirm(op.id)}>
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
                      {(["json", "csv"] as const).map(f => (
                        <button key={f} onClick={() => setExportFmt(f)}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border text-sm transition-colors ${exportFmt === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                          {f === "json" ? <FileJson className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                          {f.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={() => exportTable && window.open(`${BASE}api/superadmin/db/export/${exportTable}?format=${exportFmt}`, "_blank")}
                    disabled={!exportTable} className="w-full gap-2">
                    <Download className="h-4 w-4" /> Download {exportFmt.toUpperCase()}
                  </Button>
                  {exportTable && (
                    <p className="text-xs text-muted-foreground">
                      Up to 50,000 rows will be exported from <code className="font-mono bg-muted px-1 rounded">{exportTable}</code>
                    </p>
                  )}
                </div>
              </div>
              <div className="border border-border rounded-xl p-5 space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><Upload className="h-4 w-4 text-primary" />Import</h3>
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">CSV import coming soon</p>
                  <p className="text-xs mt-1 opacity-60">Use the SQL Console with COPY or INSERT statements</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Import via SQL Console:</p>
                  <code className="block font-mono text-[11px] opacity-80">INSERT INTO table_name (col1, col2) VALUES (...);</code>
                  <code className="block font-mono text-[11px] opacity-80">COPY table_name FROM STDIN WITH CSV HEADER;</code>
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
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${integrityResult.passedAll ? "text-status-normal" : "text-status-warning"}`}>
                      {integrityResult.passedAll ? "✓ All checks passed" : `⚠ ${integrityResult.checks.filter(c => c.status !== "ok").length} issues found`}
                    </span>
                    <span className="text-xs text-muted-foreground">Checked at {new Date(integrityResult.checkedAt).toLocaleTimeString()}</span>
                  </div>
                )}
              </div>
              {integrityResult && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {integrityResult.checks.map(check => (
                    <div key={check.name}
                      className={`border rounded-xl p-4 flex items-start gap-3 ${
                        check.status === "ok"
                          ? "border-status-normal/20 bg-status-normal/5"
                          : "border-status-warning/30 bg-status-warning/5"
                      }`}>
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
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Refreshes every 30 seconds</p>
                <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => void refetchStats()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Database Size",      value: dbStats?.dbSize ?? "—",                        icon: Database,  color: "text-primary" },
                  { label: "Active Connections",  value: String(dbStats?.activeConnections ?? "—"),      icon: Activity,  color: "text-status-normal" },
                  { label: "Tables",              value: String(tables.length),                           icon: Table2,    color: "text-blue-400" },
                  { label: "Total Rows (est.)",   value: tables.reduce((s,t) => s + (t.row_count ?? 0), 0).toLocaleString(), icon: BarChart3, color: "text-purple-400" },
                ].map(kpi => (
                  <div key={kpi.label} className="border border-border rounded-xl p-4 bg-card">
                    <div className="flex items-center gap-2 mb-2">
                      <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    </div>
                    <p className="text-2xl font-bold font-mono">{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Table sizes with visual bars */}
              {dbStats?.tables && Array.isArray(dbStats.tables) && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted/30 px-4 py-2.5 border-b border-border flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Table Sizes (top 20)</span>
                  </div>
                  <div className="overflow-auto max-h-[480px]">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b border-border">Table</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b border-border">Size</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b border-border">Live Rows</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b border-border">Dead Rows</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b border-border w-40">Size bar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dbStats.tables as Record<string,unknown>[]).map((row, i) => {
                          const pct = maxTableBytes > 0 ? Math.max(2, (Number(row["pg_total_relation_size"] ?? 0) / maxTableBytes) * 100) : 2;
                          const deadRows = Number(row["dead_rows"] ?? 0);
                          return (
                            <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                              <td className="px-4 py-2 font-mono font-medium">{String(row["name"] ?? "")}</td>
                              <td className="px-4 py-2 font-mono text-primary">{String(row["size"] ?? "")}</td>
                              <td className="px-4 py-2 font-mono">{Number(row["rows"] ?? 0).toLocaleString()}</td>
                              <td className={`px-4 py-2 font-mono ${deadRows > 1000 ? "text-status-warning" : "text-muted-foreground"}`}>
                                {deadRows.toLocaleString()}
                                {deadRows > 1000 && <span className="ml-1 text-[10px]">⚠</span>}
                              </td>
                              <td className="px-4 py-2">
                                <div className="h-2.5 bg-muted rounded-full overflow-hidden w-36">
                                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── CONNECTIONS ─────────────────────────────────────────────────── */}
          {tab === "connections" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Live connections · refreshes every 10 seconds</p>
                <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => { void refetchConns(); void refetchSlow(); }}>
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>

              {/* Summary pills */}
              {connData?.summary && (
                <div className="flex gap-2 flex-wrap">
                  {connData.summary.map(s => (
                    <div key={s.state ?? "null"} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${
                      s.state === "active" ? "border-status-normal/40 bg-status-normal/10 text-status-normal"
                      : s.state === "idle" ? "border-border bg-muted/30 text-muted-foreground"
                      : "border-status-warning/40 bg-status-warning/10 text-status-warning"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.state === "active" ? "bg-status-normal" : s.state === "idle" ? "bg-muted-foreground" : "bg-status-warning"}`} />
                      {s.state ?? "null"}: <span className="font-bold ml-0.5">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Slow queries section */}
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-status-warning" /> Active / Slow Queries
                </h3>
                {slowQueries.length === 0 ? (
                  <div className="border border-border rounded-xl p-4 text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-status-normal" /> No active queries detected
                  </div>
                ) : (
                  <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-muted/50">
                        <tr>
                          {["PID", "User", "Duration", "State", "Wait", "Query"].map(h => (
                            <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground border-b border-border">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {slowQueries.map(q => (
                          <tr key={q.pid} className="border-b border-border/50 hover:bg-muted/20">
                            <td className="px-3 py-2 font-mono">{q.pid}</td>
                            <td className="px-3 py-2">{q.user}</td>
                            <td className={`px-3 py-2 font-mono font-bold ${q.durationSecs > 5 ? "text-status-fault" : q.durationSecs > 1 ? "text-status-warning" : "text-muted-foreground"}`}>
                              {q.durationSecs}s
                            </td>
                            <td className="px-3 py-2"><Badge variant="outline" className="text-[10px] h-4">{q.state}</Badge></td>
                            <td className="px-3 py-2 text-muted-foreground">{q.waitEvent ?? "—"}</td>
                            <td className="px-3 py-2 font-mono max-w-[300px] truncate text-muted-foreground" title={q.query}>{q.query}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* All connections */}
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Server className="h-4 w-4 text-primary" />
                  All Connections ({connLoading ? "…" : connData?.connections.length ?? 0})
                </h3>
                <div className="border border-border rounded-xl overflow-hidden">
                  {connLoading ? (
                    <div className="flex items-center justify-center h-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="overflow-auto max-h-[360px]">
                      <table className="w-full text-xs border-collapse">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            {["PID","User","App","Client","State","Age","Query"].map(h => (
                              <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground border-b border-border whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(connData?.connections ?? []).map(c => (
                            <tr key={c.pid} className="border-b border-border/50 hover:bg-muted/20">
                              <td className="px-3 py-1.5 font-mono">{c.pid}</td>
                              <td className="px-3 py-1.5">{c.user}</td>
                              <td className="px-3 py-1.5 text-muted-foreground max-w-[100px] truncate">{c.app}</td>
                              <td className="px-3 py-1.5 font-mono text-muted-foreground">{c.clientAddr ?? "local"}</td>
                              <td className="px-3 py-1.5">
                                <span className={`text-[10px] font-medium ${
                                  c.state === "active" ? "text-status-normal"
                                  : c.state === "idle" ? "text-muted-foreground"
                                  : "text-status-warning"
                                }`}>{c.state}</span>
                              </td>
                              <td className="px-3 py-1.5 font-mono text-muted-foreground">
                                {c.queryAgeSecs != null ? `${c.queryAgeSecs}s` : "—"}
                              </td>
                              <td className="px-3 py-1.5 font-mono max-w-[240px] truncate text-muted-foreground/70" title={c.query}>
                                {c.query}
                              </td>
                            </tr>
                          ))}
                          {!connData?.connections.length && (
                            <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">No connections</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── MAINTENANCE ─────────────────────────────────────────────────── */}
          {tab === "maintain" && (
            <div className="space-y-4">
              {/* VACUUM */}
              <div className="border border-border rounded-xl p-5">
                <h3 className="font-semibold mb-1 flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /> VACUUM ANALYZE</h3>
                <p className="text-sm text-muted-foreground mb-3">Reclaims storage from dead tuples and updates planner statistics for the entire database.</p>
                <Button onClick={() => void runVacuum()} disabled={maintRunning} className="gap-2">
                  {maintRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Run VACUUM ANALYZE
                </Button>
              </div>

              {/* Per-table REINDEX */}
              <div className="border border-border rounded-xl p-5">
                <h3 className="font-semibold mb-1 flex items-center gap-2"><Key className="h-4 w-4 text-primary" /> REINDEX Table</h3>
                <p className="text-sm text-muted-foreground mb-3">Rebuilds all indexes on the selected table. Use when index bloat or corruption is suspected.</p>
                <div className="flex gap-2 items-center">
                  <select value={reindexTable} onChange={e => setReindexTable(e.target.value)}
                    className="flex-1 border border-border rounded-md bg-background text-sm px-3 py-2">
                    <option value="">Select table…</option>
                    {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                  <Button onClick={() => void runReindex()} disabled={!reindexTable || reindexRunning} className="gap-2">
                    {reindexRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                    Reindex
                  </Button>
                </div>
              </div>

              {/* Operation log */}
              {maintLog.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Operation Log</span>
                    <button onClick={() => setMaintLog([])} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                  </div>
                  <div className="p-3 space-y-1 font-mono text-xs">
                    {maintLog.map((line, i) => (
                      <p key={i} className="text-status-normal">{line}</p>
                    ))}
                  </div>
                </div>
              )}
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
                      <p className="text-sm text-muted-foreground">
                        Type <code className="bg-muted px-1 rounded font-mono text-xs">{truncateTable}</code> to confirm:
                      </p>
                      <Input value={truncateConfirmInput} onChange={e => setTruncateConfirmInput(e.target.value)}
                        placeholder={`Type "${truncateTable}" to confirm`} className="border-status-fault/30 font-mono" />
                      <Button variant="destructive" onClick={() => void doTruncate()}
                        disabled={truncateConfirmInput !== truncateTable || truncating} className="gap-2">
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

        {/* ── Multi-field edit modal ─────────────────────────────────────────── */}
        {editRow && selectedTable && (
          <EditModal
            row={editRow}
            table={selectedTable}
            columns={records?.columns ?? Object.keys(editRow)}
            onClose={() => setEditRow(null)}
            onSaved={() => void refetchRecords()}
          />
        )}

        {/* ── Delete confirm ──────────────────────────────────────────────────── */}
        {deleteId && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-status-fault/10 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="h-5 w-5 text-status-fault" />
                </div>
                <h3 className="font-semibold">Delete Record?</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                This will permanently delete record{" "}
                <code className="font-mono bg-muted px-1 rounded text-xs">{deleteId}</code> from{" "}
                <strong>{selectedTable}</strong>. This action cannot be undone.
              </p>
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
