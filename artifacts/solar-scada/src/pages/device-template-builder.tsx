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
  Upload, Calculator, AlertTriangle,
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

type Protocol = "modbus_tcp" | "modbus_rtu" | "mqtt" | "http" | "websocket" | "opcua" | "bacnet";

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
  // OPC-UA
  nodeId?: string;
  samplingIntervalMs?: number;
  // BACnet/IP
  objectType?: string;
  objectInstance?: number;
  propertyId?: string;
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
  { value: "opcua",       label: "OPC-UA" },
  { value: "bacnet",      label: "BACnet/IP" },
];

const BACNET_OBJECT_TYPES = ["analogInput", "analogOutput", "analogValue", "binaryInput", "binaryOutput", "binaryValue", "multiStateInput", "multiStateOutput", "multiStateValue"] as const;
const BACNET_PROPERTIES = ["presentValue", "statusFlags", "reliability", "outOfService"] as const;

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
  const isOpcua = protocol === "opcua";
  const isBacnet = protocol === "bacnet";

  useEffect(() => { setF({ ...field }); }, [field, open]);

  function applyPreset(preset: typeof COMMON_PARAMS[0]) {
    setF((prev) => ({ ...prev, key: preset.key, label: preset.label, unit: preset.unit }));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl rounded-none border-border/50 bg-background/95 backdrop-blur-xl">
        <DialogHeader className="border-b border-border/50 pb-4">
          <DialogTitle className="font-mono uppercase tracking-widest text-brand">{f.key ? "MODIFY DATA POINT" : "ALLOCATE DATA POINT"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Preset quick-fill */}
          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Quick-Fill Taxonomy</Label>
            <div className="flex flex-wrap gap-2">
              {COMMON_PARAMS.slice(0, 8).map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p)}
                  className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 bg-black/40 border border-border/50 hover:border-brand/50 hover:text-brand hover:bg-brand/5 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Telemetry Key <span className="text-status-fault">*</span></Label>
              <Input
                className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50"
                placeholder="ac_power_w"
                value={f.key}
                onChange={(e) => setF((v) => ({ ...v, key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
              />
              <p className="font-mono text-[9px] uppercase tracking-widest text-brand/70 mt-1">SNAKE_CASE_ID</p>
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Display Designation <span className="text-status-fault">*</span></Label>
              <Input
                className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 uppercase"
                placeholder="AC Power"
                value={f.label}
                onChange={(e) => setF((v) => ({ ...v, label: e.target.value }))}
              />
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Engineering Unit</Label>
              <Input
                className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50"
                placeholder="W, KWH, V, °C..."
                value={f.unit}
                onChange={(e) => setF((v) => ({ ...v, unit: e.target.value }))}
              />
            </div>
            {isModbus ? (
              <>
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Register Address <span className="text-status-fault">*</span></Label>
                  <Input
                    className="rounded-none font-mono text-sm border-border/50 bg-black/40 text-status-warning focus-visible:border-brand/50"
                    type="number"
                    placeholder="30001"
                    value={f.address ?? ""}
                    onChange={(e) => setF((v) => ({ ...v, address: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                </div>
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Register Extent</Label>
                  <Select
                    value={String(f.length ?? 1)}
                    onValueChange={(v) => setF((prev) => ({ ...prev, length: Number(v) }))}
                  >
                    <SelectTrigger className="rounded-none font-mono text-sm border-border/50 bg-black/40"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest bg-background">
                      <SelectItem value="1">1 REG (16-BIT)</SelectItem>
                      <SelectItem value="2">2 REG (32-BIT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Primitive Type</Label>
                  <Select
                    value={f.dataType ?? "UINT16"}
                    onValueChange={(v) => setF((prev) => ({ ...prev, dataType: v as FieldDef["dataType"] }))}
                  >
                    <SelectTrigger className="rounded-none font-mono text-sm border-border/50 bg-black/40 uppercase tracking-widest"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest bg-background">
                      {DATA_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : isOpcua ? (
              <>
                <div className="col-span-2">
                  <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Node ID <span className="text-status-fault">*</span></Label>
                  <Input
                    className="rounded-none font-mono text-sm border-border/50 bg-black/40 text-brand focus-visible:border-brand/50"
                    placeholder="ns=2;i=1002"
                    value={f.nodeId ?? ""}
                    onChange={(e) => setF((v) => ({ ...v, nodeId: e.target.value }))}
                  />
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1">TARGET OPC-UA NODE_ID</p>
                </div>
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Poll Rate (ms)</Label>
                  <Input
                    className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50"
                    type="number"
                    placeholder="1000"
                    value={f.samplingIntervalMs ?? ""}
                    onChange={(e) => setF((v) => ({ ...v, samplingIntervalMs: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                </div>
              </>
            ) : isBacnet ? (
              <>
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Object Class <span className="text-status-fault">*</span></Label>
                  <Select
                    value={f.objectType ?? "analogInput"}
                    onValueChange={(v) => setF((prev) => ({ ...prev, objectType: v }))}
                  >
                    <SelectTrigger className="rounded-none font-mono text-sm border-border/50 bg-black/40 uppercase tracking-widest"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest bg-background">
                      {BACNET_OBJECT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Instance Index <span className="text-status-fault">*</span></Label>
                  <Input
                    className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50"
                    type="number"
                    placeholder="0"
                    value={f.objectInstance ?? ""}
                    onChange={(e) => setF((v) => ({ ...v, objectInstance: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                </div>
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Target Property</Label>
                  <Select
                    value={f.propertyId ?? "presentValue"}
                    onValueChange={(v) => setF((prev) => ({ ...prev, propertyId: v }))}
                  >
                    <SelectTrigger className="rounded-none font-mono text-sm border-border/50 bg-black/40 uppercase tracking-widest"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest bg-background">
                      {BACNET_PROPERTIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="col-span-2">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">JSON Selector <span className="text-status-fault">*</span></Label>
                <Input
                  className="rounded-none font-mono text-sm border-border/50 bg-black/40 text-brand focus-visible:border-brand/50"
                  placeholder="$.data.power or data.power"
                  value={f.jsonPath ?? ""}
                  onChange={(e) => setF((v) => ({ ...v, jsonPath: e.target.value }))}
                />
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1">PAYLOAD EXTRACTION PATH</p>
              </div>
            )}
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Multiplier Scale (×)</Label>
              <Input
                className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50"
                type="number"
                step="0.001"
                placeholder="1"
                value={f.multiplier ?? ""}
                onChange={(e) => setF((v) => ({ ...v, multiplier: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Linear Offset (+)</Label>
              <Input
                className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50"
                type="number"
                step="0.001"
                placeholder="0"
                value={f.offset ?? ""}
                onChange={(e) => setF((v) => ({ ...v, offset: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block text-status-warning">HI-ALARM THRESHOLD</Label>
              <Input
                className="rounded-none font-mono text-sm border-status-warning/30 bg-status-warning/5 focus-visible:border-status-warning/60 text-status-warning"
                type="number"
                placeholder="OPTIONAL"
                value={f.alarmHigh ?? ""}
                onChange={(e) => setF((v) => ({ ...v, alarmHigh: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block text-status-fault">LO-ALARM THRESHOLD</Label>
              <Input
                className="rounded-none font-mono text-sm border-status-fault/30 bg-status-fault/5 focus-visible:border-status-fault/60 text-status-fault"
                type="number"
                placeholder="OPTIONAL"
                value={f.alarmLow ?? ""}
                onChange={(e) => setF((v) => ({ ...v, alarmLow: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-3 border-t border-border/50 pt-4">
          <Button variant="outline" className="rounded-none font-mono text-[10px] uppercase tracking-widest border-border/50 hover:bg-white/5" onClick={onClose}>ABORT</Button>
          <Button
            className="rounded-none bg-brand hover:bg-brand/80 text-black font-mono text-[10px] uppercase tracking-widest"
            onClick={() => { if (f.key && f.label) { onSave(f); onClose(); } }}
            disabled={!f.key || !f.label}
          >
            {f.key ? "COMMIT MODIFICATION" : "COMMIT ALLOCATION"}
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
      <div className="max-w-4xl mx-auto space-y-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-border/50 pb-6">
          <Button variant="ghost" size="icon" className="rounded-none hover:bg-brand/10 hover:text-brand" onClick={() => navigate("/device-templates")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-mono uppercase tracking-widest text-foreground/90 flex items-center gap-3">
              <Cpu className="h-5 w-5 text-brand" />
              {isEdit ? "MODIFY PROFILE" : "AUTHOR PROFILE"}
            </h1>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">
              {isEdit ? "ALTER DATA MAP & EXTRACTION PARAMS" : "INITIALIZE REGISTRY BINDINGS FOR NEW HARDWARE"}
            </p>
          </div>
        </div>

        {/* Template metadata */}
        <div className="border border-border/50 bg-card/40 backdrop-blur-md p-6 relative group">
          <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-brand transition-colors" />
          <h2 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-foreground/50 mb-5">Hardware Identity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Manufacturer <span className="text-status-fault">*</span></Label>
              <Input className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 uppercase" placeholder="HUAWEI, SUNGROW..." value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)} />
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Model Designation <span className="text-status-fault">*</span></Label>
              <Input className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 uppercase" placeholder="SUN2000-50KTL..." value={model}
                onChange={(e) => setModel(e.target.value)} />
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Data Link Protocol <span className="text-status-fault">*</span></Label>
              <Select value={protocol} onValueChange={(v) => setProtocol(v as Protocol)}>
                <SelectTrigger className="rounded-none font-mono text-sm border-border/50 bg-black/40 uppercase tracking-widest"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest bg-background">
                  {PROTOCOLS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Acquisition Cycle (Sec)</Label>
              <Input className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50" type="number" min={5} max={3600} value={pollInterval}
                onChange={(e) => setPollInterval(Number(e.target.value) || 30)} />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Firmware Target Key <span className="opacity-50">(OPTIONAL)</span></Label>
              <Input className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50" placeholder="firmware_version"
                value={fwParam} onChange={(e) => setFwParam(e.target.value)} />
              <p className="font-mono text-[9px] uppercase tracking-widest text-brand/70 mt-1">
                TELEMETRY KEY BOUND TO FIRMWARE SIGNATURE
              </p>
            </div>
          </div>
        </div>

        {/* Field map */}
        <div className="border border-border/50 bg-card/40 backdrop-blur-md relative group">
          <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-brand transition-colors" />
          <div className="p-6 pb-0">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-foreground/50 flex items-center gap-3">
                  {isModbus ? "Register Allocation Map" : "Payload Extraction Map"}
                  <Badge variant="outline" className="rounded-none border-brand/40 text-brand bg-brand/5 text-[9px]">{fields.length} ALLOCATED</Badge>
                </h2>
                <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mt-2">
                  {isModbus
                    ? "BIND REGISTERS TO TELEMETRY KEYS WITH APPROPRIATE PRIMITIVES AND SCALE VECTORS."
                    : "DEFINE JSON SELECTORS TO EXTRACT TELEMETRY POINTS FROM RESPONSE PAYLOAD."}
                </p>
              </div>
              <Button size="sm" className="gap-2 rounded-none bg-brand hover:bg-brand/80 text-black font-mono text-[10px] uppercase tracking-widest" onClick={() => setAddingNew(true)}>
                <Plus className="h-3.5 w-3.5" /> ALLOCATE POINT
              </Button>
            </div>
          </div>

          <div className="p-6">
            {fields.length === 0 ? (
              <div className="border border-dashed border-border/50 p-12 text-center bg-black/20">
                <Cpu className="h-8 w-8 text-brand mx-auto mb-4 opacity-40 animate-pulse" />
                <p className="text-sm font-mono uppercase tracking-widest text-foreground/80">NO ALLOCATIONS</p>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">INITIALIZE YOUR FIRST DATA POINT</p>
              </div>
            ) : (
              <div className="border border-border/50 bg-black/40 overflow-x-auto">
                <table className="w-full text-xs font-mono min-w-[700px]">
                  <thead>
                    <tr className="bg-muted/10 border-b border-border/50">
                      <th className="w-8 px-3 py-3" />
                      <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-muted-foreground">Parameter / Key</th>
                      <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-muted-foreground">Unit</th>
                      <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-muted-foreground">{isModbus ? "Address" : "Selector"}</th>
                      <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-muted-foreground">{isModbus ? "Primitive" : "Scale"}</th>
                      <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-muted-foreground">Alarms (L/H)</th>
                      <th className="w-24 px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-border/20 last:border-0 hover:bg-brand/5 transition-colors cursor-pointer"
                        onClick={() => setEditingIdx(idx)}
                      >
                        <td className="px-3 py-3 text-muted-foreground/30">
                          <GripVertical className="h-4 w-4" />
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-foreground/90 uppercase tracking-wider">{f.label}</div>
                          <div className="text-brand text-[9px] mt-0.5">{f.key}</div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{f.unit || "—"}</td>
                        <td className="px-3 py-3">
                          {isModbus
                            ? <span className="text-status-warning">{f.address ?? "—"}{f.length && f.length > 1 ? `+${f.length - 1}` : ""}</span>
                            : <span className="text-brand/80 truncate max-w-[120px] block">{f.jsonPath ?? "—"}</span>
                          }
                        </td>
                        <td className="px-3 py-3 text-muted-foreground uppercase">
                          {isModbus ? (f.dataType ?? "UINT16") : (f.multiplier && f.multiplier !== 1 ? <span className="text-brand">×{f.multiplier}</span> : "—")}
                        </td>
                        <td className="px-3 py-3">
                          {(f.alarmHigh != null || f.alarmLow != null) ? (
                            <div className="flex items-center gap-2">
                              {f.alarmLow != null ? <span className="text-status-fault text-[10px]">↓{f.alarmLow}</span> : null}
                              {f.alarmHigh != null ? <span className="text-status-warning text-[10px]">↑{f.alarmHigh}</span> : null}
                            </div>
                          ) : <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1 justify-end opacity-50 hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); moveField(idx, -1); }}
                              className="p-1.5 hover:text-brand hover:bg-brand/10 transition-colors disabled:opacity-30" disabled={idx === 0}>
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); moveField(idx, 1); }}
                              className="p-1.5 hover:text-brand hover:bg-brand/10 transition-colors disabled:opacity-30" disabled={idx === fields.length - 1}>
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); removeField(idx); }}
                              className="p-1.5 hover:text-status-fault hover:bg-status-fault/10 transition-colors ml-2">
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
        </div>

        {/* Save bar */}
        <div className="flex items-center justify-between border-t border-border/50 pt-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-3">
            <span>{fields.length} ALLOCATED</span>
            {fields.length > 0 && <span className="text-brand flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> VALID</span>}
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest hover:bg-white/5" onClick={() => navigate("/device-templates")}>ABORT</Button>
            <Button
              className="gap-2 rounded-none bg-brand hover:bg-brand/80 text-black font-mono text-[10px] uppercase tracking-widest shadow-[0_0_15px_rgba(0,255,170,0.3)]"
              onClick={() => saveMutation.mutate()}
              disabled={!canSave}
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? "WRITING TO REGISTRY..." : isEdit ? "COMMIT PROFILE" : "AUTHORIZE PROFILE"}
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
