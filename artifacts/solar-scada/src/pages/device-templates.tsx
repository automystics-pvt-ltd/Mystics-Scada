import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, Search, Plus, Copy, ChevronRight, Cpu, X, Check,
  Radio, Globe, Zap, Wifi, Pencil,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL;

interface FieldDef {
  key: string;
  label: string;
  unit: string;
  address?: number;
  length?: number;
  dataType?: string;
  multiplier?: number;
  offset?: number;
  jsonPath?: string;
}

interface Template {
  id: string;
  orgId: string | null;
  manufacturer: string;
  model: string;
  protocol: string;
  fieldMap: FieldDef[];
  defaultPollIntervalS: number;
  firmwareVersionParam: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const PROTOCOL_META: Record<string, { label: string; icon: typeof Cpu; color: string }> = {
  modbus_tcp:  { label: "MODBUS TCP",  icon: Zap,    color: "text-status-warning bg-status-warning/10 border-status-warning/30" },
  modbus_rtu:  { label: "MODBUS RTU",  icon: Zap,    color: "text-status-warning bg-status-warning/10 border-status-warning/30" },
  mqtt:        { label: "MQTT",        icon: Radio,   color: "text-brand bg-brand/10 border-brand/30" },
  http:        { label: "HTTP",        icon: Globe,   color: "text-status-normal bg-status-normal/10 border-status-normal/30" },
  websocket:   { label: "WEBSOCKET",   icon: Wifi,    color: "text-purple-400 bg-purple-400/10 border-purple-400/30" },
};

function ProtocolBadge({ protocol }: { protocol: string }) {
  const meta = PROTOCOL_META[protocol] ?? { label: protocol.toUpperCase(), icon: Cpu, color: "text-muted-foreground bg-muted/20 border-border/50" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono tracking-widest px-2 py-0.5 rounded-none border ${meta.color}`}>
      <meta.icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function FieldMapTable({ fields }: { fields: FieldDef[] }) {
  if (fields.length === 0) {
    return <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest italic p-4 text-center border border-dashed border-border/50 bg-black/20">UNMAPPED — CUSTOM DEVICE DEFINITION REQUIRED</p>;
  }
  return (
    <div className="border border-border/50 bg-black/40 overflow-hidden">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="bg-muted/10 border-b border-border/50">
            <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Parameter</th>
            <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Unit</th>
            <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Address/Path</th>
            <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Type</th>
            <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Scale</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.key} className="border-b border-border/20 last:border-0 hover:bg-brand/5 transition-colors">
              <td className="px-3 py-2">
                <div className="text-foreground/90 uppercase tracking-wider">{f.label}</div>
                <div className="text-muted-foreground text-[9px] mt-0.5">{f.key}</div>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{f.unit || "—"}</td>
              <td className="px-3 py-2">
                {f.address !== undefined
                  ? <span className="text-status-warning">{f.address}{f.length && f.length > 1 ? `+${f.length - 1}` : ""}</span>
                  : f.jsonPath
                    ? <span className="text-brand/80">{f.jsonPath}</span>
                    : "—"
                }
              </td>
              <td className="px-3 py-2 text-muted-foreground uppercase">{f.dataType ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {f.multiplier != null && f.multiplier !== 1 ? <span className="text-brand">×{f.multiplier}</span> : "—"}
                {f.offset ? <span className="text-brand ml-1">+{f.offset}</span> : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CATEGORY_ORDER = ["Inverters", "Gateways", "Meters", "Generic"];

function categorize(t: Template): string {
  const mfr = t.manufacturer.toLowerCase();
  if (["huawei", "sungrow", "fronius", "growatt", "abb", "solis", "delta", "schneider electric"].includes(mfr)) return "Inverters";
  if (["teltonika", "moxa", "advantech"].includes(mfr)) return "Gateways";
  if (mfr.includes("meter") || t.model.toLowerCase().includes("meter")) return "Meters";
  return "Generic";
}

export default function DeviceTemplatesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("device.manage") ?? false;

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Template | null>(null);
  const [filterProtocol, setFilterProtocol] = useState<string>("all");

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["device-templates"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/device-templates`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load templates");
      return r.json() as Promise<Template[]>;
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${BASE}api/device-templates/${id}/clone`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error("Clone failed");
      return r.json() as Promise<Template>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["device-templates"] });
      toast({ title: "Template cloned", description: "Custom copy added to your organisation." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = templates.filter((t) => {
    if (filterProtocol !== "all" && t.protocol !== filterProtocol) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.manufacturer.toLowerCase().includes(q) && !t.model.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Group by category
  const grouped = CATEGORY_ORDER.reduce<Record<string, Template[]>>((acc, cat) => {
    acc[cat] = filtered.filter((t) => categorize(t) === cat);
    return acc;
  }, {});

  const protocols = [...new Set(templates.map((t) => t.protocol))].sort();

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 pb-6">
          <div>
            <h1 className="text-2xl font-mono uppercase tracking-widest flex items-center gap-3 text-foreground/90">
              <BookOpen className="h-6 w-6 text-brand" />
              Device Profiles
            </h1>
            <p className="text-xs font-mono text-muted-foreground mt-2 uppercase tracking-widest">
              {templates.length} DEFINED PROFILES — REGISTRY MAPS & DATA EXTRACTION RULES
            </p>
          </div>
          {canManage && (
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" className="gap-2 rounded-none border-border/50 hover:bg-brand/10 hover:text-brand hover:border-brand/50 uppercase tracking-widest font-mono text-xs transition-colors" onClick={() => navigate("/devices")}>
                <Cpu className="h-4 w-4" /> Initialize Device
              </Button>
              <Button size="sm" className="gap-2 rounded-none bg-brand hover:bg-brand/80 text-black uppercase tracking-widest font-mono text-xs" onClick={() => navigate("/device-templates/new")}>
                <Plus className="h-4 w-4" /> Author Profile
              </Button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="QUERY MANUFACTURER / MODEL..."
              className="pl-9 h-9 rounded-none border-border/50 bg-black/40 font-mono text-sm uppercase focus-visible:border-brand/50 focus-visible:ring-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["all", ...protocols].map((p) => (
              <button
                key={p}
                onClick={() => setFilterProtocol(p)}
                className={`text-[10px] font-mono uppercase tracking-widest px-3 py-2 border transition-colors ${
                  filterProtocol === p
                    ? "bg-brand/20 text-brand border-brand/50 shadow-[0_0_10px_rgba(0,255,170,0.2)]"
                    : "bg-black/20 border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground/80"
                }`}
              >
                {p === "all" ? "ALL PROTOCOLS" : (PROTOCOL_META[p]?.label ?? p.toUpperCase())}
              </button>
            ))}
          </div>
        </div>

        {/* Template groups */}
        {isLoading ? (
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand text-center py-12 animate-pulse">Scanning Profile Registry…</p>
        ) : (
          Object.entries(grouped).map(([category, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={category} className="space-y-4">
                <h2 className="text-xs font-mono font-bold text-foreground/50 uppercase tracking-[0.2em] border-b border-border/30 pb-2">{category}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className="border border-border/50 bg-card/40 backdrop-blur-md p-5 hover:border-brand/50 transition-all cursor-pointer group relative overflow-hidden"
                      onClick={() => setSelected(t)}
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-brand transition-colors" />
                      <div className="absolute top-0 left-0 w-full h-full bg-brand/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      
                      <div className="flex items-start justify-between gap-2 mb-4 relative z-10">
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-sm leading-tight uppercase truncate text-foreground/90">{t.manufacturer}</div>
                          <div className="text-[10px] font-mono text-muted-foreground mt-1 uppercase tracking-widest truncate">{t.model}</div>
                        </div>
                        {t.orgId === null ? (
                          <Badge variant="outline" className="text-[9px] rounded-none border-brand/40 text-brand bg-brand/5 shrink-0 uppercase tracking-widest font-mono">SYS</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] rounded-none border-border/50 text-foreground/70 shrink-0 uppercase tracking-widest font-mono bg-black/40">CST</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between relative z-10">
                        <ProtocolBadge protocol={t.protocol} />
                        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                          {t.fieldMap.length} <span className="opacity-50">PTS</span>
                        </span>
                      </div>
                      <div className="mt-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity relative z-10">
                        <span className="text-[10px] uppercase tracking-widest font-mono text-brand flex items-center gap-1">
                          Inspect Registry <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Template detail drawer */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-none border-border/50 bg-background/95 backdrop-blur-xl">
          {selected && (
            <>
              <DialogHeader className="border-b border-border/50 pb-4">
                <DialogTitle className="flex items-center justify-between font-mono uppercase tracking-widest text-foreground/90">
                  <span>
                    {selected.manufacturer} <span className="text-muted-foreground/50 mx-2">/</span> {selected.model}
                  </span>
                  <div className="flex items-center gap-3 mr-6">
                    <ProtocolBadge protocol={selected.protocol} />
                    {selected.orgId === null && (
                      <Badge variant="outline" className="text-[9px] rounded-none border-brand/40 text-brand bg-brand/5 uppercase tracking-widest font-mono">SYSTEM</Badge>
                    )}
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-border/50 bg-black/40 px-4 py-3 relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-border/50" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">POLL CYCLE</span>
                    <div className="font-mono text-xl mt-1 text-foreground/90">{selected.defaultPollIntervalS}<span className="text-sm text-muted-foreground ml-1">SEC</span></div>
                  </div>
                  <div className="border border-border/50 bg-black/40 px-4 py-3 relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-border/50" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">DATA POINTS</span>
                    <div className="font-mono text-xl mt-1 text-foreground/90">{selected.fieldMap.length}</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-foreground/50 mb-3">Register Allocation Map</h3>
                  <FieldMapTable fields={selected.fieldMap} />
                </div>

                {selected.orgId === null && (
                  <p className="text-[10px] font-mono uppercase tracking-widest text-brand bg-brand/5 border border-brand/20 p-3">
                    <span className="font-bold mr-2">SYS_LOCK:</span> This is a global profile. Clone to your organisation to modify definitions.
                  </p>
                )}
              </div>

              <DialogFooter className="gap-3 border-t border-border/50 pt-4">
                {selected.orgId === null && canManage && (
                  <Button
                    variant="outline"
                    className="gap-2 rounded-none border-brand/50 text-brand hover:bg-brand/10 font-mono text-[10px] uppercase tracking-widest"
                    onClick={() => cloneMutation.mutate(selected.id)}
                    disabled={cloneMutation.isPending}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {cloneMutation.isPending ? "CLONING..." : "FORK TO CUSTOM"}
                  </Button>
                )}
                {selected.orgId !== null && canManage && (
                  <Button
                    variant="outline"
                    className="gap-2 rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest hover:text-foreground/80"
                    onClick={() => {
                      setSelected(null);
                      navigate(`/device-templates/${selected.id}/edit`);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    MODIFY PROFILE
                  </Button>
                )}
                <Button
                  className="gap-2 rounded-none bg-brand hover:bg-brand/80 text-black font-mono text-[10px] uppercase tracking-widest"
                  onClick={() => {
                    setSelected(null);
                    navigate(`/devices?templateId=${selected.id}`);
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  INITIALIZE DEVICE
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
