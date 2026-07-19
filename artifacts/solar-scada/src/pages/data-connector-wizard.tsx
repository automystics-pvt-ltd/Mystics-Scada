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
    <div className="flex gap-2.5 rounded-lg bg-blue-500/8 border border-blue-500/20 px-3.5 py-3 text-sm text-blue-600 dark:text-blue-400">
      <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20 px-3.5 py-3 text-sm text-amber-700 dark:text-amber-400">
      <HelpCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold border-2 transition-all ${
              i < current   ? "bg-primary border-primary text-primary-foreground"
              : i === current ? "border-primary text-primary bg-primary/5"
              : "border-border text-muted-foreground"
            }`}>
              {i < current ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`text-[9px] whitespace-nowrap hidden sm:block ${i === current ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={`h-0.5 w-6 sm:w-12 mx-1 mb-4 transition-colors ${i < current ? "bg-primary" : "bg-border"}`} />
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
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Step 1 — Choose your source type</h2>
        <p className="text-sm text-muted-foreground mt-1">
          How does your equipment or cloud API deliver data? Pick the method that matches your setup.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SOURCE_TYPES.map(({ value, label, desc, icon: Icon }) => (
          <button
            key={value}
            onClick={() => update({ sourceType: value })}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              state.sourceType === value
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <Icon className={`h-5 w-5 mb-2 ${state.sourceType === value ? "text-primary" : "text-muted-foreground"}`} />
            <div className="font-medium text-sm">{label}</div>
            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="rounded-lg border border-border bg-muted/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            What you'll need for {selected.label}
          </p>
          {selected.needs.map((need) => (
            <div key={need} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">{need}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 2: Connection Details ────────────────────────────────────────────────

function Step2({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {

  if (state.sourceType === "http_push") {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-base font-semibold">Step 2 — HTTP Push (Webhook)</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your device will POST its JSON payload directly to this SCADA server. No polling, no open ports on the device side.
          </p>
        </div>
        <InfoBox>
          After you activate in Step 5, you'll receive a unique <strong>Ingest URL</strong> to configure in your device's "Data to Server" settings. The URL token acts as the device credential — no username or password needed.
        </InfoBox>
        <div className="rounded-lg border border-border bg-muted/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Teltonika TRB246 setup (after activation)</p>
          {[
            { label: "Services menu", value: "Services → Data to Server → Add" },
            { label: "Server URL", value: "https://scada.automystics.tech/api/ingest/<your-token>" },
            { label: "HTTP method", value: "POST" },
            { label: "Data format", value: "JSON" },
            { label: "Period", value: "30 s (or your preferred interval)" },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-3 text-xs">
              <span className="w-28 flex-shrink-0 text-muted-foreground">{label}</span>
              <span className="font-mono text-foreground">{value}</span>
            </div>
          ))}
        </div>
        <TipBox>
          The ingest endpoint accepts any nested JSON — including the TRB246's <code className="bg-amber-500/10 rounded px-1">readings.*.value</code> structure. Fields are auto-flattened and stored without any device-side changes needed.
        </TipBox>
      </div>
    );
  }

  if (state.sourceType === "csv_upload") {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-base font-semibold">Step 2 — File format requirements</h2>
          <p className="text-sm text-muted-foreground mt-1">CSV upload has no network connection step. Review the format requirements below, then continue.</p>
        </div>
        <InfoBox>
          Your CSV must have a header row. The first column should be named <code className="bg-blue-500/10 rounded px-1">timestamp</code> in ISO 8601 format (<code className="bg-blue-500/10 rounded px-1">2024-01-15T08:30:00Z</code>) or Unix epoch seconds. Each additional column becomes a measurement parameter.
        </InfoBox>
        <div className="rounded-lg border border-border bg-muted/5 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Example CSV structure</p>
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
{`timestamp,ac_power_w,daily_yield_kwh,grid_voltage_v,temperature_c
2024-01-15T08:00:00Z,45000,12.5,230.1,42.3
2024-01-15T08:00:30Z,45500,12.6,230.2,42.5
2024-01-15T08:01:00Z,46000,12.7,230.0,42.8`}
          </pre>
        </div>
        <TipBox>
          In the next step, paste the first few rows of your CSV as a preview. The wizard will auto-detect column names for field mapping.
        </TipBox>
      </div>
    );
  }

  if (state.sourceType === "mqtt") {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-base font-semibold">Step 2 — MQTT broker connection</h2>
          <p className="text-sm text-muted-foreground mt-1">Enter your broker address and the topic pattern your device publishes to.</p>
        </div>
        <InfoBox>
          The SCADA server will connect to your broker and subscribe to the topic. Make sure the broker is reachable from the server's network.
        </InfoBox>
        <div className="space-y-4">
          <div>
            <Label className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Broker URL <span className="text-red-400">*</span></Label>
            <Input
              className="mt-1 font-mono text-sm"
              placeholder="mqtt://192.168.1.50:1883  or  mqtts://broker.hivemq.com:8883"
              value={state.brokerUrl}
              onChange={(e) => update({ brokerUrl: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">Use <code className="bg-muted rounded px-1">mqtt://</code> for plain TCP, <code className="bg-muted rounded px-1">mqtts://</code> for TLS.</p>
          </div>
          <div>
            <Label className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Topic Pattern <span className="text-red-400">*</span></Label>
            <Input
              className="mt-1 font-mono text-sm"
              placeholder="solar/plant/+/inverter/data"
              value={state.topic}
              onChange={(e) => update({ topic: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">Use <code className="bg-muted rounded px-1">+</code> for single-level wildcard, <code className="bg-muted rounded px-1">#</code> for multi-level. Each matching message will be ingested.</p>
          </div>
          <div className="sm:w-48">
            <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Keep-alive ping (seconds)</Label>
            <Input
              className="mt-1"
              type="number" min={5} max={3600}
              value={state.pollIntervalSec}
              onChange={(e) => update({ pollIntervalSec: Number(e.target.value) || 30 })}
            />
          </div>
          <div>
            <Label className="flex items-center gap-1.5"><Key className="h-3.5 w-3.5" /> Broker credentials <span className="text-xs font-normal text-muted-foreground ml-1">(optional — leave blank for anonymous brokers)</span></Label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <Input
                  placeholder="Username"
                  value={state.mqttUsername}
                  onChange={(e) => update({ mqttUsername: e.target.value })}
                />
              </div>
              <div>
                <Input
                  type="password"
                  placeholder="Password"
                  value={state.mqttPassword}
                  onChange={(e) => update({ mqttPassword: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Required if your broker shows <code className="bg-muted rounded px-1">Connection refused: Not authorized</code>. Credentials are encrypted at rest.</p>
          </div>
        </div>
      </div>
    );
  }

  const isWS = state.sourceType === "websocket";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">
          Step 2 — {isWS ? "WebSocket" : "REST API"} connection
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isWS
            ? "Enter the WebSocket URL the device streams data to. The SCADA driver will maintain a persistent connection."
            : "Enter the API endpoint URL and how often to poll it. The response must return JSON."}
        </p>
      </div>

      <InfoBox>
        {isWS
          ? "The server will open a persistent WebSocket connection and ingest every JSON message received. Make sure the URL is reachable from the SCADA server's network."
          : <>The server will call this endpoint every <strong>{state.pollIntervalSec}s</strong> and ingest the JSON response. The endpoint must be reachable from the SCADA server's network and return a flat or single-level JSON object.</>
        }
      </InfoBox>

      <div className="space-y-4">
        <div>
          <Label className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />
            {isWS ? "WebSocket URL" : "Endpoint URL"} <span className="text-red-400">*</span>
          </Label>
          <Input
            className="mt-1 font-mono text-sm"
            placeholder={isWS ? "wss://device.example.com:8080/live" : "https://api.solarcloud.com/v1/readings"}
            value={state.url}
            onChange={(e) => update({ url: e.target.value })}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {isWS ? "Use wss:// for TLS (required for production), ws:// for plain." : "Must return a JSON object. Arrays: wrap in an object like { \"data\": [...] }."}
          </p>
        </div>

        {!isWS && (
          <div className="sm:w-48">
            <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Poll interval (seconds)</Label>
            <Input
              className="mt-1"
              type="number" min={5} max={3600}
              value={state.pollIntervalSec}
              onChange={(e) => update({ pollIntervalSec: Number(e.target.value) || 30 })}
            />
            <p className="text-xs text-muted-foreground mt-1">Min 5 s · Max 3600 s (1 hour). 30 s suits most inverter APIs.</p>
          </div>
        )}

        <div>
          <Label className="flex items-center gap-1.5"><Key className="h-3.5 w-3.5" /> Authentication</Label>
          <Select value={state.authMethod} onValueChange={(v) => update({ authMethod: v as AuthMethod })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No authentication — public endpoint</SelectItem>
              <SelectItem value="bearer">Bearer token — Authorization: Bearer &lt;token&gt;</SelectItem>
              <SelectItem value="api_key">API key header — custom header name + key</SelectItem>
              <SelectItem value="basic">Basic auth — username : password</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Credentials are encrypted at rest (AES-256-GCM) and never returned by the API.</p>
        </div>

        {state.authMethod === "api_key" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Header name</Label>
              <Input className="mt-1" placeholder="X-API-Key"
                value={state.apiKeyHeader}
                onChange={(e) => update({ apiKeyHeader: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">e.g. X-API-Key, Authorization, X-Auth-Token</p>
            </div>
            <div>
              <Label>Key value</Label>
              <Input className="mt-1" type="password" placeholder="••••••••"
                value={state.authValue}
                onChange={(e) => update({ authValue: e.target.value })} />
            </div>
          </div>
        )}

        {state.authMethod === "bearer" && (
          <div>
            <Label>Bearer token</Label>
            <Input className="mt-1 font-mono text-sm" type="password" placeholder="eyJhbGciOiJ…"
              value={state.authValue}
              onChange={(e) => update({ authValue: e.target.value })} />
            <p className="text-xs text-muted-foreground mt-1">Sent as: <code className="bg-muted rounded px-1">Authorization: Bearer &lt;token&gt;</code></p>
          </div>
        )}

        {state.authMethod === "basic" && (
          <div>
            <Label>Credentials</Label>
            <Input className="mt-1 font-mono text-sm" type="password" placeholder="username:password"
              value={state.authValue}
              onChange={(e) => update({ authValue: e.target.value })} />
            <p className="text-xs text-muted-foreground mt-1">Enter as <code className="bg-muted rounded px-1">username:password</code> — do not Base64 encode it.</p>
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
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Step 3 — {isCSV ? "Preview your data" : "Test connection & preview"}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isCSV
            ? "Paste a sample of your CSV so the wizard can detect column names for field mapping in the next step."
            : "Run a live connection test to confirm the server can reach your endpoint. Then paste or review the sample JSON response — it's used to auto-detect fields in the next step."}
        </p>
      </div>

      {!isCSV && (
        <>
          <InfoBox>
            The test sends a real request from the SCADA server to your endpoint. A success here means the driver will collect data when activated. The test does <strong>not</strong> save anything.
          </InfoBox>

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void handleTest()}
            disabled={testing}
          >
            {testing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing connection…</>
              : <><RefreshCw className="h-4 w-4" /> Test Connection</>}
          </Button>

          {result === "ok" && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>Connection successful — responded in {latency} ms</span>
            </div>
          )}
          {result === "error" && (
            <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-3.5 py-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" /> Connection failed
              </div>
              <p className="text-xs text-red-500 leading-relaxed">{error}</p>
              <p className="text-xs text-muted-foreground">Check the URL, authentication settings, and that the endpoint is reachable from the SCADA server's network.</p>
            </div>
          )}
        </>
      )}

      <div>
        <Label>
          {isCSV ? "Paste CSV sample (first 5–10 rows)" : "Sample JSON response"}
          <span className="text-muted-foreground font-normal ml-1.5 text-xs">— used to auto-detect fields in the next step</span>
        </Label>
        <textarea
          className="mt-1 w-full h-44 rounded-lg border border-border bg-muted/10 px-3 py-2.5 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
          placeholder={isCSV
            ? `timestamp,ac_power_w,daily_yield_kwh,grid_voltage_v\n2024-01-15T08:00:00Z,45000,12.5,230.1\n2024-01-15T08:00:30Z,45500,12.6,230.2`
            : `{\n  "ac_power":      45000,\n  "daily_energy":  125.3,\n  "temperature":   42.1,\n  "grid_voltage":  230.5,\n  "pf":            0.98\n}`}
          value={state.sampleJson}
          onChange={(e) => update({ sampleJson: e.target.value })}
        />
        {!state.sampleJson.trim() && (
          <p className="text-xs text-muted-foreground mt-1">
            Paste a real sample response so the next step can suggest field mappings automatically.
          </p>
        )}
      </div>

      <TipBox>
        {isCSV
          ? "Make sure the first row contains column headers. The wizard will map each column to a SCADA parameter in the next step."
          : "You can skip the test and proceed — but if the connection fails later, the device will show as offline until the issue is resolved."}
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
        const ingestUrl = `${window.location.origin}/api/ingest/${ingestToken}`;
        toast({
          title: "Device activated — copy your ingest URL",
          description: ingestUrl,
          duration: 20000,
        });
      } else {
        toast({
          title: "Data source activated!",
          description: `${state.deviceName} is now connected. The driver will start collecting data shortly.`,
        });
      }
      navigate(`/devices/${device.id}`);
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
      </div>
    </AppLayout>
  );
}
