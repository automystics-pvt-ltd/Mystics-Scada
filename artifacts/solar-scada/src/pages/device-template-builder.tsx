/**
 * No-code Device Template Builder
 * Create and edit device templates + field maps without writing any code.
 */
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown,
  Save, Cpu, CheckCircle2, AlertCircle, GripVertical,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

type Protocol = "modbus_tcp" | "modbus_rtu" | "mqtt" | "http" | "websocket";

interface FieldDef {
  key: string;
  label: string;
  unit: string;
  address?: number;
  length?: number;
  dataType?: "INT16" | "UINT16" | "INT32" | "UINT32" | "FLOAT32";
  multiplier?: number;
  offset?: number;
  jsonPath?: string;
  alarmHigh?: number;
  alarmLow?: number;
}

interface Template {
  id: string;
  orgId: string | null;
  manufacturer: string;
  model: string;
  protocol: Protocol;
  fieldMap: FieldDef[];
  defaultPollIntervalS: number;
  firmwareVersionParam: string | null;
  status: string;
}

const PROTOCOLS: { value: Protocol; label: string }[] = [
  { value: "modbus_tcp",  label: "Modbus TCP" },
  { value: "modbus_rtu",  label: "Modbus RTU" },
  { value: "mqtt",        label: "MQTT" },
  { value: "http",        label: "HTTP / REST API" },
  { value: "websocket",   label: "WebSocket" },
];

const DATA_TYPES = ["UINT16", "INT16", "UINT32", "INT32", "FLOAT32"] as const;

const COMMON_PARAMS = [
  { key: "ac_power_w",       label: "AC Power",          unit: "W"   },
  { key: "dc_power_w",       label: "DC Power",          unit: "W"   },
  { key: "daily_yield_kwh",  label: "Daily Yield",       unit: "kWh" },
  { key: "total_yield_kwh",  label: "Total Yield",       unit: "kWh" },
  { key: "grid_voltage_v",   label: "Grid Voltage",      unit: "V"   },
  { key: "grid_freq_hz",     label: "Grid Frequency",    unit: "Hz"  },
  { key: "inverter_temp_c",  label: "Inverter Temp",     unit: "°C"  },
  { key: "irradiance_wm2",   label: "Irradiance",        unit: "W/m²"},
  { key: "ambient_temp_c",   label: "Ambient Temp",      unit: "°C"  },
  { key: "wind_speed_ms",    label: "Wind Speed",        unit: "m/s" },
  { key: "efficiency_pct",   label: "Efficiency",        unit: "%"   },
  { key: "pr_pct",           label: "Performance Ratio", unit: "%"   },
];

function emptyField(): FieldDef {
  return { key: "", label: "", unit: "" };
}

// ── Field Editor Modal ────────────────────────────────────────────────────────

