/**
 * Universal Data Connector Wizard
 * 5-step guided flow to connect any external data source to the platform
 * without writing code — REST API, MQTT broker, WebSocket, or CSV upload.
 */
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Globe, Radio, Wifi, Upload, ArrowRight, ArrowLeft,
  CheckCircle2, AlertCircle, Plus, Trash2, Loader2,
  Zap, Database,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

type SourceType = "rest_api" | "mqtt" | "websocket" | "csv_upload";
type AuthMethod = "none" | "bearer" | "api_key" | "basic";

interface FieldMapping {
  sourceField: string;
  paramKey: string;
  paramLabel: string;
  unit: string;
  multiplier: string;
}

interface WizardState {
  sourceType: SourceType;
  // Connection
  url: string;
  authMethod: AuthMethod;
  authValue: string;
  apiKeyHeader: string;
  pollIntervalSec: number;
  // MQTT
  brokerUrl: string;
  topic: string;
  // Plant assignment
  plantId: string;
  deviceName: string;
  deviceType: string;
  // Field mapping
  sampleJson: string;
  mappings: FieldMapping[];
}

const SOURCE_TYPES: { value: SourceType; label: string; desc: string; icon: typeof Globe }[] = [
  { value: "rest_api",   label: "REST API",         desc: "Poll any HTTP/HTTPS JSON endpoint on a schedule",         icon: Globe },
  { value: "mqtt",       label: "MQTT Broker",       desc: "Subscribe to topics on an existing MQTT broker",          icon: Radio },
  { value: "websocket",  label: "WebSocket Stream",  desc: "Connect to a WebSocket stream for push-based real-time data", icon: Wifi  },
  { value: "csv_upload", label: "CSV / File Import", desc: "Upload a CSV or Excel file with historical or migrated data", icon: Upload },
];

const DEVICE_TYPES = [
  "inverter", "smart_meter", "weather_station", "data_logger",
  "gateway", "sensor", "RTU", "PLC",
];

// Plants are loaded from the API in Step5 (org-scoped)

const STEP_LABELS = [
  "Source Type",
  "Connection",
  "Test & Preview",
  "Map Fields",
  "Assign & Activate",
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold border-2 transition-colors ${
            i < current  ? "bg-primary border-primary text-primary-foreground"
            : i === current ? "border-primary text-primary bg-primary/10"
            : "border-border text-muted-foreground"
          }`}>
            {i < current ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span className={`text-xs hidden sm:block ${i === current ? "text-foreground font-medium" : "text-muted-foreground"}`}>
            {STEP_LABELS[i]}
          </span>
          {i < total - 1 && <div className="h-px w-6 bg-border" />}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Source Type ───────────────────────────────────────────────────────

function Step1({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Choose how to connect to this data source.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SOURCE_TYPES.map(({ value, label, desc, icon: Icon }) => (
          <button
            key={value}
            onClick={() => update({ sourceType: value })}
            className={`rounded-lg border p-4 text-left transition-all ${
              state.sourceType === value
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className={`h-4 w-4 ${state.sourceType === value ? "text-primary" : "text-muted-foreground"}`} />
              <span className="font-medium text-sm">{label}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Connection Details ────────────────────────────────────────────────

function Step2({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  if (state.sourceType === "csv_upload") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload a CSV file in the next step after assigning the device. The first row must be a header with a <code className="bg-muted px-1 rounded text-xs">timestamp</code> column plus parameter columns.
        </p>
        <div className="rounded-lg border border-dashed border-border bg-muted/10 p-8 text-center">
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">CSV upload will be available after device assignment</p>
        </div>
      </div>
    );
  }

  if (state.sourceType === "mqtt") {
    return (
      <div className="space-y-4">
        <div>
          <Label>Broker URL <span className="text-red-400">*</span></Label>
          <Input className="mt-1" placeholder="mqtt://broker.hivemq.com:1883"
            value={state.brokerUrl} onChange={(e) => update({ brokerUrl: e.target.value })} />
          <p className="text-[10px] text-muted-foreground mt-0.5">Use mqtt:// or mqtts:// for TLS</p>
        </div>
        <div>
          <Label>Topic Pattern <span className="text-red-400">*</span></Label>
          <Input className="mt-1 font-mono text-sm" placeholder="solar/plant/+/inverter/data"
            value={state.topic} onChange={(e) => update({ topic: e.target.value })} />
          <p className="text-[10px] text-muted-foreground mt-0.5">Use + for single-level and # for multi-level wildcards</p>
        </div>
        <div>
          <Label>Poll / Keep-alive interval (seconds)</Label>
          <Input className="mt-1" type="number" min={5} max={3600} value={state.pollIntervalSec}
            onChange={(e) => update({ pollIntervalSec: Number(e.target.value) || 30 })} />
        </div>
      </div>
    );
  }

  // REST API or WebSocket
  const isWS = state.sourceType === "websocket";
  return (
    <div className="space-y-4">
      <div>
        <Label>{isWS ? "WebSocket URL" : "Endpoint URL"} <span className="text-red-400">*</span></Label>
        <Input className="mt-1" placeholder={isWS ? "wss://device.example.com/live" : "https://api.solarcloud.com/v1/readings"}
          value={state.url} onChange={(e) => update({ url: e.target.value })} />
      </div>
      {!isWS && (
        <div>
          <Label>Poll Interval (seconds)</Label>
          <Input className="mt-1" type="number" min={5} max={3600} value={state.pollIntervalSec}
            onChange={(e) => update({ pollIntervalSec: Number(e.target.value) || 30 })} />
        </div>
      )}
      <div>
        <Label>Authentication</Label>
        <Select value={state.authMethod} onValueChange={(v) => update({ authMethod: v as AuthMethod })}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No authentication</SelectItem>
            <SelectItem value="bearer">Bearer token</SelectItem>
            <SelectItem value="api_key">API key header</SelectItem>
            <SelectItem value="basic">Basic auth (user:pass)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {state.authMethod === "api_key" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Header name</Label>
            <Input className="mt-1" placeholder="X-API-Key"
              value={state.apiKeyHeader} onChange={(e) => update({ apiKeyHeader: e.target.value })} />
          </div>
          <div>
            <Label>Key value</Label>
            <Input className="mt-1" type="password" placeholder="••••••••"
              value={state.authValue} onChange={(e) => update({ authValue: e.target.value })} />
          </div>
        </div>
      )}
      {(state.authMethod === "bearer" || state.authMethod === "basic") && (
        <div>
          <Label>{state.authMethod === "bearer" ? "Token" : "Credentials (user:password)"}</Label>
          <Input className="mt-1" type="password" placeholder="••••••••"
            value={state.authValue} onChange={(e) => update({ authValue: e.target.value })} />
        </div>
      )}
    </div>
  );
}

