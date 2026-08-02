/**
 * Connect a Data Source — 5-step wizard
 * REST API · MQTT · WebSocket · CSV Upload
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Globe, Radio, Wifi, Upload, ArrowRight, ArrowLeft,
  CheckCircle2, AlertCircle, Plus, Trash2, Loader2,
  Zap, Database, Info, HelpCircle, AlertTriangle,
  Key, Clock, RefreshCw, Tag, Ruler, ArrowDownToLine, Copy, Check,
  TestTube2,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

type SourceType  = "rest_api" | "mqtt" | "websocket" | "csv_upload" | "http_push";
type AuthMethod  = "none" | "bearer" | "api_key" | "basic";

interface FieldMapping {
  sourceField: string;
  paramKey:    string;
  paramLabel:  string;
  unit:        string;
  multiplier:  string;
}

interface WizardState {
  sourceType:      SourceType;
  url:             string;
  authMethod:      AuthMethod;
  authValue:       string;
  apiKeyHeader:    string;
  pollIntervalSec: number;
  brokerUrl:       string;
  topic:           string;
  mqttUsername:    string;
  mqttPassword:    string;
  plantId:         string;
  deviceName:      string;
  deviceType:      string;
  sampleJson:      string;
  mappings:        FieldMapping[];
}

interface Plant { id: string; name: string; }

const SOURCE_TYPES: {
  value: SourceType; label: string; desc: string;
  icon: typeof Globe; needs: string[];
}[] = [
  {
    value: "rest_api",
    label: "REST API",
    desc:  "Poll any HTTP/HTTPS JSON endpoint on a schedule",
    icon:  Globe,
    needs: ["Endpoint URL (https://…)", "Authentication token or API key (if required)", "Expected JSON response structure"],
  },
  {
    value: "mqtt",
    label: "MQTT Broker",
    desc:  "Subscribe to topics on an existing MQTT broker",
    icon:  Radio,
    needs: ["Broker address (mqtt:// or mqtts://)", "Topic pattern the device publishes to", "Credentials (if the broker requires auth)"],
  },
  {
    value: "websocket",
    label: "WebSocket Stream",
    desc:  "Connect to a WebSocket for push-based real-time data",
    icon:  Wifi,
    needs: ["WebSocket URL (ws:// or wss://)", "Authentication token (if required)", "Sample message payload structure"],
  },
  {
    value: "http_push",
    label: "HTTP Push / Webhook",
    desc:  "Device POSTs data to this SCADA server — no polling, no firewall issues",
    icon:  ArrowDownToLine,
    needs: ["Activate to get your unique ingest URL", "Configure device to POST JSON to that URL", "No credentials needed — URL token authenticates the device"],
  },
  {
    value: "csv_upload",
    label: "CSV / File Import",
    desc:  "Upload a CSV file with historical or migrated data",
    icon:  Upload,
    needs: ["CSV file with a header row", "A 'timestamp' column (ISO 8601 or Unix epoch)", "One column per measurement parameter"],
  },
];

const DEVICE_TYPES = [
  "inverter", "smart_meter", "weather_station",
  "data_logger", "gateway", "sensor", "RTU", "PLC",
];

const STEP_LABELS = ["Source Type", "Connection", "Test & Preview", "Map Fields", "Assign & Activate"];

// ── Helper components ─────────────────────────────────────────────────────────

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border border-brand/30 bg-brand/5 p-4 relative">
      <div className="absolute top-0 left-0 w-1 h-full bg-brand/50" />
      <Info className="h-4 w-4 text-brand flex-shrink-0 mt-0.5 drop-shadow-[0_0_5px_rgba(0,255,170,0.5)]" />
      <div className="font-mono text-[10px] uppercase tracking-widest text-brand/90 leading-relaxed leading-[1.6]">{children}</div>
    </div>
  );
}

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border border-status-warning/30 bg-status-warning/5 p-4 relative">
      <div className="absolute top-0 left-0 w-1 h-full bg-status-warning/50" />
      <HelpCircle className="h-4 w-4 text-status-warning flex-shrink-0 mt-0.5 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]" />
      <div className="font-mono text-[10px] uppercase tracking-widest text-status-warning/90 leading-relaxed leading-[1.6]">{children}</div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8 border-b border-border/50 pb-6 overflow-x-auto">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center h-8 w-8 rounded-none border text-[10px] font-mono transition-all ${
              i < current   ? "bg-brand border-brand text-black shadow-[0_0_10px_rgba(0,255,170,0.3)]"
              : i === current ? "border-brand text-brand bg-brand/10 shadow-[inset_0_0_10px_rgba(0,255,170,0.2)]"
              : "border-border/50 text-muted-foreground bg-black/40"
            }`}>
              {i < current ? <CheckCircle2 className="h-4 w-4" /> : `0${i + 1}`}
            </div>
            <span className={`text-[10px] uppercase tracking-widest font-mono hidden sm:block ${i === current ? "text-brand" : i < current ? "text-foreground/80" : "text-muted-foreground"}`}>
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={`h-[1px] w-6 sm:w-10 mx-3 transition-colors ${i < current ? "bg-brand/50" : "bg-border/50"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Source Type ───────────────────────────────────────────────────────

function Step1({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  const selected = SOURCE_TYPES.find((s) => s.value === state.sourceType);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-mono uppercase tracking-widest text-foreground/90 flex items-center gap-3">
          <Globe className="h-5 w-5 text-brand" />
          SYSTEM INGEST PROTOCOL
        </h2>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">
          SELECT THE DATA ACQUISITION METHOD FOR THIS PIPELINE
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SOURCE_TYPES.map(({ value, label, desc, icon: Icon }) => (
          <button
            key={value}
            onClick={() => update({ sourceType: value })}
            className={`border p-5 text-left transition-all relative group overflow-hidden ${
              state.sourceType === value
                ? "border-brand bg-brand/5 shadow-[0_0_15px_rgba(0,255,170,0.1)]"
                : "border-border/50 bg-black/40 hover:border-brand/50 hover:bg-brand/5"
            }`}
          >
            <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${state.sourceType === value ? "bg-brand" : "bg-border/50 group-hover:bg-brand/50"}`} />
            <Icon className={`h-6 w-6 mb-3 ${state.sourceType === value ? "text-brand drop-shadow-[0_0_8px_rgba(0,255,170,0.5)]" : "text-muted-foreground"}`} />
            <div className={`font-mono text-sm uppercase tracking-widest mb-2 ${state.sourceType === value ? "text-foreground" : "text-foreground/80"}`}>{label}</div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider leading-relaxed">{desc}</div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="border border-brand/30 bg-brand/5 p-5 mt-6 relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand/50" />
          <p className="text-[10px] font-mono font-bold text-brand uppercase tracking-[0.2em] mb-4">
            REQUIRED PARAMETERS: {selected.label}
          </p>
          <div className="space-y-3">
            {selected.needs.map((need) => (
              <div key={need} className="flex items-start gap-3 text-[10px] font-mono uppercase tracking-widest">
                <CheckCircle2 className="h-4 w-4 text-brand flex-shrink-0 mt-[-1px]" />
                <span className="text-foreground/80">{need}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 2: Connection Details ────────────────────────────────────────────────

function Step2({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {

  if (state.sourceType === "http_push") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-mono uppercase tracking-widest text-foreground/90 flex items-center gap-3">
            <ArrowDownToLine className="h-5 w-5 text-brand" />
            HTTP PUSH (WEBHOOK) TARGET
          </h2>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">
            DEVICE POSTS JSON PAYLOAD DIRECTLY. NO POLLING. NO INBOUND FIREWALL RULES.
          </p>
        </div>
        <InfoBox>
          UPON ENERGIZATION (PHASE 5), A UNIQUE INGEST URL WILL BE GENERATED. CONFIGURE THE HARDWARE TARGET TO HTTP POST TO THIS URL. THE URL ITSELF AUTHORIZES THE INGEST.
        </InfoBox>
        <div className="border border-border/50 bg-black/40 p-5 relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-border/50" />
          <p className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-4">TARGET CONFIGURATION EXAMPLE (TELTONIKA TRB)</p>
          <div className="space-y-3">
            {[
              { label: "Target Route", value: "Services → Data to Server → Add" },
              { label: "Endpoint URL", value: "https://scada.automystics.tech/api/ingest/<TOKEN>" },
              { label: "HTTP Verb", value: "POST" },
              { label: "Encoding", value: "JSON" },
              { label: "Cycle Rate", value: "30 SECONDS" },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-4 items-center">
                <span className="w-32 flex-shrink-0 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
                <span className="font-mono text-xs text-brand/90 bg-brand/5 border border-brand/20 px-2 py-1 uppercase">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <TipBox>
          NESTED JSON PAYLOADS ARE AUTOMATICALLY FLATTENED. COMPATIBLE WITH PROPRIETARY OBJECT STRUCTURES WITHOUT DEVICE-SIDE MUTATION.
        </TipBox>
      </div>
    );
  }

  if (state.sourceType === "csv_upload") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-mono uppercase tracking-widest text-foreground/90 flex items-center gap-3">
            <Upload className="h-5 w-5 text-brand" />
            FILE IMPORT SPECIFICATION
          </h2>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">ARCHIVE INGEST REQUIRES STRICT STRUCTURAL COMPLIANCE</p>
        </div>
        <InfoBox>
          HEADER ROW REQUIRED. INDEX 0 MUST BE <code className="bg-brand/20 text-brand px-1">timestamp</code> (ISO-8601 OR UNIX EPOCH). SUBSEQUENT COLUMNS REPRESENT TELEMETRY VECTORS.
        </InfoBox>
        <div className="border border-border/50 bg-black/40 p-5 relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-border/50" />
          <p className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-4">VALIDATED STRUCTURE EXAMPLE</p>
          <pre className="text-[10px] font-mono text-brand/80 whitespace-pre-wrap bg-black/60 p-4 border border-border/30">
{`timestamp,ac_power_w,daily_yield_kwh,grid_voltage_v,temperature_c
2024-01-15T08:00:00Z,45000,12.5,230.1,42.3
2024-01-15T08:00:30Z,45500,12.6,230.2,42.5
2024-01-15T08:01:00Z,46000,12.7,230.0,42.8`}
          </pre>
        </div>
        <TipBox>
          PHASE 3 REQUIRES A PAYLOAD SAMPLE TO INITIALIZE REGISTRY MAPPINGS AUTOMATICALLY.
        </TipBox>
      </div>
    );
  }

  if (state.sourceType === "mqtt") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-mono uppercase tracking-widest text-foreground/90 flex items-center gap-3">
            <Radio className="h-5 w-5 text-brand" />
            MQTT BROKER BINDING
          </h2>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">DEFINE UPSTREAM BROKER AND TOPIC SUBSCRIPTION PARAMETERS</p>
        </div>
        <InfoBox>
          SCADA INGEST NODE WILL MAINTAIN PERSISTENT SUBSCRIPTION. VERIFY NETWORK TOPOLOGY AND BROKER ACLS PERMIT INBOUND TRAFFIC.
        </InfoBox>
        <div className="space-y-5 border border-border/50 bg-black/40 p-6 relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-border/50" />
          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-brand" /> Broker Address <span className="text-status-fault">*</span></Label>
            <Input
              className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-foreground"
              placeholder="mqtt://192.168.1.50:1883  or  mqtts://broker.hivemq.com:8883"
              value={state.brokerUrl}
              onChange={(e) => update({ brokerUrl: e.target.value })}
            />
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-2">USE <code className="text-brand">mqtt://</code> FOR PLAINTEXT, <code className="text-brand">mqtts://</code> FOR TLS.</p>
          </div>
          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block flex items-center gap-2"><Tag className="h-3.5 w-3.5 text-brand" /> Topic Vector <span className="text-status-fault">*</span></Label>
            <Input
              className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-brand"
              placeholder="solar/plant/+/inverter/data"
              value={state.topic}
              onChange={(e) => update({ topic: e.target.value })}
            />
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-2">SUPPORTED WILDCARDS: <code className="text-brand">+</code> (SINGLE), <code className="text-brand">#</code> (MULTI-LEVEL).</p>
          </div>
          <div className="sm:w-64">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-brand" /> Keep-Alive Ping (Sec)</Label>
            <Input
              className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50"
              type="number" min={5} max={3600}
              value={state.pollIntervalSec}
              onChange={(e) => update({ pollIntervalSec: Number(e.target.value) || 30 })}
            />
          </div>
          <div className="pt-4 border-t border-border/50">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block flex items-center gap-2"><Key className="h-3.5 w-3.5 text-brand" /> Broker Authentication <span className="opacity-50 ml-2">(IF REQUIRED)</span></Label>
            <div className="grid grid-cols-2 gap-4">
              <Input
                className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50"
                placeholder="USERNAME"
                value={state.mqttUsername}
                onChange={(e) => update({ mqttUsername: e.target.value })}
              />
              <Input
                className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50"
                type="password"
                placeholder="PASSWORD"
                value={state.mqttPassword}
                onChange={(e) => update({ mqttPassword: e.target.value })}
              />
            </div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-status-warning mt-2">CREDENTIALS STORED WITH AES-256-GCM ENCRYPTION. NEVER EXPOSED TO CLIENT.</p>
          </div>
        </div>
      </div>
    );
  }

  const isWS = state.sourceType === "websocket";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-mono uppercase tracking-widest text-foreground/90 flex items-center gap-3">
          {isWS ? <Wifi className="h-5 w-5 text-brand" /> : <Globe className="h-5 w-5 text-brand" />}
          {isWS ? "WEBSOCKET STREAM" : "REST API POLLING"} BINDING
        </h2>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">
          {isWS
            ? "TARGET URL FOR PERSISTENT DATA STREAM"
            : "TARGET URL AND CYCLE RATE FOR POLLING INGEST"}
        </p>
      </div>

      <InfoBox>
        {isWS
          ? "SYSTEM WILL MAINTAIN A PERSISTENT WSS CONNECTION. ALL RECEIVED JSON FRAMES WILL BE INGESTED."
          : <>SYSTEM WILL EXECUTE HTTP GET EVERY <strong>{state.pollIntervalSec}s</strong>. RESPONSE MUST BE VALID JSON.</>
        }
      </InfoBox>

      <div className="space-y-5 border border-border/50 bg-black/40 p-6 relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-border/50" />
        
        <div>
          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-brand" />
            {isWS ? "WebSocket Target" : "Endpoint Target"} <span className="text-status-fault">*</span>
          </Label>
          <Input
            className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-brand"
            placeholder={isWS ? "wss://device.example.com:8080/live" : "https://api.solarcloud.com/v1/readings"}
            value={state.url}
            onChange={(e) => update({ url: e.target.value })}
          />
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-2">
            {isWS ? "USE WSS:// FOR PRODUCTION ENVIRONMENTS." : "ARRAY RESPONSES MUST BE WRAPPED (E.G. { \"data\": [...] })."}
          </p>
        </div>

        {!isWS && (
          <div className="sm:w-64">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-brand" /> Polling Cycle (Sec)</Label>
            <Input
              className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50"
              type="number" min={5} max={3600}
              value={state.pollIntervalSec}
              onChange={(e) => update({ pollIntervalSec: Number(e.target.value) || 30 })}
            />
          </div>
        )}

        <div className="pt-4 border-t border-border/50">
          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block flex items-center gap-2"><Key className="h-3.5 w-3.5 text-brand" /> Authentication Strategy</Label>
          <Select value={state.authMethod} onValueChange={(v) => update({ authMethod: v as AuthMethod })}>
            <SelectTrigger className="rounded-none font-mono text-sm border-border/50 bg-black/40 uppercase tracking-widest"><SelectValue /></SelectTrigger>
            <SelectContent className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest bg-background">
              <SelectItem value="none">PUBLIC — NO AUTH</SelectItem>
              <SelectItem value="bearer">BEARER TOKEN (AUTHORIZATION HEADER)</SelectItem>
              <SelectItem value="api_key">API KEY (CUSTOM HEADER)</SelectItem>
              <SelectItem value="basic">BASIC AUTH (BASE64 ENC)</SelectItem>
            </SelectContent>
          </Select>
          <p className="font-mono text-[9px] uppercase tracking-widest text-status-warning mt-2">CREDENTIALS SECURED AT REST VIA AES-256-GCM.</p>
        </div>

        {state.authMethod === "api_key" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Header Identifier</Label>
              <Input className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50" placeholder="X-API-Key"
                value={state.apiKeyHeader}
                onChange={(e) => update({ apiKeyHeader: e.target.value })} />
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Key Secret</Label>
              <Input className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50" type="password" placeholder="••••••••"
                value={state.authValue}
                onChange={(e) => update({ authValue: e.target.value })} />
            </div>
          </div>
        )}

        {state.authMethod === "bearer" && (
          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Bearer Token</Label>
            <Input className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50" type="password" placeholder="eyJhbGciOiJ…"
              value={state.authValue}
              onChange={(e) => update({ authValue: e.target.value })} />
          </div>
        )}

        {state.authMethod === "basic" && (
          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Basic Credentials</Label>
            <Input className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50" type="password" placeholder="USER:PASS"
              value={state.authValue}
              onChange={(e) => update({ authValue: e.target.value })} />
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-2">INPUT RAW USER:PASS, ENCODER HANDLES BASE64 TRANSFORMATION.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 3: Test & Preview ────────────────────────────────────────────────────

function Step3({
  state, update, onTest,
}: {
  state:   WizardState;
  update:  (p: Partial<WizardState>) => void;
  onTest:  () => Promise<void>;
}) {
  const [testing, setTesting] = useState(false);
  const [result,  setResult]  = useState<"ok" | "error" | null>(null);
  const [error,   setError]   = useState("");
  const [latency, setLatency] = useState(0);

  const isCSV = state.sourceType === "csv_upload";

  async function handleTest() {
    setTesting(true); setResult(null); setError("");
    const t0 = Date.now();
    try {
      await onTest();
      setResult("ok");
      setLatency(Date.now() - t0);
    } catch (e) {
      setResult("error");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-mono uppercase tracking-widest text-foreground/90 flex items-center gap-3">
          <TestTube2 className="h-5 w-5 text-brand" />
          {isCSV ? "DATA STRUCTURAL PREVIEW" : "TELEMETRY LINK VERIFICATION"}
        </h2>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">
          {isCSV
            ? "INPUT SAMPLE FRAMES TO INITIALIZE REGISTRY MAPPINGS."
            : "EXECUTE DRY-RUN DIAGNOSTIC PING. PROVIDE PAYLOAD SAMPLE TO SEED EXTRACTORS."}
        </p>
      </div>

      {!isCSV && (
        <>
          <InfoBox>
            DIAGNOSTIC PING EXERTS ACTUAL NETWORK TRAFFIC TO TARGET PORT. SUCCESS INDICATES UNIMPEDED ROUTES. NO MUTATIONS OCCUR.
          </InfoBox>

          <Button
            variant="outline"
            className="gap-2 rounded-none border-brand/50 text-brand hover:bg-brand/10 font-mono text-[10px] uppercase tracking-widest"
            onClick={() => void handleTest()}
            disabled={testing}
          >
            {testing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> EXECUTING PING…</>
              : <><RefreshCw className="h-4 w-4" /> INITIATE DIAGNOSTIC PING</>}
          </Button>

          {result === "ok" && (
            <div className="flex items-center gap-3 border border-status-normal/30 bg-status-normal/5 px-4 py-3 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-status-normal/50" />
              <CheckCircle2 className="h-4 w-4 text-status-normal drop-shadow-[0_0_5px_rgba(52,211,153,0.5)] flex-shrink-0" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-status-normal/90">HANDSHAKE VERIFIED — ROUND-TRIP LATENCY: {latency} MS</span>
            </div>
          )}
          {result === "error" && (
            <div className="border border-status-fault/30 bg-status-fault/5 px-4 py-3 space-y-2 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-status-fault/50" />
              <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-status-fault font-bold">
                <AlertCircle className="h-4 w-4 flex-shrink-0 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]" /> PACKET LOSS / ROUTE FAILURE
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-status-fault/80 leading-relaxed ml-7">{error}</p>
            </div>
          )}
        </>
      )}

      <div>
        <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-brand" />
          {isCSV ? "CSV Header/Data Sample" : "JSON Response Payload Sample"}
        </Label>
        <textarea
          className="w-full h-56 rounded-none border border-border/50 bg-black/60 px-4 py-3 font-mono text-xs text-brand/80 resize-y focus:outline-none focus:border-brand/50 placeholder:text-muted-foreground/30 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]"
          placeholder={isCSV
            ? `timestamp,ac_power_w,daily_yield_kwh,grid_voltage_v\n2024-01-15T08:00:00Z,45000,12.5,230.1\n2024-01-15T08:00:30Z,45500,12.6,230.2`
            : `{\n  "ac_power":      45000,\n  "daily_energy":  125.3,\n  "temperature":   42.1,\n  "grid_voltage":  230.5,\n  "pf":            0.98\n}`}
          value={state.sampleJson}
          onChange={(e) => update({ sampleJson: e.target.value })}
        />
      </div>

      <TipBox>
        {isCSV
          ? "HEADER ROW REQUIRED. DATA TYPES INFERRED FROM SAMPLE."
          : "DIAGNOSTIC FAILURE DOES NOT PREVENT CONFIGURATION PERSISTENCE, BUT ACQUISITION WILL HALT UNTIL ROUTES ARE CLEAR."}
      </TipBox>
    </div>
  );
}

// ── Step 4: Field Mapping ─────────────────────────────────────────────────────

interface DetectedField { path: string; label: string; unit: string; }

/** camelCase / snake_case / mixed → "Title Case Words" */
function keyToLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Guess physical unit from a key name */
function guessUnit(key: string): string {
  const k = key.toLowerCase();
  if (/current/i.test(k))    return "mA";
  if (/voltage|volt/i.test(k)) return "V";
  if (/power|watt/i.test(k)) return "W";
  if (/energy|yield/i.test(k)) return "kWh";
  if (/temp/i.test(k))       return "°C";
  if (/freq/i.test(k))       return "Hz";
  if (/irrad/i.test(k))      return "W/m²";
  if (/soc|battery/i.test(k)) return "%";
  return "";
}

