/**
 * FTP / SFTP Data Sources management page.
 * Lets operators configure scheduled file-pull jobs from remote FTP/SFTP servers.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Pencil, TestTube2, Loader2, CheckCircle2,
  AlertCircle, RefreshCw, Server, Clock, FolderOpen, ChevronDown, ChevronUp,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

interface FtpSource {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: "ftp" | "ftps" | "sftp";
  username: string;
  remotePath: string;
  filePattern: string;
  intervalMinutes: number;
  active: boolean;
  deviceId: string | null;
  lastPulledAt: string | null;
  lastPulledFile: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  name: string;
  host: string;
  port: string;
  protocol: "ftp" | "ftps" | "sftp";
  username: string;
  password: string;
  remotePath: string;
  filePattern: string;
  intervalMinutes: string;
  deviceId: string;
  active: boolean;
}

interface Device { id: string; name: string; }

function defaultForm(): FormState {
  return {
    name: "", host: "", port: "21", protocol: "ftp",
    username: "", password: "", remotePath: "/", filePattern: "*.csv",
    intervalMinutes: "60", deviceId: "", active: true,
  };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Source card ───────────────────────────────────────────────────────────────

function SourceCard({ source, canManage, onEdit, onDelete, onTest }: {
  source: FtpSource;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-none border border-border/50 bg-card/40 backdrop-blur-md overflow-hidden relative group">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-brand/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={`h-2 w-2 rounded-none flex-shrink-0 ${source.active ? "bg-status-normal shadow-[0_0_8px_var(--status-normal)]" : "bg-muted-foreground/40"}`} />
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm uppercase tracking-wider truncate text-foreground/90">{source.name}</div>
          <div className="text-[10px] font-mono text-muted-foreground truncate uppercase tracking-widest mt-0.5">
            {source.protocol.toUpperCase()} <span className="text-muted-foreground/50 mx-1">/</span> {source.host}:{source.port} <span className="text-muted-foreground/50 mx-1">/</span> EVERY {source.intervalMinutes}m
          </div>
        </div>
        {source.lastError && (
          <AlertCircle className="h-4 w-4 text-status-fault drop-shadow-[0_0_5px_var(--status-fault)] flex-shrink-0" aria-label={source.lastError ?? undefined} />
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {canManage && (
            <>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-brand/10 hover:text-brand rounded-none" onClick={onTest} title="Test connection"><TestTube2 className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-foreground/10 rounded-none" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:bg-status-fault/10 hover:text-status-fault rounded-none" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
            </>
          )}
          <button onClick={() => setExpanded((e) => !e)} className="text-muted-foreground hover:text-foreground p-1 transition-colors">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 bg-card/40 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-mono">
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Remote Path</span>
            <p className="mt-1 truncate text-brand/80">{source.remotePath}</p>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">File Pattern</span>
            <p className="mt-1 text-foreground/80">{source.filePattern}</p>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Last Pull</span>
            <p className="mt-1 text-foreground/80">{timeAgo(source.lastPulledAt)}</p>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Last File</span>
            <p className="mt-1 truncate text-foreground/80">{source.lastPulledFile ?? "—"}</p>
          </div>
          {source.lastError && (
            <div className="col-span-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Last Error</span>
              <p className="mt-1 text-status-fault">{source.lastError}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FtpSourcesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("device.manage") ?? false;

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: sources = [], isLoading } = useQuery<FtpSource[]>({
    queryKey: ["ftp-sources"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/ftp-sources`, { credentials: "include" });
      return r.ok ? r.json() as Promise<FtpSource[]> : [];
    },
    refetchInterval: 60_000,
  });

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices`, { credentials: "include" });
      return r.ok ? r.json() as Promise<Device[]> : [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name, host: form.host, port: Number(form.port),
        protocol: form.protocol, username: form.username, password: form.password,
        remotePath: form.remotePath, filePattern: form.filePattern,
        intervalMinutes: Number(form.intervalMinutes),
        deviceId: form.deviceId || undefined, active: form.active,
      };
      const url    = editId ? `${BASE}api/ftp-sources/${editId}` : `${BASE}api/ftp-sources`;
      const method = editId ? "PATCH" : "POST";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json() as { message?: string }).message ?? "Save failed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ftp-sources"] });
      setShowForm(false);
      setEditId(null);
      setForm(defaultForm());
      toast({ title: editId ? "Source updated" : "Source created" });
    },
    onError: (e) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${BASE}api/ftp-sources/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["ftp-sources"] }); toast({ title: "Source deleted" }); },
  });

  async function testSource(id: string) {
    setTestingId(id);
    const r = await fetch(`${BASE}api/ftp-sources/${id}/test`, { method: "POST", credentials: "include" });
    const data = r.ok ? await r.json() as { ok: boolean; error?: string; fileCount?: number } : { ok: false, error: "Request failed" };
    setTestingId(null);
    toast({
      title: data.ok ? `Connected — ${data.fileCount ?? 0} files found` : "Connection failed",
      description: data.error,
      variant: data.ok ? "default" : "destructive",
    });
  }

  function openEdit(source: FtpSource) {
    setEditId(source.id);
    setForm({
      name: source.name, host: source.host, port: String(source.port),
      protocol: source.protocol, username: source.username, password: "",
      remotePath: source.remotePath, filePattern: source.filePattern,
      intervalMinutes: String(source.intervalMinutes),
      deviceId: source.deviceId ?? "", active: source.active,
    });
    setShowForm(true);
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between border-b border-border/50 pb-6">
          <div>
            <h1 className="text-2xl font-mono uppercase tracking-widest flex items-center gap-3 text-foreground/90">
              <Server className="h-5 w-5 text-brand" />
              Data Sources (FTP)
            </h1>
            <p className="text-xs font-mono text-muted-foreground mt-2 uppercase tracking-widest">
              Automated ingestion pipelines for remote files
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" className="rounded-none border-border/50 hover:bg-brand/10 hover:text-brand hover:border-brand/50 transition-colors" onClick={() => queryClient.invalidateQueries({ queryKey: ["ftp-sources"] })}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canManage && (
              <Button size="sm" className="gap-2 rounded-none bg-brand hover:bg-brand/80 text-black font-mono uppercase tracking-widest text-xs" onClick={() => { setEditId(null); setForm(defaultForm()); setShowForm(true); }}>
                <Plus className="h-3.5 w-3.5" /> Add Pipeline
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Configured",    value: sources.length,                                    color: "text-foreground" },
            { label: "Active Polling",   value: sources.filter((s) => s.active).length,            color: "text-status-normal drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" },
            { label: "Failing", value: sources.filter((s) => s.lastError).length,         color: "text-status-fault drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]" },
          ].map(({ label, value, color }) => (
            <div key={label} className="border border-border/50 bg-card/40 backdrop-blur-md px-5 py-4 relative group overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-brand/50 transition-colors" />
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{label}</p>
              <p className={`text-3xl font-mono mt-2 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Source list */}
        {isLoading ? (
          <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-brand" /></div>
        ) : sources.length === 0 ? (
          <div className="border border-dashed border-border/50 p-12 text-center bg-card/20 backdrop-blur-sm">
            <Server className="h-8 w-8 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="text-sm font-mono uppercase tracking-widest text-foreground/80">No Ingestion Pipelines</p>
            <p className="text-xs font-mono text-muted-foreground mt-2 uppercase tracking-widest">Add a pipeline to begin automated polling</p>
            {canManage && (
              <Button size="sm" variant="outline" className="mt-6 gap-2 rounded-none border-brand/50 text-brand hover:bg-brand/10 uppercase tracking-widest font-mono text-xs" onClick={() => setShowForm(true)}>
                <Plus className="h-3.5 w-3.5" /> Initialize Pipeline
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {sources.map((s) => (
              <SourceCard
                key={s.id} source={s} canManage={canManage}
                onEdit={() => openEdit(s)}
                onDelete={() => { if (confirm(`Delete pipeline "${s.name}"?`)) deleteMutation.mutate(s.id); }}
                onTest={() => testSource(s.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-none border-border/50 bg-background/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-widest text-brand">{editId ? "Configure Pipeline" : "Initialize Pipeline"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Pipeline Designation <span className="text-status-fault">*</span></Label>
              <Input className="rounded-none font-mono text-sm border-border/50 focus-visible:border-brand/50 focus-visible:ring-0 bg-card/40" placeholder="e.g. SUNGROW_LOGGER_01"
                value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Protocol</Label>
                <Select value={form.protocol} onValueChange={(v) => {
                  const p = v as "ftp" | "ftps" | "sftp";
                  setForm((f) => ({ ...f, protocol: p, port: p === "sftp" ? "22" : "21" }));
                }}>
                  <SelectTrigger className="rounded-none font-mono text-sm border-border/50 bg-card/40"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none border-border/50 font-mono text-sm">
                    <SelectItem value="ftp">FTP</SelectItem>
                    <SelectItem value="ftps">FTPS (SSL)</SelectItem>
                    <SelectItem value="sftp">SFTP (SSH)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Port</Label>
                <Input className="rounded-none font-mono text-sm border-border/50 bg-card/40" type="number" value={form.port}
                  onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Target Host <span className="text-status-fault">*</span></Label>
                <Input className="rounded-none font-mono text-sm border-border/50 bg-card/40" placeholder="ftp.domain.com"
                  value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} />
              </div>
              <div>
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Username <span className="text-status-fault">*</span></Label>
                <Input className="rounded-none font-mono text-sm border-border/50 bg-card/40" value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
              </div>
              <div>
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Authentication {editId && <span className="opacity-50">(Blank to keep)</span>}</Label>
                <Input className="rounded-none font-mono text-sm border-border/50 bg-card/40" type="password" value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
              </div>
              <div>
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Remote Path</Label>
                <Input className="rounded-none font-mono text-sm border-border/50 bg-card/40" placeholder="/export/data"
                  value={form.remotePath} onChange={(e) => setForm((f) => ({ ...f, remotePath: e.target.value }))} />
              </div>
              <div>
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">File Mask</Label>
                <Input className="rounded-none font-mono text-sm border-border/50 bg-card/40" placeholder="*.csv"
                  value={form.filePattern} onChange={(e) => setForm((f) => ({ ...f, filePattern: e.target.value }))} />
              </div>
              <div>
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Poll Interval (Min)</Label>
                <Input className="rounded-none font-mono text-sm border-border/50 bg-card/40" type="number" min={1} max={1440} value={form.intervalMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, intervalMinutes: e.target.value }))} />
              </div>
              <div>
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Target Device Link</Label>
                <Select value={form.deviceId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, deviceId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="rounded-none font-mono text-sm border-border/50 bg-card/40"><SelectValue placeholder="UNLINKED" /></SelectTrigger>
                  <SelectContent className="rounded-none border-border/50 font-mono text-sm">
                    <SelectItem value="none">UNLINKED</SelectItem>
                    {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-6 border-t border-border/50">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || !form.host} className="gap-2 rounded-none bg-brand hover:bg-brand/80 text-black font-mono uppercase tracking-widest text-xs flex-1">
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {editId ? "Update Pipeline" : "Deploy Pipeline"}
              </Button>
              <Button variant="outline" className="rounded-none border-border/50 font-mono uppercase tracking-widest text-xs" onClick={() => setShowForm(false)}>Abort</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