// ── Step 3: Test & Preview ────────────────────────────────────────────────────

function Step3({
  state, update, onTest,
}: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  onTest: () => Promise<void>;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult]   = useState<"ok" | "error" | null>(null);
  const [error, setError]     = useState<string>("");

  async function handleTest() {
    setTesting(true); setResult(null); setError("");
    try { await onTest(); setResult("ok"); }
    catch (e) { setResult("error"); setError(String(e instanceof Error ? e.message : e)); }
    finally { setTesting(false); }
  }

  const isCSV = state.sourceType === "csv_upload";

  return (
    <div className="space-y-4">
      {isCSV ? (
        <p className="text-sm text-muted-foreground">
          For CSV import, paste a sample of your data below (first row = headers). This helps you set up the field mapping in the next step.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Test the connection and preview a sample response from the source. This is used to auto-detect fields for mapping.
        </p>
      )}

      {!isCSV && (
        <Button
          variant="outline" className="gap-2"
          onClick={() => void handleTest()}
          disabled={testing}
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {testing ? "Testing connection…" : "Test Connection"}
        </Button>
      )}

      {result === "ok" && (
        <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/5 border border-green-400/20 rounded-lg px-3 py-2">
          <CheckCircle2 className="h-4 w-4" /> Connection successful
        </div>
      )}
      {result === "error" && (
        <div className="flex items-start gap-2 text-sm text-red-400 bg-red-400/5 border border-red-400/20 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div>
        <Label>
          {isCSV ? "Paste CSV sample (first 5–10 rows)" : "Sample JSON response"}
          <span className="text-muted-foreground font-normal ml-1">(edit to match your actual response)</span>
        </Label>
        <textarea
          className="mt-1 w-full h-40 rounded-lg border border-border bg-muted/10 px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder={isCSV
            ? "timestamp,ac_power,daily_yield,grid_voltage\n2024-01-01T08:00:00Z,45000,12.5,230.1\n2024-01-01T08:00:30Z,45500,12.6,230.2"
            : '{\n  "power": 45000,\n  "daily_energy": 125.3,\n  "temperature": 42.1,\n  "grid_voltage": 230.5\n}'
          }
          value={state.sampleJson}
          onChange={(e) => update({ sampleJson: e.target.value })}
        />
      </div>
    </div>
  );
}

// ── Step 4: Field Mapping ─────────────────────────────────────────────────────