/** Derive a clean snake_case param key from a dotted path */
function pathToParamKey(path: string): string {
  const parts = path.split(".");
  // Drop generic container segments and the "value" leaf
  const skip = new Set(["readings", "data", "params", "measurements", "channels", "value", "address"]);
  const meaningful = parts.filter((p) => !skip.has(p));
  const base = meaningful.length > 0 ? meaningful[meaningful.length - 1] : parts[parts.length - 1];
  return base
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-zA-Z])(\d)/g, "$1_$2")
    .replace(/(\d)([a-zA-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Recursively walk a parsed JSON object and return dot-paths to numeric leaves.
 *  Handles nested structures and the TRB246 {address, value} pattern. */
function extractFields(
  obj: unknown,
  prefix = "",
  out: DetectedField[] = [],
  depth = 0,
): DetectedField[] {
  if (depth > 6 || obj === null || typeof obj !== "object" || Array.isArray(obj)) return out;

  const SKIP_KEYS = new Set(["timestamp", "device", "firmware", "id", "name", "server",
    "collection", "address", "type", "unit", "status", "version"]);

  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;

    if (typeof val === "number") {
      if (SKIP_KEYS.has(key)) continue;
      out.push({ path: fullPath, label: keyToLabel(key), unit: guessUnit(key) });

    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>;

      // TRB246 pattern: {address: N, value: N} — map straight to .value
      if ("value" in nested && typeof nested.value === "number") {
        out.push({ path: `${fullPath}.value`, label: keyToLabel(key), unit: guessUnit(key) });
      } else {
        extractFields(val, fullPath, out, depth + 1);
      }
    }
  }
  return out;
}

function Step4({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  const isCSV = state.sourceType === "csv_upload";

  const detectedFields: DetectedField[] = (() => {
    if (!state.sampleJson.trim()) return [];
    try {
      if (isCSV) {
        const lines = state.sampleJson.trim().split("\n");
        return (lines[0]?.split(",").map((h) => h.trim()).filter(Boolean) ?? [])
          .map((h) => ({ path: h, label: keyToLabel(h), unit: guessUnit(h) }));
      }
      const obj = JSON.parse(state.sampleJson) as unknown;
      return extractFields(obj);
    } catch { return []; }
  })();

  function addMapping(field: DetectedField | string = "") {
    const f: DetectedField = typeof field === "string"
      ? { path: field, label: keyToLabel(field), unit: guessUnit(field) }
      : field;
    update({
      mappings: [...state.mappings, {
        sourceField: f.path,
        paramKey:    pathToParamKey(f.path),
        paramLabel:  f.label,
        unit:        f.unit,
        multiplier:  "1",
      }],
    });
  }

  function updateMapping(idx: number, patch: Partial<FieldMapping>) {
    update({ mappings: state.mappings.map((m, i) => i === idx ? { ...m, ...patch } : m) });
  }

  function removeMapping(idx: number) {
    update({ mappings: state.mappings.filter((_, i) => i !== idx) });
  }

  const unmapped = detectedFields.filter((f) => !state.mappings.some((m) => m.sourceField === f.path));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Step 4 — Map fields to SCADA parameters</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tell the platform which source fields are which. Each mapping row links a raw field name to a human-readable label and unit.
        </p>
      </div>

      <InfoBox>
        <strong>How mapping works:</strong> "Source Field" is the dot-path in your JSON (e.g. <code className="bg-blue-500/10 rounded px-1">readings.string1Current.value</code>). "Param Key" is the internal SCADA identifier. "Display Label" shows in dashboards. "Unit" is the physical unit. "Scale ×" multiplies the raw value.
      </InfoBox>

      {/* Auto-detect quick-add */}
      {unmapped.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-primary" /> Auto-detected fields — click to add:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unmapped.map((f) => (
              <button
                key={f.path}
                onClick={() => addMapping(f)}
                className="text-[10px] px-2 py-1 rounded border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex items-center gap-1"
                title={f.path}
              >
                <Plus className="h-2.5 w-2.5" /> {f.label}{f.unit ? ` (${f.unit})` : ""}
              </button>
            ))}
            {unmapped.length > 1 && (
              <button
                onClick={() => unmapped.forEach((f) => addMapping(f))}
                className="text-[10px] px-2 py-1 rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors flex items-center gap-1"
              >
                <Plus className="h-2.5 w-2.5" /> Add all {unmapped.length}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mapping table */}
      {state.mappings.length > 0 ? (
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="space-y-2 min-w-[580px]">
            {/* Header */}
            <div className="grid grid-cols-[1fr_1fr_1fr_72px_56px_28px] gap-2 px-1">
              {[
                { label: "Source Field", icon: Database },
                { label: "Param Key",    icon: Tag },
                { label: "Display Label", icon: null },
                { label: "Unit",         icon: Ruler },
                { label: "Scale ×",      icon: null },
                { label: "",             icon: null },
              ].map(({ label, icon: Icon }) => (
                <div key={label} className="flex items-center gap-1">
                  {Icon && <Icon className="h-2.5 w-2.5 text-muted-foreground" />}
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
                </div>
              ))}
            </div>
            {state.mappings.map((m, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_72px_56px_28px] gap-2 items-center">
                <Input className="h-8 text-xs font-mono" placeholder="source_field"
                  value={m.sourceField}
                  onChange={(e) => updateMapping(idx, { sourceField: e.target.value })} />
                <Input className="h-8 text-xs font-mono" placeholder="param_key"
                  value={m.paramKey}
                  onChange={(e) => updateMapping(idx, { paramKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
                <Input className="h-8 text-xs" placeholder="AC Power"
                  value={m.paramLabel}
                  onChange={(e) => updateMapping(idx, { paramLabel: e.target.value })} />
                <Input className="h-8 text-xs" placeholder="W"
                  value={m.unit}
                  onChange={(e) => updateMapping(idx, { unit: e.target.value })} />
                <Input className="h-8 text-xs" placeholder="1"
                  value={m.multiplier}
                  onChange={(e) => updateMapping(idx, { multiplier: e.target.value })} />
                <button onClick={() => removeMapping(idx)}
                  className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {detectedFields.length > 0
              ? "Click a field above to add a mapping row."
              : "Add a sample response in the previous step to auto-detect fields, or add rows manually below."}
          </p>
        </div>
      )}

      <Button variant="outline" size="sm" className="gap-2" onClick={() => addMapping()}>
        <Plus className="h-3.5 w-3.5" /> Add mapping row manually
      </Button>

      {state.mappings.length === 0 && (
        <TipBox>
          Field mappings are optional — you can activate without them and add mappings later from the device settings page.
        </TipBox>
      )}
    </div>
  );
}

// ── Step 5: Assign & Activate ─────────────────────────────────────────────────

function Step5({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  const { data: plants = [], isLoading } = useQuery<Plant[]>({
    queryKey: ["plants"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/plants`, { credentials: "include" });
      return r.ok ? r.json() as Promise<Plant[]> : [];
    },
  });

  const srcLabel = SOURCE_TYPES.find((s) => s.value === state.sourceType)?.label ?? state.sourceType;
  const endpoint = state.url || state.brokerUrl || "CSV file";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Step 5 — Name, assign, and activate</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Give this connection a name and assign it to a plant. Clicking <strong>Activate</strong> will save the device, start the driver, and begin collecting data immediately.
        </p>
      </div>

      <InfoBox>
        A <strong>device</strong> will be created in the system representing this data source. You can view its live readings, edit its configuration, and set alert thresholds from the Devices page after activation.
      </InfoBox>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label>Connection name <span className="text-red-400">*</span></Label>
          <Input
            className="mt-1"
            placeholder="e.g. Sungrow Cloud API — Site North"
            value={state.deviceName}
            onChange={(e) => update({ deviceName: e.target.value })}
          />
          <p className="text-xs text-muted-foreground mt-1">Use a name that identifies both the source and the site so it's easy to find later.</p>
        </div>

        <div>
          <Label>Device type</Label>
          <Select value={state.deviceType} onValueChange={(v) => update({ deviceType: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Used for grouping and display in the Devices page.</p>
        </div>

        <div>
          <Label>Assign to plant <span className="text-red-400">*</span></Label>
          <Select
            value={state.plantId}
            onValueChange={(v) => update({ plantId: v })}
            disabled={isLoading}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={isLoading ? "Loading plants…" : plants.length === 0 ? "No plants yet — create one first" : "Select plant…"} />
            </SelectTrigger>
            <SelectContent>
              {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {plants.length === 0 && !isLoading && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              No plants registered. Go to <strong>Auto-Provision</strong> to create one first.
            </p>
          )}
        </div>
      </div>

      {/* Configuration summary */}
      <div className="rounded-lg border border-border bg-muted/5 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Configuration summary</p>
        {[
          { label: "Source type", value: srcLabel },
          { label: "Endpoint",    value: endpoint || "—" },
          { label: "Interval",    value: state.sourceType === "mqtt" ? "Push (event-driven)" : `Every ${state.pollIntervalSec} s` },
          { label: "Auth",        value: state.authMethod === "none" ? "None" : state.authMethod === "bearer" ? "Bearer token" : state.authMethod === "api_key" ? `API key (${state.apiKeyHeader})` : "Basic auth" },
          { label: "Field maps",  value: state.mappings.length > 0 ? `${state.mappings.length} mapping${state.mappings.length !== 1 ? "s" : ""}` : "None (raw passthrough)" },
        ].map(({ label, value }) => (
          <div key={label} className="flex gap-3 text-xs">
            <span className="w-24 flex-shrink-0 text-muted-foreground">{label}</span>
            <span className="text-foreground font-mono truncate">{value}</span>
          </div>
        ))}
      </div>

      {!state.deviceName.trim() && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Enter a connection name to enable activation.
        </div>
      )}
      {!state.plantId && state.deviceName.trim() && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Select a plant to enable activation.
        </div>
      )}
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

function defaultState(): WizardState {
  return {
    sourceType: "rest_api",
    url: "", authMethod: "none", authValue: "", apiKeyHeader: "X-API-Key",
    pollIntervalSec: 30,
    brokerUrl: "", topic: "", mqttUsername: "", mqttPassword: "",
    plantId: "", deviceName: "", deviceType: "inverter",
    sampleJson: "", mappings: [],
  };
}

export default function DataConnectorWizardPage() {
  const [, navigate]      = useLocation();
  const { toast }         = useToast();
  const queryClient       = useQueryClient();
  const [step, setStep]   = useState(0);
  const [state, setState] = useState<WizardState>(defaultState());
  const [activatedDevice, setActivatedDevice] = useState<{ id: string; ingestToken?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function update(patch: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  async function handleTest() {
    const targetUrl = state.url || state.brokerUrl;
    if (!targetUrl && state.sourceType !== "csv_upload") {
      throw new Error("No URL configured — go back to Connection and enter a URL");
    }
    if (state.sourceType === "csv_upload") return;

    const protocol =
      state.sourceType === "mqtt"      ? "mqtt"
      : state.sourceType === "websocket" ? "websocket"
      : "http";

    const body: Record<string, unknown> = { protocol };
    if (state.sourceType === "mqtt") {
      body.brokerUrl = state.brokerUrl;
      body.topic     = state.topic;
      if (state.mqttUsername) body.mqttUsername = state.mqttUsername;
      if (state.mqttPassword) body.mqttPassword = state.mqttPassword;
    } else {
      body.url = state.url;
      if (state.authMethod !== "none") {
        body.httpAuthMethod   = state.authMethod;
        body.httpAuthValue    = state.authValue;
        body.httpApiKeyHeader = state.apiKeyHeader;
      }
    }

    const res = await fetch(`${BASE}api/devices/connection-preflight`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json() as { ok: boolean; error?: string; latencyMs?: number; sampleRaw?: unknown };
    if (!data.ok) throw new Error(data.error ?? "Connection failed — check URL and auth settings");

    // Auto-populate sample JSON for REST API so Step 4 can detect fields immediately
    if (state.sourceType === "rest_api" && data.sampleRaw != null && !state.sampleJson.trim()) {
      update({ sampleJson: JSON.stringify(data.sampleRaw, null, 2) });
    }
  }

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!state.deviceName.trim()) throw new Error("Connection name is required");
      if (!state.plantId)           throw new Error("Plant assignment is required");

      // Build field map from mappings
      const fieldMap = state.mappings
        .filter((m) => m.sourceField && m.paramKey)
        .map((m) => ({
          key:        m.paramKey,
          label:      m.paramLabel || m.paramKey,
          unit:       m.unit,
          jsonPath:   `$.${m.sourceField}`,
          multiplier: Number(m.multiplier) || 1,
        }));

      // Create a custom device template if we have field mappings
      let templateId: string | undefined;
      if (fieldMap.length > 0) {
        const tmplRes = await fetch(`${BASE}api/device-templates`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manufacturer: "Custom",
            model: state.deviceName,
            protocol: state.sourceType === "mqtt"      ? "mqtt"
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

      // Build device registration body
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
        if (state.mqttUsername) deviceBody.mqttUsername = state.mqttUsername;
        if (state.mqttPassword) deviceBody.mqttPassword = state.mqttPassword;
      } else if (state.sourceType === "http_push") {
        // Push devices have no outbound connection — token is generated server-side
        deviceBody.protocol = "http_push";
      } else if (state.sourceType === "websocket") {
        deviceBody.protocol = "websocket";
        deviceBody.url      = state.url;
        if (state.authMethod !== "none") {
          deviceBody.httpAuthMethod   = state.authMethod;
          deviceBody.httpAuthValue    = state.authValue;
          deviceBody.httpApiKeyHeader = state.apiKeyHeader;
        }
      } else if (state.sourceType !== "csv_upload") {
        deviceBody.protocol = "http";
        deviceBody.url      = state.url;
        if (state.authMethod !== "none") {
          deviceBody.httpAuthMethod   = state.authMethod;
          deviceBody.httpAuthValue    = state.authValue;
          deviceBody.httpApiKeyHeader = state.apiKeyHeader;
        }
      } else {
        // CSV — protocol is "http" without a live driver; user uploads via device detail page
        deviceBody.protocol = "http";
      }

      const r = await fetch(`${BASE}api/devices`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deviceBody),
      });

      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { message?: string };
        throw new Error(e.message ?? "Failed to create data source — check your configuration");
      }
      return r.json() as Promise<{ id: string; config?: { ingestToken?: string } }>;
    },
    onSuccess: (device) => {
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      void queryClient.invalidateQueries({ queryKey: ["device-templates"] });
      const ingestToken = device.config?.ingestToken;
      if (state.sourceType === "http_push" && ingestToken) {
        // Stay on wizard and show dedicated success screen — do NOT navigate away
        setActivatedDevice({ id: device.id, ingestToken });
      } else {
        toast({
          title: "Data source activated!",
          description: `${state.deviceName} is now connected. The driver will start collecting data shortly.`,
        });
        navigate(`/devices/${device.id}`);
      }
    },
    onError: (e: Error) => {
      toast({ title: "Activation failed", description: e.message, variant: "destructive" });
    },
  });

  const canNext = (() => {
    switch (step) {
      case 0: return true;
      case 1:
        if (state.sourceType === "mqtt")       return !!state.brokerUrl.trim() && !!state.topic.trim();
        if (state.sourceType === "csv_upload") return true;
        if (state.sourceType === "http_push")  return true;
        return !!state.url.trim();
      case 2: return true; // test is optional
      case 3: return true; // mappings are optional
      case 4: return !!state.deviceName.trim() && !!state.plantId;
      default: return false;
    }
  })();

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── HTTP Push success screen — stays until user navigates away ── */}
        {activatedDevice?.ingestToken && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Device activated!</h1>
                <p className="text-sm text-muted-foreground">{state.deviceName} is ready. Copy your ingest URL and configure it on the device.</p>
              </div>
            </div>

            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5 space-y-4">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                <ArrowDownToLine className="h-4 w-4" /> Your Ingest URL
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted rounded-lg px-3 py-2.5 break-all leading-relaxed">
                  {`${window.location.origin}/api/ingest/${activatedDevice.ingestToken}`}
                </code>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(`${window.location.origin}/api/ingest/${activatedDevice.ingestToken}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 3000);
                  }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-xs font-medium"
                >
                  {copied ? <><Check className="h-3.5 w-3.5 text-green-500" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">This URL is also permanently shown on the device settings page.</p>
            </div>

            <div className="rounded-lg border border-border bg-muted/5 p-4 space-y-2.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configure on TRB246</p>
              {[
                { label: "Menu path",    value: "Services → Data to Server → Add" },
                { label: "Server URL",   value: `${window.location.origin}/api/ingest/${activatedDevice.ingestToken}` },
                { label: "HTTP method",  value: "POST" },
                { label: "Data format",  value: "JSON" },
                { label: "Period",       value: "30 s" },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-3 text-xs">
                  <span className="w-24 flex-shrink-0 text-muted-foreground">{label}</span>
                  <code className="font-mono text-foreground break-all">{value}</code>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/devices")}>
                Go to Devices
              </Button>
              <Button className="flex-1" onClick={() => navigate(`/devices/${activatedDevice.id}`)}>
                View Device
              </Button>
            </div>
          </div>
        )}

        {/* ── Normal wizard UI ── */}
        {!activatedDevice && <>
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost" size="icon"
            onClick={() => step === 0 ? navigate("/devices") : setStep((s) => s - 1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Connect a Data Source
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure any external source — no code required</p>
          </div>
        </div>

        <StepIndicator current={step} />

        {/* Step content */}
        <div className="rounded-xl border border-border bg-card p-6 min-h-[360px]">
          {step === 0 && <Step1 state={state} update={update} />}
          {step === 1 && <Step2 state={state} update={update} />}
          {step === 2 && <Step3 state={state} update={update} onTest={handleTest} />}
          {step === 3 && <Step4 state={state} update={update} />}
          {step === 4 && <Step5 state={state} update={update} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => step === 0 ? navigate("/devices") : setStep((s) => s - 1)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>

          {step < STEP_LABELS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="gap-2">
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              className="gap-2"
              onClick={() => activateMutation.mutate()}
              disabled={!canNext || activateMutation.isPending}
            >
              {activateMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Activating…</>
                : <><CheckCircle2 className="h-4 w-4" /> Activate Data Source</>}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Step {step + 1} of {STEP_LABELS.length} — {STEP_LABELS[step]}
        </p>
      </>}
      </div>
    </AppLayout>
  );
}