function FieldEditor({
  field, protocol, open, onSave, onClose,
}: {
  field: FieldDef;
  protocol: Protocol;
  open: boolean;
  onSave: (f: FieldDef) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<FieldDef>({ ...field });
  const isModbus = protocol === "modbus_tcp" || protocol === "modbus_rtu";

  useEffect(() => { setF({ ...field }); }, [field, open]);

  function applyPreset(preset: typeof COMMON_PARAMS[0]) {
    setF((prev) => ({ ...prev, key: preset.key, label: preset.label, unit: preset.unit }));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{f.key ? "Edit Field" : "Add Field"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Preset quick-fill */}
          <div>
            <Label className="text-xs text-muted-foreground">Quick-fill from common parameters</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {COMMON_PARAMS.slice(0, 8).map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p)}
                  className="text-[10px] px-2 py-1 rounded border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Parameter Key <span className="text-red-400">*</span></Label>
              <Input
                className="mt-1 font-mono text-sm"
                placeholder="ac_power_w"
                value={f.key}
                onChange={(e) => setF((v) => ({ ...v, key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">snake_case identifier</p>
            </div>
            <div>
              <Label>Display Label <span className="text-red-400">*</span></Label>
              <Input
                className="mt-1"
                placeholder="AC Power"
                value={f.label}
                onChange={(e) => setF((v) => ({ ...v, label: e.target.value }))}
              />
            </div>
            <div>
              <Label>Engineering Unit</Label>
              <Input
                className="mt-1"
                placeholder="W, kWh, V, °C…"
                value={f.unit}
                onChange={(e) => setF((v) => ({ ...v, unit: e.target.value }))}
              />
            </div>
            {isModbus ? (
              <>
                <div>
                  <Label>Register Address <span className="text-red-400">*</span></Label>
                  <Input
                    className="mt-1"
                    type="number"
                    placeholder="30001"
                    value={f.address ?? ""}
                    onChange={(e) => setF((v) => ({ ...v, address: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                </div>
                <div>
                  <Label>Register Length</Label>
                  <Select
                    value={String(f.length ?? 1)}
                    onValueChange={(v) => setF((prev) => ({ ...prev, length: Number(v) }))}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 register (16-bit)</SelectItem>
                      <SelectItem value="2">2 registers (32-bit)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data Type</Label>
                  <Select
                    value={f.dataType ?? "UINT16"}
                    onValueChange={(v) => setF((prev) => ({ ...prev, dataType: v as FieldDef["dataType"] }))}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DATA_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="col-span-2">
                <Label>JSONPath / Field Key <span className="text-red-400">*</span></Label>
                <Input
                  className="mt-1 font-mono text-sm"
                  placeholder="$.data.power or data.power"
                  value={f.jsonPath ?? ""}
                  onChange={(e) => setF((v) => ({ ...v, jsonPath: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Path to this value in the response JSON</p>
              </div>
            )}
            <div>
              <Label>Scale Factor (×)</Label>
              <Input
                className="mt-1"
                type="number"
                step="0.001"
                placeholder="1"
                value={f.multiplier ?? ""}
                onChange={(e) => setF((v) => ({ ...v, multiplier: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
            <div>
              <Label>Offset (+)</Label>
              <Input
                className="mt-1"
                type="number"
                step="0.001"
                placeholder="0"
                value={f.offset ?? ""}
                onChange={(e) => setF((v) => ({ ...v, offset: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
            <div>
              <Label>Alarm: High threshold</Label>
              <Input
                className="mt-1"
                type="number"
                placeholder="optional"
                value={f.alarmHigh ?? ""}
                onChange={(e) => setF((v) => ({ ...v, alarmHigh: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
            <div>
              <Label>Alarm: Low threshold</Label>
              <Input
                className="mt-1"
                type="number"
                placeholder="optional"
                value={f.alarmLow ?? ""}
                onChange={(e) => setF((v) => ({ ...v, alarmLow: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => { if (f.key && f.label) { onSave(f); onClose(); } }}
            disabled={!f.key || !f.label}
          >
            {f.key ? "Save Field" : "Add Field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DeviceTemplateBuilderPage() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEdit = !!id;

  // Form state
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel]               = useState("");
  const [protocol, setProtocol]         = useState<Protocol>("modbus_tcp");
  const [pollInterval, setPollInterval] = useState(30);
  const [fwParam, setFwParam]           = useState("");
  const [fields, setFields]             = useState<FieldDef[]>([]);

  // Field editor state
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [addingNew, setAddingNew]   = useState(false);

  // Load existing template for edit mode
  const { isLoading } = useQuery<Template>({
    queryKey: ["device-template", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/device-templates/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Template not found");
      return r.json() as Promise<Template>;
    },
    enabled: isEdit,
    onSuccess: (t: Template) => {
      setManufacturer(t.manufacturer);
      setModel(t.model);
      setProtocol(t.protocol);
      setPollInterval(t.defaultPollIntervalS);
      setFwParam(t.firmwareVersionParam ?? "");
      setFields(t.fieldMap);
    },
  } as Parameters<typeof useQuery<Template>>[0]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { manufacturer, model, protocol, fieldMap: fields, defaultPollIntervalS: pollInterval, firmwareVersionParam: fwParam || undefined };
      const url   = isEdit ? `${BASE}api/device-templates/${id}` : `${BASE}api/device-templates`;
      const method = isEdit ? "PATCH" : "POST";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Save failed");
      }
      return r.json() as Promise<Template>;
    },
    onSuccess: (t) => {
      void queryClient.invalidateQueries({ queryKey: ["device-templates"] });
      toast({ title: isEdit ? "Template updated" : "Template created", description: `${t.manufacturer} ${t.model} saved.` });
      navigate("/device-templates");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function moveField(idx: number, dir: -1 | 1) {
    const next = [...fields];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    setFields(next);
  }

  function removeField(idx: number) {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  }

  function saveField(f: FieldDef) {
    if (addingNew) {
      setFields((prev) => [...prev, f]);
      setAddingNew(false);
    } else if (editingIdx !== null) {
      setFields((prev) => prev.map((existing, i) => i === editingIdx ? f : existing));
      setEditingIdx(null);
    }
  }

  const isModbus = protocol === "modbus_tcp" || protocol === "modbus_rtu";
  const canSave  = manufacturer.trim() && model.trim() && !saveMutation.isPending;

  if (isEdit && isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">Loading template…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/device-templates")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isEdit ? "Edit Template" : "Create Device Template"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isEdit ? "Update fields and configuration" : "Define registers, fields, and scaling for a new device type"}
            </p>
          </div>
        </div>

        {/* Template metadata */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">Device Identity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Manufacturer <span className="text-red-400">*</span></Label>
              <Input className="mt-1" placeholder="Huawei, Sungrow, Custom…" value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)} />
            </div>
            <div>
              <Label>Model / Series <span className="text-red-400">*</span></Label>
              <Input className="mt-1" placeholder="SUN2000-50KTL, Custom Inverter…" value={model}
                onChange={(e) => setModel(e.target.value)} />
            </div>
            <div>
              <Label>Protocol <span className="text-red-400">*</span></Label>
              <Select value={protocol} onValueChange={(v) => setProtocol(v as Protocol)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROTOCOLS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default Poll Interval (seconds)</Label>
              <Input className="mt-1" type="number" min={5} max={3600} value={pollInterval}
                onChange={(e) => setPollInterval(Number(e.target.value) || 30)} />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <Label>Firmware Version Parameter Key <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input className="mt-1 font-mono text-sm" placeholder="firmware_version"
                value={fwParam} onChange={(e) => setFwParam(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                The field key whose value holds the firmware version string
              </p>
            </div>
          </div>
        </div>

        {/* Field map */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">
                {isModbus ? "Register Map" : "Field Map"}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{fields.length} field{fields.length !== 1 ? "s" : ""}</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isModbus
                  ? "Define each Modbus register — address, data type, scaling factor, and engineering unit."
                  : "Define each JSON field to extract from the response — path, scaling, and unit."}
              </p>
            </div>
            <Button size="sm" className="gap-2" onClick={() => setAddingNew(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Field
            </Button>
          </div>

          {fields.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Cpu className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">No fields yet</p>
              <p className="text-xs text-muted-foreground mt-1">Click "Add Field" to define your first parameter.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="w-6 px-2 py-2" />
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Parameter</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Unit</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">{isModbus ? "Address" : "Path"}</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">{isModbus ? "Type" : "Scale"}</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Alarms</th>
                    <th className="w-24 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/10 cursor-pointer"
                      onClick={() => setEditingIdx(idx)}
                    >
                      <td className="px-2 py-2 text-muted-foreground">
                        <GripVertical className="h-3.5 w-3.5" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{f.label}</div>
                        <div className="text-muted-foreground font-mono text-[10px]">{f.key}</div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{f.unit || "—"}</td>
                      <td className="px-3 py-2 font-mono">
                        {isModbus
                          ? <span className="text-amber-400">{f.address ?? "—"}{f.length && f.length > 1 ? `+${f.length - 1}` : ""}</span>
                          : <span className="text-blue-400 truncate max-w-24 block">{f.jsonPath ?? "—"}</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {isModbus ? (f.dataType ?? "UINT16") : (f.multiplier && f.multiplier !== 1 ? `×${f.multiplier}` : "—")}
                      </td>
                      <td className="px-3 py-2">
                        {(f.alarmHigh != null || f.alarmLow != null) ? (
                          <span className="text-amber-400">
                            {f.alarmLow != null ? `↓${f.alarmLow}` : ""}
                            {f.alarmHigh != null ? ` ↑${f.alarmHigh}` : ""}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={(e) => { e.stopPropagation(); moveField(idx, -1); }}
                            className="p-1 hover:text-foreground text-muted-foreground" disabled={idx === 0}>
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); moveField(idx, 1); }}
                            className="p-1 hover:text-foreground text-muted-foreground" disabled={idx === fields.length - 1}>
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); removeField(idx); }}
                            className="p-1 hover:text-red-400 text-muted-foreground">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Save bar */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-3">
          <div className="text-sm text-muted-foreground">
            {fields.length} field{fields.length !== 1 ? "s" : ""} defined
            {fields.length > 0 && <span className="ml-2 text-green-400 flex items-center gap-1 inline-flex"><CheckCircle2 className="h-3.5 w-3.5" /> ready</span>}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => navigate("/device-templates")}>Cancel</Button>
            <Button
              className="gap-2"
              onClick={() => saveMutation.mutate()}
              disabled={!canSave}
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Template"}
            </Button>
          </div>
        </div>
      </div>

      {/* Field editor modal */}
      <FieldEditor
        field={addingNew ? emptyField() : (editingIdx !== null ? (fields[editingIdx] ?? emptyField()) : emptyField())}
        protocol={protocol}
        open={addingNew || editingIdx !== null}
        onSave={saveField}
        onClose={() => { setAddingNew(false); setEditingIdx(null); }}
      />
    </AppLayout>
  );
}