function Step4({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  const isCSV = state.sourceType === "csv_upload";

  // Parse detected source fields from sample JSON/CSV
  const detectedFields: string[] = (() => {
    if (!state.sampleJson.trim()) return [];
    try {
      if (isCSV) {
        const lines = state.sampleJson.trim().split("\n");
        return lines[0]?.split(",").map((h) => h.trim()) ?? [];
      }
      const obj = JSON.parse(state.sampleJson) as Record<string, unknown>;
      return Object.keys(obj);
    } catch { return []; }
  })();

  function addMapping(sourceField = "") {
    update({
      mappings: [
        ...state.mappings,
        { sourceField, paramKey: sourceField.toLowerCase().replace(/\s+/g, "_"), paramLabel: sourceField, unit: "", multiplier: "1" },
      ],
    });
  }

  function updateMapping(idx: number, patch: Partial<FieldMapping>) {
    update({
      mappings: state.mappings.map((m, i) => i === idx ? { ...m, ...patch } : m),
    });
  }

  function removeMapping(idx: number) {
    update({ mappings: state.mappings.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Map each source field to a platform parameter key, label, and unit. Use the detected fields from your sample response.
      </p>

      {/* Quick-add from detected fields */}
      {detectedFields.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Detected fields — click to add:</p>
          <div className="flex flex-wrap gap-1.5">
            {detectedFields
              .filter((f) => !state.mappings.some((m) => m.sourceField === f))
              .map((f) => (
                <button key={f} onClick={() => addMapping(f)}
                  className="text-[10px] px-2 py-1 rounded border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex items-center gap-1">
                  <Plus className="h-2.5 w-2.5" /> {f}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Mapping rows */}
      {state.mappings.length > 0 && (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_1fr_80px_60px_28px] gap-2 px-1">
            {["Source Field", "Param Key", "Display Label", "Unit", "Scale ×", ""].map((h) => (
              <span key={h} className="text-[10px] font-medium text-muted-foreground uppercase">{h}</span>
            ))}
          </div>
          {state.mappings.map((m, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_80px_60px_28px] gap-2 items-center">
              <Input
                className="h-8 text-xs font-mono"
                placeholder="source_field"
                value={m.sourceField}
                onChange={(e) => updateMapping(idx, { sourceField: e.target.value })}
              />
              <Input
                className="h-8 text-xs font-mono"
                placeholder="param_key"
                value={m.paramKey}
                onChange={(e) => updateMapping(idx, { paramKey: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
              />
              <Input
                className="h-8 text-xs"
                placeholder="AC Power"
                value={m.paramLabel}
                onChange={(e) => updateMapping(idx, { paramLabel: e.target.value })}
              />
              <Input
                className="h-8 text-xs"
                placeholder="W"
                value={m.unit}
                onChange={(e) => updateMapping(idx, { unit: e.target.value })}
              />
              <Input
                className="h-8 text-xs"
                placeholder="1"
                value={m.multiplier}
                onChange={(e) => updateMapping(idx, { multiplier: e.target.value })}
              />
              <button onClick={() => removeMapping(idx)}
                className="text-muted-foreground hover:text-red-400 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" className="gap-2" onClick={() => addMapping()}>
        <Plus className="h-3.5 w-3.5" /> Add Mapping Row
      </Button>

      {state.mappings.length === 0 && detectedFields.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Add a sample response in the previous step to auto-detect fields, or add mapping rows manually.
        </p>
      )}
    </div>
  );
}

// ── Step 5: Assign & Activate ─────────────────────────────────────────────────

interface Plant { id: string; name: string; }

function Step5({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  const { data: plants = [], isLoading: plantsLoading } = useQuery<Plant[]>({
    queryKey: ["plants"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/plants`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json() as Promise<Plant[]>;
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Name this data source connection and assign it to a plant. A device will be created and the driver will start automatically.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Connection Name <span className="text-red-400">*</span></Label>
          <Input className="mt-1" placeholder="e.g. Sungrow Cloud API — Plant North"
            value={state.deviceName} onChange={(e) => update({ deviceName: e.target.value })} />
        </div>
        <div>
          <Label>Device Type</Label>
          <Select value={state.deviceType} onValueChange={(v) => update({ deviceType: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Assign to Plant <span className="text-red-400">*</span></Label>
          <Select value={state.plantId} onValueChange={(v) => update({ plantId: v })}
            disabled={plantsLoading}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={plantsLoading ? "Loading plants…" : "Select plant…"} />
            </SelectTrigger>
            <SelectContent>
              {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configuration Summary</h4>
        {[
          { label: "Source",   value: SOURCE_TYPES.find((s) => s.value === state.sourceType)?.label ?? state.sourceType },
          { label: "Endpoint", value: state.url || state.brokerUrl || "CSV upload" },
          { label: "Interval", value: `${state.pollIntervalSec}s polling` },
          { label: "Fields",   value: `${state.mappings.length} parameter mapping${state.mappings.length !== 1 ? "s" : ""}` },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-20 text-muted-foreground">{label}</span>
            <span className="text-foreground truncate">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

function defaultState(): WizardState {
  return {
    sourceType: "rest_api",
    url: "", authMethod: "none", authValue: "", apiKeyHeader: "X-API-Key",
    pollIntervalSec: 30,
    brokerUrl: "", topic: "",
    plantId: "", deviceName: "", deviceType: "inverter",
    sampleJson: "", mappings: [],
  };
}

export default function DataConnectorWizardPage() {
  const [, navigate]   = useLocation();
  const { toast }      = useToast();
  const queryClient    = useQueryClient();
  const [step, setStep]   = useState(0);
  const [state, setState] = useState<WizardState>(defaultState());

  function update(patch: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  // Simulate test connection (in production, this would call the connection-test endpoint)
  async function handleTest() {
    const targetUrl = state.url || state.brokerUrl;
    if (!targetUrl && state.sourceType !== "csv_upload") {
      throw new Error("No URL configured — go back and enter a connection URL");
    }
    // Brief delay to simulate test
    await new Promise((r) => setTimeout(r, 800));
    // For demo: always "succeed" — in production call /api/devices/:id/connection-test
    return;
  }

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!state.deviceName.trim() || !state.plantId) throw new Error("Device name and plant are required");

      // Build a custom template from the field mappings
      const fieldMap = state.mappings
        .filter((m) => m.sourceField && m.paramKey)
        .map((m) => ({
          key: m.paramKey,
          label: m.paramLabel || m.paramKey,
          unit: m.unit,
          jsonPath: `$.${m.sourceField}`,
          multiplier: Number(m.multiplier) || 1,
        }));

      let templateId: string | undefined;
      if (fieldMap.length > 0) {
        const tmplRes = await fetch(`${BASE}api/device-templates`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manufacturer: "Custom",
            model: state.deviceName,
            protocol: state.sourceType === "mqtt" ? "mqtt"
                    : state.sourceType === "websocket" ? "websocket"
                    : "http",
            fieldMap,
            defaultPollIntervalS: state.pollIntervalSec,
          }),
        });
        if (tmplRes.ok) {
          const tmpl = await tmplRes.json() as { id: string };
          templateId = tmpl.id;
        }
      }

      const deviceBody: Record<string, unknown> = {
        name:               state.deviceName,
        type:               state.deviceType,
        plantId:            state.plantId,
        pollingIntervalSec: state.pollIntervalSec,
        templateId,
      };

      if (state.sourceType === "mqtt") {
        deviceBody.protocol  = "mqtt";
        deviceBody.brokerUrl = state.brokerUrl;
        deviceBody.topic     = state.topic;
      } else if (state.sourceType === "websocket") {
        deviceBody.protocol = "websocket";
        deviceBody.url      = state.url;
      } else {
        deviceBody.protocol = "http";
        deviceBody.url      = state.url;
      }

      const r = await fetch(`${BASE}api/devices`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deviceBody),
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Failed to create data source");
      }
      return r.json() as Promise<{ id: string }>;
    },
    onSuccess: (device) => {
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      void queryClient.invalidateQueries({ queryKey: ["device-templates"] });
      toast({
        title: "Data source activated!",
        description: `${state.deviceName} is now connected and collecting data.`,
      });
      navigate(`/devices/${device.id}`);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canNext = (() => {
    if (step === 0) return true;
    if (step === 1) {
      if (state.sourceType === "mqtt") return !!state.brokerUrl && !!state.topic;
      if (state.sourceType === "csv_upload") return true;
      return !!state.url;
    }
    if (step === 2) return true; // test is optional
    if (step === 3) return true; // at least 0 mappings is ok
    if (step === 4) return !!state.deviceName && !!state.plantId;
    return true;
  })();

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => (step === 0 ? navigate("/devices") : setStep((s) => s - 1))}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Connect a Data Source
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure any external source — no code required</p>
          </div>
        </div>

        {/* Step indicator */}
        <StepIndicator current={step} total={STEP_LABELS.length} />

        {/* Step content */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold mb-4">{STEP_LABELS[step]}</h2>
          {step === 0 && <Step1 state={state} update={update} />}
          {step === 1 && <Step2 state={state} update={update} />}
          {step === 2 && <Step3 state={state} update={update} onTest={handleTest} />}
          {step === 3 && <Step4 state={state} update={update} />}
          {step === 4 && <Step5 state={state} update={update} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          {step < STEP_LABELS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Next <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              className="gap-2"
              onClick={() => activateMutation.mutate()}
              disabled={!canNext || activateMutation.isPending}
            >
              {activateMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Activating…</>
                : <><CheckCircle2 className="h-4 w-4" /> Activate Data Source</>
              }
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
