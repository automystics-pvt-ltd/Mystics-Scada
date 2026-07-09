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
  modbus_tcp:  { label: "Modbus TCP",  icon: Zap,    color: "text-amber-400 bg-amber-400/10 border-amber-400/30" },
  modbus_rtu:  { label: "Modbus RTU",  icon: Zap,    color: "text-amber-400 bg-amber-400/10 border-amber-400/30" },
  mqtt:        { label: "MQTT",        icon: Radio,   color: "text-blue-400 bg-blue-400/10 border-blue-400/30" },
  http:        { label: "HTTP",        icon: Globe,   color: "text-green-400 bg-green-400/10 border-green-400/30" },
  websocket:   { label: "WebSocket",   icon: Wifi,    color: "text-purple-400 bg-purple-400/10 border-purple-400/30" },
};

function ProtocolBadge({ protocol }: { protocol: string }) {
  const meta = PROTOCOL_META[protocol] ?? { label: protocol.toUpperCase(), icon: Cpu, color: "text-muted-foreground bg-muted border-border" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function FieldMapTable({ fields }: { fields: FieldDef[] }) {
  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No fields defined — custom device, fill in manually.</p>;
  }
  return (
    <div className="rounded border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/30 border-b border-border">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Parameter</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Unit</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Address / Path</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Scale</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.key} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">{f.label}</div>
                <div className="text-muted-foreground font-mono text-[10px]">{f.key}</div>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{f.unit || "—"}</td>
              <td className="px-3 py-2 font-mono">
                {f.address !== undefined
                  ? <span className="text-amber-400">{f.address}{f.length && f.length > 1 ? `+${f.length - 1}` : ""}</span>
                  : f.jsonPath
                    ? <span className="text-blue-400">{f.jsonPath}</span>
                    : "—"
                }
              </td>
              <td className="px-3 py-2 text-muted-foreground">{f.dataType ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {f.multiplier != null && f.multiplier !== 1 ? `×${f.multiplier}` : "—"}
                {f.offset ? ` +${f.offset}` : ""}
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              Device Template Library
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {templates.length} templates — select one when registering a new device to auto-fill its register map
            </p>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate("/devices")}>
                <Cpu className="h-4 w-4" /> Register Device
              </Button>
              <Button size="sm" className="gap-2" onClick={() => navigate("/device-templates/new")}>
                <Plus className="h-4 w-4" /> Create Template
              </Button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search manufacturer or model…"
              className="pl-8 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["all", ...protocols].map((p) => (
              <button
                key={p}
                onClick={() => setFilterProtocol(p)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filterProtocol === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-foreground/40"
                }`}
              >
                {p === "all" ? "All protocols" : (PROTOCOL_META[p]?.label ?? p.toUpperCase())}
              </button>
            ))}
          </div>
        </div>

        {/* Template groups */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Loading templates…</p>
        ) : (
          Object.entries(grouped).map(([category, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={category} className="space-y-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{category}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group"
                      onClick={() => setSelected(t)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="font-semibold text-sm leading-tight">{t.manufacturer}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{t.model}</div>
                        </div>
                        {t.orgId === null ? (
                          <Badge variant="outline" className="text-[10px] border-primary/30 text-primary shrink-0">System</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] shrink-0">Custom</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <ProtocolBadge protocol={t.protocol} />
                        <span className="text-[10px] text-muted-foreground">
                          {t.fieldMap.length} field{t.fieldMap.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs text-primary flex items-center gap-1">
                          View register map <ChevronRight className="h-3 w-3" />
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>
                    {selected.manufacturer} — {selected.model}
                  </span>
                  <div className="flex items-center gap-2 mr-6">
                    <ProtocolBadge protocol={selected.protocol} />
                    {selected.orgId === null && (
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">System</Badge>
                    )}
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded border border-border bg-muted/20 px-3 py-2">
                    <span className="text-muted-foreground text-xs">Default poll interval</span>
                    <div className="font-medium">{selected.defaultPollIntervalS}s</div>
                  </div>
                  <div className="rounded border border-border bg-muted/20 px-3 py-2">
                    <span className="text-muted-foreground text-xs">Field count</span>
                    <div className="font-medium">{selected.fieldMap.length} parameters</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Register / Field Map</h3>
                  <FieldMapTable fields={selected.fieldMap} />
                </div>

                <p className="text-xs text-muted-foreground bg-muted/20 rounded p-3">
                  💡 To customise this template for your organisation, clone it — you'll get an editable copy while the system original remains unchanged.
                </p>
              </div>

              <DialogFooter className="gap-2">
                {selected.orgId === null && canManage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => cloneMutation.mutate(selected.id)}
                    disabled={cloneMutation.isPending}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {cloneMutation.isPending ? "Cloning…" : "Clone to Custom"}
                  </Button>
                )}
                {selected.orgId !== null && canManage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      setSelected(null);
                      navigate(`/device-templates/${selected.id}/edit`);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Template
                  </Button>
                )}
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    setSelected(null);
                    navigate(`/devices?templateId=${selected.id}`);
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  Use This Template
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
