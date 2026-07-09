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
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${source.active ? "bg-green-400" : "bg-muted-foreground/40"}`} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{source.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {source.protocol.toUpperCase()} · {source.host}:{source.port} · every {source.intervalMinutes} min
          </div>
        </div>
        {source.lastError && (
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" aria-label={source.lastError ?? undefined} />
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {canManage && (
            <>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onTest} title="Test connection"><TestTube2 className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
            </>
          )}
          <button onClick={() => setExpanded((e) => !e)} className="text-muted-foreground hover:text-foreground p-1">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-muted/5 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-muted-foreground">Remote path</span>
            <p className="font-mono mt-0.5 truncate">{source.remotePath}</p>
          </div>
          <div>
            <span className="text-muted-foreground">File pattern</span>
            <p className="font-mono mt-0.5">{source.filePattern}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Last pull</span>
            <p className="mt-0.5">{timeAgo(source.lastPulledAt)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Last file</span>
            <p className="font-mono mt-0.5 truncate">{source.lastPulledFile ?? "—"}</p>
          </div>
          {source.lastError && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Last error</span>
              <p className="mt-0.5 text-red-400 truncate">{source.lastError}</p>
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
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Server className="h-5 w-5" /> FTP / SFTP Sources</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Automatically pull CSV files from remote servers on a schedule</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["ftp-sources"] })}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canManage && (
              <Button size="sm" className="gap-2" onClick={() => { setEditId(null); setForm(defaultForm()); setShowForm(true); }}>
                <Plus className="h-4 w-4" /> Add Source
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total",    value: sources.length,                                    color: "text-foreground" },
            { label: "Active",   value: sources.filter((s) => s.active).length,            color: "text-green-400" },
            { label: "Erroring", value: sources.filter((s) => s.lastError).length,         color: "text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Source list */}
        {isLoading ? (
          <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : sources.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <Server className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No FTP sources configured</p>
            <p className="text-xs text-muted-foreground mt-1">Add a source to start automatically ingesting CSV files from remote servers</p>
            {canManage && (
              <Button size="sm" className="mt-4 gap-2" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> Add First Source
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map((s) => (
              <SourceCard
                key={s.id} source={s} canManage={canManage}
                onEdit={() => openEdit(s)}
                onDelete={() => { if (confirm(`Delete "${s.name}"?`)) deleteMutation.mutate(s.id); }}
                onTest={() => testSource(s.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit FTP Source" : "Add FTP Source"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Source Name <span className="text-red-400">*</span></Label>
              <Input className="mt-1" placeholder="e.g. Sungrow Logger SFTP"
                value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Protocol</Label>
                <Select value={form.protocol} onValueChange={(v) => {
                  const p = v as "ftp" | "ftps" | "sftp";
                  setForm((f) => ({ ...f, protocol: p, port: p === "sftp" ? "22" : "21" }));
                }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ftp">FTP</SelectItem>
                    <SelectItem value="ftps">FTPS (SSL)</SelectItem>
                    <SelectItem value="sftp">SFTP (SSH)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Port</Label>
                <Input className="mt-1" type="number" value={form.port}
                  onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <Label>Host <span className="text-red-400">*</span></Label>
                <Input className="mt-1" placeholder="ftp.example.com or 192.168.1.100"
                  value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} />
              </div>
              <div>
                <Label>Username <span className="text-red-400">*</span></Label>
                <Input className="mt-1" value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
              </div>
              <div>
                <Label>Password {editId && <span className="text-muted-foreground font-normal text-xs">(leave blank to keep)</span>}</Label>
                <Input className="mt-1" type="password" value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
              </div>
              <div>
                <Label>Remote Path</Label>
                <Input className="mt-1 font-mono text-sm" placeholder="/data/exports"
                  value={form.remotePath} onChange={(e) => setForm((f) => ({ ...f, remotePath: e.target.value }))} />
              </div>
              <div>
                <Label>File Pattern</Label>
                <Input className="mt-1 font-mono text-sm" placeholder="*.csv"
                  value={form.filePattern} onChange={(e) => setForm((f) => ({ ...f, filePattern: e.target.value }))} />
              </div>
              <div>
                <Label>Poll Interval (minutes)</Label>
                <Input className="mt-1" type="number" min={1} max={1440} value={form.intervalMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, intervalMinutes: e.target.value }))} />
              </div>
              <div>
                <Label>Target Device <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Select value={form.deviceId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, deviceId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Any device" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked to a device</SelectItem>
                    {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || !form.host} className="gap-2">
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {editId ? "Update Source" : "Create Source"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
