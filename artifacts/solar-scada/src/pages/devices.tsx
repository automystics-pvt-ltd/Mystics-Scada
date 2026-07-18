/**
 * IoT Device Registry — device list + 3-step registration wizard
 * Protocols: Modbus TCP · Modbus RTU · MQTT · HTTP · WebSocket · OPC-UA · BACnet/IP
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Cpu, Plus, Search, Wifi, WifiOff, AlertCircle, Signal,
  ChevronRight, RefreshCw, CheckCircle2, Loader2, Info,
  HelpCircle, AlertTriangle, ArrowLeft, ArrowRight,
  Server, Radio, Globe, Activity, Zap, GitBranch,
  Key, Clock, Tag, MonitorSpeaker,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

type DeviceStatus = "online" | "offline" | "error";
type Protocol =
  | "modbus" | "modbus_rtu"
  | "mqtt" | "http" | "websocket" | "opcua" | "bacnet";
type AuthMethod = "none" | "bearer" | "api_key" | "basic";

interface Plant    { id: string; name: string; }
interface Template { id: string; manufacturer: string; model: string; protocol: string; defaultPollIntervalS: number; }
interface Gateway  { id: string; name: string; revokedAt: string | null; }

interface Device {
  id: string; orgId: string; plantId: string;
  name: string; type: string; protocol: string;
  templateId: string | null;
  status: DeviceStatus;
  signalStrengthPct: number;
  lastSeenAt: string;
  firmwareVersion: string;
  latestFirmwareVersion: string | null;
  firmwareUpToDate: boolean;
  healthScore: number | null;
  dataSource: "live" | "simulated";
  pendingDeploy: boolean;
  config: {
    ipAddress: string | null; port: number | null;
    modbusUnitId: number | null; brokerUrl: string | null;
    topic: string | null; pollingIntervalSec: number;
    url: string | null;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEVICE_TYPES = [
  "inverter", "smart_meter", "weather_station", "data_logger",
  "RTU", "PLC", "tracker_controller", "sensor", "gateway",
];

interface ProtocolMeta {
  value: Protocol;
  label: string;
  shortLabel: string;
  desc: string;
  icon: typeof Server;
  defaultPort?: number;
  needs: string[];
}

const PROTOCOL_META: ProtocolMeta[] = [
  {
    value: "modbus",
    label: "Modbus TCP",
    shortLabel: "Modbus TCP",
    desc: "Industrial RTU/PLC over Ethernet — most common for inverters",
    icon: Server,
    defaultPort: 502,
    needs: ["Device IP address on the local network", "TCP port (default 502)", "Modbus Unit ID (slave address 1–247)"],
  },
  {
    value: "modbus_rtu",
    label: "Modbus RTU (RS-485 / Serial)",
    shortLabel: "Modbus RTU",
    desc: "RS-485 wired serial bus — used with older RTUs and string inverters",
    icon: GitBranch,
    needs: ["Serial port path (e.g. /dev/ttyUSB0)", "Baud rate (9600 / 19200 / 38400 / 115200)", "Parity, data bits, stop bits matching the device"],
  },
  {
    value: "mqtt",
    label: "MQTT Broker",
    shortLabel: "MQTT",
    desc: "Subscribe to topics on an MQTT broker — common for gateways and loggers",
    icon: Radio,
    needs: ["Broker URL (mqtt:// or mqtts://)", "Topic pattern the device publishes to", "Credentials if the broker requires them"],
  },
  {
    value: "http",
    label: "HTTP / REST API",
    shortLabel: "HTTP",
    desc: "Poll a JSON endpoint — cloud inverter APIs, local web servers",
    icon: Globe,
    defaultPort: 80,
    needs: ["Full endpoint URL (https://…)", "Poll interval", "Authentication (if required)"],
  },
  {
    value: "websocket",
    label: "WebSocket",
    shortLabel: "WebSocket",
    desc: "Persistent push stream — real-time feeds from gateways or loggers",
    icon: Activity,
    needs: ["WebSocket URL (ws:// or wss://)", "Authentication token (if required)"],
  },
  {
    value: "opcua",
    label: "OPC-UA",
    shortLabel: "OPC-UA",
    desc: "IEC 62541 unified architecture — PLCs, SCADA systems, modern inverters",
    icon: Zap,
    defaultPort: 4840,
    needs: ["OPC-UA server endpoint URL (opc.tcp://…)", "Security mode (None / Sign / SignAndEncrypt)", "Credentials (optional)"],
  },
  {
    value: "bacnet",
    label: "BACnet/IP",
    shortLabel: "BACnet",
    desc: "Building automation protocol — weather stations, power meters",
    icon: MonitorSpeaker,
    defaultPort: 47808,
    needs: ["Device IP address", "BACnet/IP port (default 47808 / 0xBAC0)", "BACnet Device Instance number"],
  },
];

const STEP_LABELS = ["Identity", "Connection", "Review & Register"];

// ── Wizard form state ─────────────────────────────────────────────────────────

interface WizardForm {
  // Step 1
  name: string;
  type: string;
  plantId: string;
  templateId: string;
  gatewayId: string;
  // Step 2 — shared
  protocol: Protocol;
  pollingIntervalSec: string;
  // Modbus TCP
  ipAddress: string;
  port: string;
  modbusUnitId: string;
  // Modbus RTU
  serialPort: string;
  baudRate: string;
  parity: "none" | "even" | "odd";
  dataBits: "5" | "6" | "7" | "8";
  stopBits: "1" | "2";
  // MQTT
  brokerUrl: string;
  topic: string;
  // HTTP / WebSocket
  url: string;
  httpAuthMethod: AuthMethod;
  httpAuthValue: string;
  httpApiKeyHeader: string;
  // OPC-UA
  opcuaSecurityMode: "None" | "Sign" | "SignAndEncrypt";
  opcuaUsername: string;
  opcuaPassword: string;
  // BACnet
  bacnetDeviceInstance: string;
}

function defaultForm(): WizardForm {
  return {
    name: "", type: "inverter", plantId: "", templateId: "", gatewayId: "",
    protocol: "modbus", pollingIntervalSec: "30",
    ipAddress: "", port: "502", modbusUnitId: "1",
    serialPort: "/dev/ttyUSB0", baudRate: "9600",
    parity: "none", dataBits: "8", stopBits: "1",
    brokerUrl: "", topic: "",
    url: "", httpAuthMethod: "none", httpAuthValue: "", httpApiKeyHeader: "X-API-Key",
    opcuaSecurityMode: "None", opcuaUsername: "", opcuaPassword: "",
    bacnetDeviceInstance: "",
  };
}

// ── Helper components ─────────────────────────────────────────────────────────

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg bg-blue-500/8 border border-blue-500/20 px-3.5 py-3 text-xs text-blue-600 dark:text-blue-400">
      <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20 px-3.5 py-3 text-xs text-amber-700 dark:text-amber-400">
      <HelpCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

function FieldRow({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="flex items-center gap-1">
        {label}
        {required && <span className="text-red-400 text-xs">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}

// ── Mini step indicator ───────────────────────────────────────────────────────

function WizardSteps({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-4">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all ${
              i < step   ? "bg-primary border-primary text-primary-foreground"
              : i === step ? "border-primary text-primary bg-primary/5"
              : "border-border text-muted-foreground"
            }`}>
              {i < step ? <CheckCircle2 className="h-2.5 w-2.5" /> : i + 1}
            </div>
            <span className={`text-[10px] hidden sm:block ${i === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={`h-px w-4 sm:w-8 mx-1 transition-colors ${i < step ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Identity ──────────────────────────────────────────────────────────

function Step1({
  form, setForm, plants, plantsLoading, templates, gateways,
}: {
  form: WizardForm;
  setForm: React.Dispatch<React.SetStateAction<WizardForm>>;
  plants: Plant[];
  plantsLoading: boolean;
  templates: Template[];
  gateways: Gateway[];
}) {
  function onTemplateChange(templateId: string) {
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) { setForm((f) => ({ ...f, templateId: "" })); return; }
    // Map template protocol back to wizard protocol
    let proto: Protocol = "modbus";
    const p = tmpl.protocol;
    if (p === "modbus_tcp" || p === "modbus") proto = "modbus";
    else if (p === "modbus_rtu") proto = "modbus_rtu";
    else if ((["mqtt","http","websocket","opcua","bacnet"] as string[]).includes(p)) proto = p as Protocol;
    setForm((f) => ({
      ...f,
      templateId,
      protocol: proto,
      pollingIntervalSec: String(tmpl.defaultPollIntervalS),
    }));
  }

  return (
    <div className="space-y-4">
      <InfoBox>
        Give this device a name, assign it to a plant, and optionally pick a template to auto-fill the protocol and register map.
      </InfoBox>

      <FieldRow label="Device Name" required hint="Use a name that uniquely identifies the physical unit, e.g. 'Inverter-1A' or 'WX Station North'.">
        <Input
          placeholder="e.g. INV-01, WeatherStation-A"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </FieldRow>

      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Device Type" required>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEVICE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow label="Plant" required hint={plantsLoading ? "" : plants.length === 0 ? "Create a plant first via Auto-Provision." : ""}>
          <Select
            value={form.plantId}
            onValueChange={(v) => setForm((f) => ({ ...f, plantId: v }))}
            disabled={plantsLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder={plantsLoading ? "Loading…" : plants.length === 0 ? "No plants yet" : "Select plant…"} />
            </SelectTrigger>
            <SelectContent>
              {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldRow>
      </div>

      <FieldRow
        label="Device Template"
        hint="Optional — selecting a template auto-fills the protocol, polling interval, and register/field map. You can still change values in the next step."
      >
        <Select value={form.templateId || "none"} onValueChange={(v) => onTemplateChange(v === "none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="No template (configure manually)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No template — configure manually</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.manufacturer} — {t.model}
                <span className="text-muted-foreground ml-2 text-xs">({t.protocol})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow
        label="Edge Gateway"
        hint="Leave unset to have the cloud server poll directly. Set only if a local edge gateway agent is installed and running on-site."
      >
        <Select value={form.gatewayId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, gatewayId: v === "none" ? "" : v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">☁ Cloud — direct connection (default)</SelectItem>
            {gateways.filter((g) => !g.revokedAt).map((g) => (
              <SelectItem key={g.id} value={g.id}>⬡ {g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.gatewayId && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
            Gateway polling supports Modbus TCP, MQTT, and HTTP only.
          </p>
        )}
      </FieldRow>
    </div>
  );
}

// ── Step 2: Protocol & Connection ─────────────────────────────────────────────

function Step2({
  form, setForm,
}: {
  form: WizardForm;
  setForm: React.Dispatch<React.SetStateAction<WizardForm>>;
}) {
  const [testing,  setTesting]  = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null);
  const [testError, setTestError] = useState("");
  const [testLatency, setTestLatency] = useState(0);

  const meta = PROTOCOL_META.find((m) => m.value === form.protocol)!;

  function onProtocolChange(p: Protocol) {
    const meta = PROTOCOL_META.find((m) => m.value === p);
    setForm((f) => ({
      ...f,
      protocol: p,
      port: meta?.defaultPort ? String(meta.defaultPort) : f.port,
    }));
    setTestResult(null);
  }

  async function runTest() {
    setTesting(true); setTestResult(null); setTestError("");
    const t0 = Date.now();
    try {
      // Map wizard protocol to API protocol
      const apiProtocol =
        form.protocol === "modbus" ? "modbus"
        : form.protocol === "modbus_rtu" ? "modbus_rtu"
        : form.protocol;

      const body: Record<string, unknown> = { protocol: apiProtocol };
      if (form.protocol === "modbus") {
        body.ipAddress    = form.ipAddress;
        body.port         = Number(form.port) || 502;
        body.modbusUnitId = Number(form.modbusUnitId) || 1;
      } else if (form.protocol === "modbus_rtu") {
        body.serialPort = form.serialPort;
        body.baudRate   = Number(form.baudRate) || 9600;
        body.parity     = form.parity;
        body.dataBits   = Number(form.dataBits);
        body.stopBits   = Number(form.stopBits);
        body.modbusUnitId = Number(form.modbusUnitId) || 1;
      } else if (form.protocol === "mqtt") {
        body.brokerUrl = form.brokerUrl;
        body.topic     = form.topic;
      } else if (form.protocol === "bacnet") {
        body.ipAddress            = form.ipAddress;
        body.port                 = Number(form.port) || 47808;
        body.bacnetDeviceInstance = Number(form.bacnetDeviceInstance);
      } else if (form.protocol === "opcua") {
        body.url               = form.url;
        body.opcuaSecurityMode = form.opcuaSecurityMode;
        if (form.opcuaUsername) body.opcuaUsername = form.opcuaUsername;
        if (form.opcuaPassword) body.opcuaPassword = form.opcuaPassword;
      } else {
        body.url = form.url;
        if (form.httpAuthMethod !== "none") {
          body.httpAuthMethod   = form.httpAuthMethod;
          body.httpAuthValue    = form.httpAuthValue;
          body.httpApiKeyHeader = form.httpApiKeyHeader;
        }
      }

      const res = await fetch(`${BASE}api/devices/connection-preflight`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; error?: string; latencyMs?: number };
      if (!data.ok) throw new Error(data.error ?? "Connection failed");
      setTestResult("ok");
      setTestLatency(Date.now() - t0);
    } catch (e) {
      setTestResult("error");
      setTestError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Protocol picker */}
      <div>
        <Label className="mb-2 block">Protocol <span className="text-red-400 text-xs">*</span></Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PROTOCOL_META.map(({ value, shortLabel, desc, icon: Icon }) => (
            <button
              key={value}
              onClick={() => onProtocolChange(value)}
              className={`rounded-lg border-2 p-2.5 text-left transition-all ${
                form.protocol === value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <Icon className={`h-4 w-4 mb-1 ${form.protocol === value ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-[11px] font-semibold leading-tight">{shortLabel}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">{meta.desc}</p>
      </div>

      {/* What you need */}
      <div className="rounded-lg border border-border bg-muted/5 p-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Required for {meta.label}</p>
        {meta.needs.map((n) => (
          <div key={n} className="flex items-start gap-2 text-xs">
            <CheckCircle2 className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
            <span className="text-muted-foreground">{n}</span>
          </div>
        ))}
      </div>

      {/* ── Modbus TCP fields ── */}
      {form.protocol === "modbus" && (
        <div className="space-y-3">
          <InfoBox>Modbus TCP uses the device's Ethernet/IP interface. The default port is 502. The Unit ID (slave address) is printed on the device label — typically 1 for single-unit inverters.</InfoBox>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 sm:col-span-1">
              <FieldRow label="IP Address" required hint="IPv4 address on the local network">
                <Input className="font-mono text-sm" placeholder="192.168.1.100"
                  value={form.ipAddress} onChange={(e) => setForm((f) => ({ ...f, ipAddress: e.target.value }))} />
              </FieldRow>
            </div>
            <div>
              <FieldRow label="TCP Port" required hint="Default: 502">
                <Input type="number" min={1} max={65535}
                  value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} />
              </FieldRow>
            </div>
            <div>
              <FieldRow label="Unit ID" required hint="1–247">
                <Input type="number" min={1} max={247}
                  value={form.modbusUnitId} onChange={(e) => setForm((f) => ({ ...f, modbusUnitId: e.target.value }))} />
              </FieldRow>
            </div>
          </div>
        </div>
      )}

      {/* ── Modbus RTU fields ── */}
      {form.protocol === "modbus_rtu" && (
        <div className="space-y-3">
          <InfoBox>RS-485 / serial Modbus. The server must have a USB-to-RS485 adapter (or native RS-485 port) connected. Match baud rate, parity, data bits, and stop bits exactly to the device datasheet.</InfoBox>
          <FieldRow label="Serial Port" required hint="Linux: /dev/ttyUSB0, /dev/ttyS0 — check with 'ls /dev/tty*' on the server">
            <Input className="font-mono text-sm" placeholder="/dev/ttyUSB0"
              value={form.serialPort} onChange={(e) => setForm((f) => ({ ...f, serialPort: e.target.value }))} />
          </FieldRow>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FieldRow label="Baud Rate" required>
              <Select value={form.baudRate} onValueChange={(v) => setForm((f) => ({ ...f, baudRate: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["1200","2400","4800","9600","19200","38400","57600","115200"].map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Parity">
              <Select value={form.parity} onValueChange={(v) => setForm((f) => ({ ...f, parity: v as WizardForm["parity"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="even">Even</SelectItem>
                  <SelectItem value="odd">Odd</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Data Bits">
              <Select value={form.dataBits} onValueChange={(v) => setForm((f) => ({ ...f, dataBits: v as WizardForm["dataBits"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["5","6","7","8"].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Stop Bits">
              <Select value={form.stopBits} onValueChange={(v) => setForm((f) => ({ ...f, stopBits: v as WizardForm["stopBits"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
          <FieldRow label="Modbus Unit ID" required hint="Slave address 1–247 set on the device">
            <Input type="number" min={1} max={247} className="sm:w-32"
              value={form.modbusUnitId} onChange={(e) => setForm((f) => ({ ...f, modbusUnitId: e.target.value }))} />
          </FieldRow>
          <TipBox>Most inverters default to 8N1 (8 data bits, No parity, 1 stop bit) at 9600 baud. Check the device manual or the RS-485 port label.</TipBox>
        </div>
      )}

      {/* ── MQTT fields ── */}
      {form.protocol === "mqtt" && (
        <div className="space-y-3">
          <InfoBox>The platform will connect to the broker and subscribe to the topic. Wildcard topics (<code className="bg-blue-500/10 rounded px-1">+</code> single-level, <code className="bg-blue-500/10 rounded px-1">#</code> multi-level) are supported. Each matching message is ingested.</InfoBox>
          <FieldRow label="Broker URL" required hint="mqtt:// for plain TCP, mqtts:// for TLS. Include port if non-standard.">
            <Input className="font-mono text-sm" placeholder="mqtt://192.168.1.50:1883"
              value={form.brokerUrl} onChange={(e) => setForm((f) => ({ ...f, brokerUrl: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Topic Pattern" required hint="Exact topic or wildcard — e.g. plant/site1/inv/+/data">
            <Input className="font-mono text-sm" placeholder="solar/plant/+/inverter/data"
              value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} />
          </FieldRow>
        </div>
      )}

      {/* ── HTTP fields ── */}
      {form.protocol === "http" && (
        <div className="space-y-3">
          <InfoBox>The server polls this URL on the configured interval and ingests the JSON response. The endpoint must return a flat or single-level JSON object.</InfoBox>
          <FieldRow label="Endpoint URL" required hint="Full URL including scheme — https:// recommended for production">
            <Input className="font-mono text-sm" placeholder="https://api.solarcloud.com/v1/readings"
              value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Authentication" hint="Credentials are encrypted at rest (AES-256-GCM)">
              <Select value={form.httpAuthMethod} onValueChange={(v) => setForm((f) => ({ ...f, httpAuthMethod: v as AuthMethod }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No auth — public endpoint</SelectItem>
                  <SelectItem value="bearer">Bearer token</SelectItem>
                  <SelectItem value="api_key">API key header</SelectItem>
                  <SelectItem value="basic">Basic (user:pass)</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Poll Interval (s)" hint="5–3600 s">
              <Input type="number" min={5} max={3600}
                value={form.pollingIntervalSec} onChange={(e) => setForm((f) => ({ ...f, pollingIntervalSec: e.target.value }))} />
            </FieldRow>
          </div>
          {form.httpAuthMethod === "api_key" && (
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Header name" hint="e.g. X-API-Key">
                <Input placeholder="X-API-Key" value={form.httpApiKeyHeader}
                  onChange={(e) => setForm((f) => ({ ...f, httpApiKeyHeader: e.target.value }))} />
              </FieldRow>
              <FieldRow label="Key value">
                <Input type="password" placeholder="••••••••" value={form.httpAuthValue}
                  onChange={(e) => setForm((f) => ({ ...f, httpAuthValue: e.target.value }))} />
              </FieldRow>
            </div>
          )}
          {(form.httpAuthMethod === "bearer" || form.httpAuthMethod === "basic") && (
            <FieldRow
              label={form.httpAuthMethod === "bearer" ? "Bearer token" : "Credentials (user:password)"}
              hint={form.httpAuthMethod === "basic" ? "Enter as username:password — do not Base64 encode" : ""}
            >
              <Input type="password" placeholder="••••••••" value={form.httpAuthValue}
                onChange={(e) => setForm((f) => ({ ...f, httpAuthValue: e.target.value }))} />
            </FieldRow>
          )}
        </div>
      )}

      {/* ── WebSocket fields ── */}
      {form.protocol === "websocket" && (
        <div className="space-y-3">
          <InfoBox>The server maintains a persistent WebSocket connection and ingests every JSON message received. Use wss:// for TLS — required in production.</InfoBox>
          <FieldRow label="WebSocket URL" required hint="ws:// for plain, wss:// for TLS">
            <Input className="font-mono text-sm" placeholder="wss://device.example.com:8080/stream"
              value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Authentication" hint="Credentials are encrypted at rest">
            <Select value={form.httpAuthMethod} onValueChange={(v) => setForm((f) => ({ ...f, httpAuthMethod: v as AuthMethod }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No auth</SelectItem>
                <SelectItem value="bearer">Bearer token (sent as header)</SelectItem>
                <SelectItem value="api_key">API key header</SelectItem>
                <SelectItem value="basic">Basic (user:pass)</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          {form.httpAuthMethod === "api_key" && (
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Header name">
                <Input placeholder="X-API-Key" value={form.httpApiKeyHeader}
                  onChange={(e) => setForm((f) => ({ ...f, httpApiKeyHeader: e.target.value }))} />
              </FieldRow>
              <FieldRow label="Key value">
                <Input type="password" placeholder="••••••••" value={form.httpAuthValue}
                  onChange={(e) => setForm((f) => ({ ...f, httpAuthValue: e.target.value }))} />
              </FieldRow>
            </div>
          )}
          {(form.httpAuthMethod === "bearer" || form.httpAuthMethod === "basic") && (
            <FieldRow label={form.httpAuthMethod === "bearer" ? "Bearer token" : "Credentials (user:password)"}>
              <Input type="password" placeholder="••••••••" value={form.httpAuthValue}
                onChange={(e) => setForm((f) => ({ ...f, httpAuthValue: e.target.value }))} />
            </FieldRow>
          )}
        </div>
      )}

      {/* ── OPC-UA fields ── */}
      {form.protocol === "opcua" && (
        <div className="space-y-3">
          <InfoBox>OPC-UA (IEC 62541) uses a TCP endpoint URL. The server polls the node IDs defined in the device template. If you don't have a template, add one from Dev Templates first.</InfoBox>
          <FieldRow label="Endpoint URL" required hint="opc.tcp://host:4840 or opc.tcp://host:4840/path">
            <Input className="font-mono text-sm" placeholder="opc.tcp://192.168.1.20:4840"
              value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
          </FieldRow>
          <div className="grid grid-cols-3 gap-3">
            <FieldRow label="Security Mode" hint="Match server config">
              <Select value={form.opcuaSecurityMode} onValueChange={(v) => setForm((f) => ({ ...f, opcuaSecurityMode: v as WizardForm["opcuaSecurityMode"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None (no encryption)</SelectItem>
                  <SelectItem value="Sign">Sign only</SelectItem>
                  <SelectItem value="SignAndEncrypt">Sign & Encrypt</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Username">
              <Input placeholder="optional" value={form.opcuaUsername}
                onChange={(e) => setForm((f) => ({ ...f, opcuaUsername: e.target.value }))} />
            </FieldRow>
            <FieldRow label="Password">
              <Input type="password" placeholder="optional" value={form.opcuaPassword}
                onChange={(e) => setForm((f) => ({ ...f, opcuaPassword: e.target.value }))} />
            </FieldRow>
          </div>
          <TipBox>Node IDs to read (e.g. ns=2;i=1001) are defined in the device template. Go to Dev Templates → create or pick an OPC-UA template, then assign it in Step 1.</TipBox>
        </div>
      )}

      {/* ── BACnet/IP fields ── */}
      {form.protocol === "bacnet" && (
        <div className="space-y-3">
          <InfoBox>BACnet/IP communicates over UDP. The Device Instance is a unique number assigned to each BACnet device — find it in the device's BACnet configuration menu or documentation.</InfoBox>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 sm:col-span-1">
              <FieldRow label="IP Address" required>
                <Input className="font-mono text-sm" placeholder="192.168.1.40"
                  value={form.ipAddress} onChange={(e) => setForm((f) => ({ ...f, ipAddress: e.target.value }))} />
              </FieldRow>
            </div>
            <FieldRow label="UDP Port" hint="Default: 47808">
              <Input type="number" value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} />
            </FieldRow>
            <FieldRow label="Device Instance" required hint="0–4194302">
              <Input type="number" min={0} max={4194302} placeholder="1001"
                value={form.bacnetDeviceInstance} onChange={(e) => setForm((f) => ({ ...f, bacnetDeviceInstance: e.target.value }))} />
            </FieldRow>
          </div>
        </div>
      )}

      {/* Polling interval — not shown for event-driven MQTT/WebSocket */}
      {!["mqtt","websocket"].includes(form.protocol) && (
        <FieldRow label="Poll Interval (seconds)" hint="How often the driver reads from this device. Min 5 s, max 3600 s.">
          <Input type="number" min={5} max={3600} className="sm:w-32"
            value={form.pollingIntervalSec} onChange={(e) => setForm((f) => ({ ...f, pollingIntervalSec: e.target.value }))} />
        </FieldRow>
      )}

      {/* Connection test */}
      <div className="border-t border-border pt-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Optional — test the connection before registering:</p>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => void runTest()} disabled={testing}>
          {testing
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing…</>
            : <><Zap className="h-3.5 w-3.5" /> Test Connection</>}
        </Button>
        {testResult === "ok" && (
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-500/5 border border-green-500/20 rounded px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            Connection successful — {testLatency} ms round trip
          </div>
        )}
        {testResult === "error" && (
          <div className="rounded bg-red-500/5 border border-red-500/20 px-3 py-2 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-red-500">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> Connection failed
            </div>
            <p className="text-[10px] text-red-400 leading-relaxed">{testError}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 3: Review & Register ─────────────────────────────────────────────────

function Step3({
  form, plants,
}: {
  form: WizardForm;
  plants: Plant[];
}) {
  const meta = PROTOCOL_META.find((m) => m.value === form.protocol)!;
  const plantName = plants.find((p) => p.id === form.plantId)?.name ?? form.plantId;

  const connLines: { label: string; value: string }[] = [];
  if (form.protocol === "modbus") {
    connLines.push({ label: "Address", value: `${form.ipAddress}:${form.port}` });
    connLines.push({ label: "Unit ID", value: form.modbusUnitId });
  } else if (form.protocol === "modbus_rtu") {
    connLines.push({ label: "Serial Port", value: form.serialPort });
    connLines.push({ label: "Baud / Framing", value: `${form.baudRate} ${form.dataBits}${form.parity[0]?.toUpperCase()}${form.stopBits}` });
    connLines.push({ label: "Unit ID", value: form.modbusUnitId });
  } else if (form.protocol === "mqtt") {
    connLines.push({ label: "Broker", value: form.brokerUrl });
    connLines.push({ label: "Topic", value: form.topic });
  } else if (form.protocol === "bacnet") {
    connLines.push({ label: "Address", value: `${form.ipAddress}:${form.port}` });
    connLines.push({ label: "Device Instance", value: form.bacnetDeviceInstance });
  } else {
    connLines.push({ label: "URL", value: form.url });
    if (form.httpAuthMethod !== "none") {
      connLines.push({ label: "Auth", value: form.httpAuthMethod });
    }
  }
  if (!["mqtt","websocket"].includes(form.protocol)) {
    connLines.push({ label: "Poll interval", value: `${form.pollingIntervalSec} s` });
  }

  return (
    <div className="space-y-4">
      <InfoBox>
        Review your configuration. Clicking <strong>Register Device</strong> will save the device and immediately start the driver. The device will appear as <em>Connecting</em> briefly, then go Online once the first reading arrives.
      </InfoBox>

      <div className="rounded-lg border border-border bg-muted/5 divide-y divide-border text-sm">
        {/* Identity */}
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Identity</p>
          <div className="flex gap-3 text-xs"><span className="w-24 text-muted-foreground">Name</span><span className="font-medium">{form.name}</span></div>
          <div className="flex gap-3 text-xs"><span className="w-24 text-muted-foreground">Type</span><span>{form.type}</span></div>
          <div className="flex gap-3 text-xs"><span className="w-24 text-muted-foreground">Plant</span><span>{plantName}</span></div>
          {form.gatewayId && <div className="flex gap-3 text-xs"><span className="w-24 text-muted-foreground">Gateway</span><span className="text-amber-500">Edge agent assigned</span></div>}
          {form.templateId && <div className="flex gap-3 text-xs"><span className="w-24 text-muted-foreground">Template</span><span>Applied</span></div>}
        </div>
        {/* Connection */}
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Connection</p>
          <div className="flex gap-3 text-xs"><span className="w-24 text-muted-foreground">Protocol</span><span className="font-medium">{meta.label}</span></div>
          {connLines.map(({ label, value }) => (
            <div key={label} className="flex gap-3 text-xs">
              <span className="w-24 text-muted-foreground">{label}</span>
              <span className="font-mono truncate">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {!form.name.trim() && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> Device name is required.
        </div>
      )}
      {!form.plantId && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> Plant assignment is required.
        </div>
      )}

      <TipBox>
        After registration you can edit connection details, assign or change templates, and view live readings from the device detail page.
      </TipBox>
    </div>
  );
}

// ── Status/signal helpers ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DeviceStatus }) {
  if (status === "online")
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-500"><Wifi className="h-3 w-3" /> Online</span>;
  if (status === "offline")
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><WifiOff className="h-3 w-3" /> Offline</span>;
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500"><AlertCircle className="h-3 w-3" /> Error</span>;
}

function SignalBar({ pct }: { pct: number }) {
  const color = pct >= 60 ? "bg-green-500" : pct >= 30 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function protoLabel(p: string) {
  const m = PROTOCOL_META.find((x) => x.value === p);
  return m?.shortLabel ?? p.toUpperCase();
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DevicesPage() {
  const [, navigate]    = useLocation();
  const queryClient     = useQueryClient();
  const { toast }       = useToast();
  const { user }        = useAuth();
  const canManage       = user?.permissions?.includes("device.manage") ?? false;

  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType,   setFilterType]   = useState("all");
  const [filterProto,  setFilterProto]  = useState("all");

  const [showWizard, setShowWizard] = useState(false);
  const [step,       setStep]       = useState(0);
  const [form,       setForm]       = useState<WizardForm>(defaultForm());

  // ── Data queries ─────────────────────────────────────────────────────────────

  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load devices");
      return r.json() as Promise<Device[]>;
    },
    refetchInterval: 30_000,
  });

  const { data: plants = [], isLoading: plantsLoading } = useQuery<Plant[]>({
    queryKey: ["plants"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/plants`, { credentials: "include" });
      return r.ok ? r.json() as Promise<Plant[]> : [];
    },
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["device-templates"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/device-templates`, { credentials: "include" });
      return r.ok ? r.json() as Promise<Template[]> : [];
    },
  });

  const { data: gateways = [] } = useQuery<Gateway[]>({
    queryKey: ["org-gateways-select"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/gateway/list`, { credentials: "include" });
      return r.ok ? r.json() as Promise<Gateway[]> : [];
    },
  });

  // ── Register mutation ─────────────────────────────────────────────────────────

  const registerMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name:               form.name,
        type:               form.type,
        protocol:           form.protocol,
        plantId:            form.plantId,
        pollingIntervalSec: Number(form.pollingIntervalSec) || 30,
      };
      if (form.templateId) body.templateId = form.templateId;
      if (form.gatewayId)  body.gatewayId  = form.gatewayId;

      if (form.protocol === "modbus") {
        if (form.ipAddress)    body.ipAddress    = form.ipAddress;
        if (form.port)         body.port         = Number(form.port);
        if (form.modbusUnitId) body.modbusUnitId = Number(form.modbusUnitId);
      } else if (form.protocol === "modbus_rtu") {
        body.serialPort   = form.serialPort;
        body.baudRate     = Number(form.baudRate) || 9600;
        body.parity       = form.parity;
        body.dataBits     = Number(form.dataBits);
        body.stopBits     = Number(form.stopBits);
        if (form.modbusUnitId) body.modbusUnitId = Number(form.modbusUnitId);
      } else if (form.protocol === "mqtt") {
        if (form.brokerUrl) body.brokerUrl = form.brokerUrl;
        if (form.topic)     body.topic     = form.topic;
      } else if (form.protocol === "bacnet") {
        if (form.ipAddress)            body.ipAddress            = form.ipAddress;
        if (form.port)                 body.port                 = Number(form.port);
        if (form.bacnetDeviceInstance) body.bacnetDeviceInstance = Number(form.bacnetDeviceInstance);
      } else if (form.protocol === "opcua") {
        if (form.url) body.url = form.url;
        body.opcuaSecurityMode = form.opcuaSecurityMode;
        if (form.opcuaUsername) body.opcuaUsername = form.opcuaUsername;
        if (form.opcuaPassword) body.opcuaPassword = form.opcuaPassword;
      } else {
        // http / websocket
        if (form.url) body.url = form.url;
        if (form.httpAuthMethod !== "none") {
          body.httpAuthMethod   = form.httpAuthMethod;
          body.httpAuthValue    = form.httpAuthValue;
          if (form.httpAuthMethod === "api_key") body.httpApiKeyHeader = form.httpApiKeyHeader;
        }
      }

      const r = await fetch(`${BASE}api/devices`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { message?: string };
        throw new Error(e.message ?? "Failed to register device");
      }
      return r.json() as Promise<Device>;
    },
    onSuccess: (device) => {
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      setShowWizard(false);
      setStep(0);
      setForm(defaultForm());
      toast({ title: "Device registered", description: `${device.name} is now connecting.` });
      navigate(`/devices/${device.id}`);
    },
    onError: (e: Error) => toast({ title: "Registration failed", description: e.message, variant: "destructive" }),
  });

  // ── Validation ────────────────────────────────────────────────────────────────

  const step1Valid = !!form.name.trim() && !!form.plantId;
  const step2Valid = (() => {
    if (form.protocol === "modbus")     return !!form.ipAddress;
    if (form.protocol === "modbus_rtu") return !!form.serialPort;
    if (form.protocol === "mqtt")       return !!form.brokerUrl && !!form.topic;
    if (form.protocol === "bacnet")     return !!form.ipAddress && !!form.bacnetDeviceInstance;
    return !!form.url; // http, websocket, opcua
  })();

  // ── Filters ───────────────────────────────────────────────────────────────────

  const filtered = devices.filter((d) => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.type.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    if (filterType   !== "all" && d.type   !== filterType)   return false;
    if (filterProto  !== "all" && d.protocol !== filterProto) return false;
    return true;
  });

  const counts = {
    online:  devices.filter((d) => d.status === "online").length,
    offline: devices.filter((d) => d.status === "offline").length,
    error:   devices.filter((d) => d.status === "error").length,
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Cpu className="h-6 w-6 text-primary" /> IoT Device Registry
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Registered field devices — inverters, RTUs, PLCs, sensors, and gateways
            </p>
          </div>
          {canManage && (
            <Button onClick={() => { setShowWizard(true); setStep(0); setForm(defaultForm()); }} size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Register Device
            </Button>
          )}
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Online",  count: counts.online,  cls: "text-green-500",         bg: "bg-green-500/8"  },
            { label: "Offline", count: counts.offline, cls: "text-muted-foreground",  bg: "bg-muted/30"     },
            { label: "Error",   count: counts.error,   cls: "text-red-500",           bg: "bg-red-500/8"    },
          ].map(({ label, count, cls, bg }) => (
            <div key={label} className={`rounded-lg border border-border ${bg} px-4 py-3 flex items-center justify-between`}>
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className={`text-2xl font-bold ${cls}`}>{count}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search devices…" className="pl-8 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 min-w-[120px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 min-w-[120px]"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {DEVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterProto} onValueChange={setFilterProto}>
            <SelectTrigger className="h-9 min-w-[130px]"><SelectValue placeholder="All protocols" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All protocols</SelectItem>
              {PROTOCOL_META.map((m) => <SelectItem key={m.value} value={m.value}>{m.shortLabel}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-9 gap-1.5"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["devices"] })}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Device", "Type", "Protocol", "Plant", "Status", "Signal", "Last Comm", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                  Loading devices…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  {devices.length === 0
                    ? <div className="space-y-2"><Cpu className="h-8 w-8 mx-auto opacity-20" /><p>No devices registered yet.</p>{canManage && <p className="text-xs">Click <strong>Register Device</strong> to add your first device.</p>}</div>
                    : "No devices match your filters."}
                </td></tr>
              ) : filtered.map((d) => (
                <tr key={d.id}
                  className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                  onClick={() => navigate(`/devices/${d.id}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{d.name}</span>
                      {d.dataSource === "live" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 font-medium border border-green-500/20">LIVE</span>
                      )}
                      {d.pendingDeploy && (
                        <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400 py-0">Deploy</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{typeLabel(d.type)}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{protoLabel(d.protocol)}</code>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {plants.find((p) => p.id === d.plantId)?.name?.split(" ").slice(0, 2).join(" ") ?? d.plantId}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-3">
                    {d.status !== "offline" ? <SignalBar pct={d.signalStrengthPct} /> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{timeAgo(d.lastSeenAt)}</td>
                  <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">Showing {filtered.length} of {devices.length} device{devices.length !== 1 ? "s" : ""}</p>
        )}
      </div>

      {/* ── Registration Wizard Modal ── */}
      <Dialog open={showWizard} onOpenChange={(open) => { if (!open) { setShowWizard(false); setStep(0); } }}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" /> Register New Device
            </DialogTitle>
          </DialogHeader>

          <WizardSteps step={step} />

          <div className="space-y-0 min-h-[320px]">
            {step === 0 && (
              <Step1
                form={form} setForm={setForm}
                plants={plants} plantsLoading={plantsLoading}
                templates={templates} gateways={gateways}
              />
            )}
            {step === 1 && <Step2 form={form} setForm={setForm} />}
            {step === 2 && <Step3 form={form} plants={plants} />}
          </div>

          {/* Wizard navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            <Button variant="outline" size="sm"
              onClick={() => step === 0 ? setShowWizard(false) : setStep((s) => s - 1)}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              {step === 0 ? "Cancel" : "Back"}
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Step {step + 1} of {STEP_LABELS.length}</span>
              {step < 2 ? (
                <Button size="sm"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={step === 0 ? !step1Valid : !step2Valid}>
                  Next <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              ) : (
                <Button size="sm"
                  onClick={() => registerMutation.mutate()}
                  disabled={!step1Valid || !step2Valid || registerMutation.isPending}>
                  {registerMutation.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Registering…</>
                    : <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Register Device</>}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
