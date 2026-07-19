import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import {
  Cpu,
  ArrowLeft,
  Wifi,
  WifiOff,
  AlertCircle,
  RotateCcw,
  RefreshCw,
  Save,
  CheckCircle2,
  Clock,
  Signal,
  Activity,
  FlaskConical,
  Radio,
  X,
  Upload,
  FileText,
  Loader2,
  Wand2,
  Plus,
  Trash2,
  Hash,
  Type,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { useDeviceStream } from "@/hooks/useDeviceStream";
import { MiniLineChart, DonutChart } from "@/components/ui/svg-charts";

const BASE = import.meta.env.BASE_URL;

type DeviceStatus = "online" | "offline" | "error";
type LogLevel = "INFO" | "WARN" | "ERROR";

interface FieldDef { key: string; label: string; unit: string; jsonPath?: string; multiplier?: number; offset?: number; }

interface Template { id: string; manufacturer: string; model: string; fieldMap: FieldDef[]; }

interface Device {
  id: string;
  plantId: string;
  name: string;
  type: string;
  protocol: string;
  templateId: string | null;
  gatewayId: string | null;
  status: DeviceStatus;
  signalStrengthPct: number;
  lastSeenAt: string;
  firmwareVersion: string;
  dataSource: "live" | "simulated";
  pendingDeploy: boolean;
  healthScore: number | null;
  consecutiveFailures: number;
  latestFirmwareVersion: string | null;
  firmwareUpToDate: boolean;
  template: Template | null;
  config: {
    ipAddress: string | null;
    port: number | null;
    modbusUnitId: number | null;
    brokerUrl: string | null;
    topic: string | null;
    url: string | null;
    pollingIntervalSec: number;
    fieldMap?: FieldDef[];
    // HTTP / WebSocket auth
    httpAuthMethod: string | null;
    httpApiKeyHeader: string | null;
    httpAuthConfigured: boolean;
    // Modbus RTU / RS485
    serialPort: string | null;
    baudRate: number | null;
    parity: string | null;
    dataBits: number | null;
    stopBits: number | null;
    // OPC-UA
    opcuaSecurityMode: string | null;
    opcuaUsername: string | null;
    opcuaPasswordConfigured: boolean;
    // BACnet/IP
    bacnetDeviceInstance: number | null;
  };
  connectivityTimeline: { timestamp: string; status: DeviceStatus }[];
}

interface Reading {
  ts: string;
  params: Record<string, number | string | boolean | null>;
}

interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  sampleParams?: Record<string, number | string>;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  eventType?: string | null;
}

interface ConnectivityBucket {
  timestamp: string;
  status: "online" | "offline" | "degraded" | "error" | "no_data";
  successCount: number;
  failureCount: number;
}

interface PollingStats {
  readingCount24h: number;
  errorCount24h: number;
  successRate24h: number | null;
  avgRttMs: number | null;
  lastRttMs: number | null;
  lastReadingAt: string | null;
  driverStatus: string;
}

interface ErrorBreakdownEntry { category: string; count: number; }

interface Diagnostics {
  deviceId: string;
  healthScore: number | null;
  consecutiveFailures: number;
  dataSource: "live" | "simulated";
  connectivityTimeline: ConnectivityBucket[];
  pollingStats: PollingStats;
  errorBreakdown: ErrorBreakdownEntry[];
}

interface FirmwareHistoryEntry {
  id: string;
  previousVersion: string | null;
  newVersion: string;
  detectedAt: string;
}

// Plant names loaded from API at render time — no hardcoded dict

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function StatusDot({ status }: { status: DeviceStatus }) {
  const map = {
    online:  { Icon: Wifi,        cls: "text-status-normal",   label: "Online"  },
    offline: { Icon: WifiOff,     cls: "text-muted-foreground", label: "Offline" },
    error:   { Icon: AlertCircle, cls: "text-status-fault",    label: "Error"   },
  };
  const { Icon, cls, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${cls}`}>
      <Icon className="h-4 w-4" /> {label}
    </span>
  );
}

function ConnectivityTimeline({ points }: { points: { timestamp: string; status: DeviceStatus }[] }) {
  const colorMap: Record<DeviceStatus, string> = {
    online:  "bg-status-normal",
    offline: "bg-muted-foreground/30",
    error:   "bg-status-fault",
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 h-6">
        {points.map((p, i) => (
          <div
            key={i}
            title={`${new Date(p.timestamp).toLocaleTimeString()} — ${p.status}`}
            className={`flex-1 h-full rounded-sm ${colorMap[p.status]}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>24h ago</span>
        <span>Now</span>
      </div>
      <div className="flex gap-4 text-[10px] text-muted-foreground">
        {[
          { label: "Online",  cls: "bg-status-normal" },
          { label: "Offline", cls: "bg-muted-foreground/30" },
          { label: "Error",   cls: "bg-status-fault" },
        ].map(({ label, cls }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`h-2 w-4 rounded-sm ${cls}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LogLevelBadge({ level }: { level: LogLevel }) {
  const map: Record<LogLevel, string> = {
    INFO:  "bg-muted/50 text-muted-foreground",
    WARN:  "bg-status-warning/15 text-status-warning",
    ERROR: "bg-status-fault/15 text-status-fault",
  };
  return (
    <span className={`inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${map[level]}`}>
      {level}
    </span>
  );
}

type Tab = "config" | "logs" | "history" | "live-data" | "diagnostics";

export default function DeviceDetailPage() {
  const [, params] = useRoute("/devices/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("device.manage") ?? false;

  const deviceId = params?.id ?? "";
  const [activeTab, setActiveTab] = useState<Tab>("config");
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirmSync, setConfirmSync] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  // CSV import state
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; columns: string[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Config edit state
  const [editing, setEditing] = useState(false);
  const [configForm, setConfigForm] = useState<{
    // Common
    pollingIntervalSec: string; gatewayId: string;
    // Modbus TCP
    ipAddress: string; port: string; modbusUnitId: string;
    // MQTT
    brokerUrl: string; topic: string;
    // HTTP / WebSocket / OPC-UA
    url: string;
    // HTTP / WebSocket auth
    httpAuthMethod: string; httpAuthValue: string; httpApiKeyHeader: string;
    // Modbus RTU
    serialPort: string; baudRate: string; parity: string; dataBits: string; stopBits: string;
    // OPC-UA
    opcuaSecurityMode: string; opcuaUsername: string; opcuaPassword: string;
    // BACnet/IP
    bacnetDeviceInstance: string;
  } | null>(null);
  const [fieldMapEditing, setFieldMapEditing] = useState(false);
  const [fieldMapDraft, setFieldMapDraft] = useState<FieldDef[]>([]);
  const [sniffFields, setSniffFields] = useState<{ jsonPath: string; suggestedKey: string; type: string; sample: unknown }[] | null>(null);
  const [sniffLoading, setSniffLoading] = useState(false);

  const { data: gateways = [] } = useQuery<{ id: string; name: string; revokedAt: string | null }[]>({
    queryKey: ["org-gateways-select"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/gateway/list`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json() as Promise<{ id: string; name: string; revokedAt: string | null }[]>;
    },
  });

  // Plant names from API — replaces the old hardcoded PLANT_NAMES dict
  const { data: plantsMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["plants-name-map"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/plants`, { credentials: "include" });
      if (!r.ok) return {};
      const arr = await r.json() as { id: string; name: string }[];
      return Object.fromEntries(arr.map(p => [p.id, p.name]));
    },
    staleTime: 5 * 60_000,
  });

  const { data: device, isLoading } = useQuery<Device>({
    queryKey: ["device", deviceId],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Device not found");
      return r.json() as Promise<Device>;
    },
    refetchInterval: 30_000,
  });

  const { data: logs = [] } = useQuery<LogEntry[]>({
    queryKey: ["device-logs", deviceId],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}/logs`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json() as Promise<LogEntry[]>;
    },
    enabled: activeTab === "logs",
    refetchInterval: 60_000,
  });

  const [logLevelFilter, setLogLevelFilter] = useState<LogLevel | "ALL">("ALL");

  const { data: diagLogs = [] } = useQuery<LogEntry[]>({
    queryKey: ["device-diag-logs", deviceId, logLevelFilter],
    queryFn: async () => {
      const qs = new URLSearchParams({ count: "300" });
      if (logLevelFilter !== "ALL") qs.set("level", logLevelFilter);
      const r = await fetch(`${BASE}api/devices/${deviceId}/logs?${qs}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json() as Promise<LogEntry[]>;
    },
    enabled: activeTab === "diagnostics",
    refetchInterval: 30_000,
  });

  const { data: diagnostics } = useQuery<Diagnostics>({
    queryKey: ["device-diagnostics", deviceId],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}/diagnostics`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load diagnostics");
      return r.json() as Promise<Diagnostics>;
    },
    enabled: activeTab === "diagnostics",
    refetchInterval: 30_000,
  });

  const { data: firmwareHistory = [] } = useQuery<FirmwareHistoryEntry[]>({
    queryKey: ["device-firmware-history", deviceId],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}/firmware-history`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json() as Promise<FirmwareHistoryEntry[]>;
    },
    enabled: activeTab === "diagnostics",
  });

  const { data: polledReading } = useQuery<Reading | null>({
    queryKey: ["device-readings", deviceId],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}/readings?limit=1`, { credentials: "include" });
      if (!r.ok) return null;
      const arr = await r.json() as Reading[];
      return arr[0] ?? null;
    },
    enabled: activeTab === "live-data",
    // Kept as a fallback for the initial paint / if the SSE connection drops;
    // the live stream below is what actually drives real-time updates.
    refetchInterval: 15_000,
  });

  // Real-time push — replaces manual refresh with an always-current reading.
  const deviceStream = useDeviceStream(activeTab === "live-data" ? deviceId : null);

  // Prefer the streamed reading once it's arrived; it's always at least as
  // fresh as the polled one (the stream replays the latest row on connect).
  const latestReading: Reading | null =
    deviceStream.latest ?? polledReading ?? null;

  // Small ring buffer of recent readings to drive the live-appending chart.
  const [readingHistory, setReadingHistory] = useState<
    { ts: string; value: number }[]
  >([]);
  const [chartField, setChartField] = useState<string | null>(null);
  const prevParamsRef = useRef<Record<string, number | string | boolean | null>>({});
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());
  const MAX_HISTORY_POINTS = 200;

  // Reset per-device chart/highlight state when navigating between devices —
  // the route component instance persists across /devices/:id changes.
  useEffect(() => {
    setReadingHistory([]);
    setChartField(null);
    prevParamsRef.current = {};
    setChangedKeys(new Set());
  }, [deviceId]);

  useEffect(() => {
    if (!deviceStream.latest) return;
    const { params } = deviceStream.latest;

    // Track which fields changed since the previous reading, to briefly
    // highlight them in the params grid.
    const prev = prevParamsRef.current;
    const changed = new Set<string>();
    for (const [k, v] of Object.entries(params)) {
      if (prev[k] !== v) changed.add(k);
    }
    prevParamsRef.current = params;
    if (changed.size > 0) {
      setChangedKeys(changed);
      const timer = setTimeout(() => setChangedKeys(new Set()), 1200);
      return () => clearTimeout(timer);
    }
    return;
  }, [deviceStream.latest]);

  useEffect(() => {
    if (!deviceStream.latest) return;
    const { ts, params } = deviceStream.latest;

    // Pick the first numeric field to chart by default, once.
    setChartField((prev) => {
      if (prev && typeof params[prev] === "number") return prev;
      const firstNumeric = Object.entries(params).find(([, v]) => typeof v === "number");
      return firstNumeric ? firstNumeric[0] : prev;
    });

    setReadingHistory((prevHistory) => {
      // Pause appending while the tab is hidden — flush resumes automatically
      // once it's visible again because the stream keeps delivering events.
      if (document.visibilityState === "hidden") return prevHistory;
      if (prevHistory.length > 0 && prevHistory[prevHistory.length - 1]!.ts === ts) {
        return prevHistory;
      }
      const numericField = Object.entries(params).find(([, v]) => typeof v === "number");
      if (!numericField) return prevHistory;
      const next = [...prevHistory, { ts, value: numericField[1] as number }];
      return next.length > MAX_HISTORY_POINTS ? next.slice(next.length - MAX_HISTORY_POINTS) : next;
    });
  }, [deviceStream.latest]);

  // Live/stale/offline indicator: green while events are arriving within
  // ~2x the device's polling interval, amber if it's gone quiet, grey if
  // there's no stream connection at all.
  const pollingIntervalMs = (device?.config.pollingIntervalSec ?? 30) * 1000;
  const staleThresholdMs = Math.max(pollingIntervalMs * 2, 10_000);
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 2_000);
    return () => clearInterval(t);
  }, []);
  const msSinceLastEvent = deviceStream.lastEventAt
    ? Date.now() - deviceStream.lastEventAt.getTime()
    : null;
  const streamHealth: "live" | "stale" | "offline" =
    !deviceStream.connected || msSinceLastEvent === null
      ? "offline"
      : msSinceLastEvent > staleThresholdMs
        ? "stale"
        : "live";

  async function runConnectionTest() {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const r = await fetch(`${BASE}api/devices/${deviceId}/connection-test`, { credentials: "include" });
      const result = await r.json() as ConnectionTestResult;
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, latencyMs: 0, error: "Network error" });
    } finally {
      setTestingConnection(false);
    }
  }

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await fetch(`${BASE}api/devices/${deviceId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed to update config");
      return r.json() as Promise<Device>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["device", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      setEditing(false);
      toast({ title: "Config updated", description: "Changes saved — pending deployment to device." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const restartMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}/restart`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error("Restart failed");
      return r.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["device", deviceId] });
      toast({ title: "Restart sent", description: "Restart command dispatched to device." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}/sync`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error("Sync failed");
      return r.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["device", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast({ title: "Config synced", description: "Device acknowledged the configuration." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function startEdit(d: Device) {
    setConfigForm({
      pollingIntervalSec:   String(d.config.pollingIntervalSec ?? 30),
      gatewayId:            d.gatewayId ?? "",
      // Modbus TCP
      ipAddress:            d.config.ipAddress ?? "",
      port:                 String(d.config.port ?? ""),
      modbusUnitId:         String(d.config.modbusUnitId ?? ""),
      // MQTT
      brokerUrl:            d.config.brokerUrl ?? "",
      topic:                d.config.topic ?? "",
      // HTTP / WebSocket / OPC-UA
      url:                  d.config.url ?? "",
      // HTTP / WebSocket auth (value never returned from API — user must re-enter to change)
      httpAuthMethod:       d.config.httpAuthMethod ?? "none",
      httpAuthValue:        "",
      httpApiKeyHeader:     d.config.httpApiKeyHeader ?? "X-API-Key",
      // Modbus RTU
      serialPort:           d.config.serialPort ?? "",
      baudRate:             String(d.config.baudRate ?? "9600"),
      parity:               d.config.parity ?? "none",
      dataBits:             String(d.config.dataBits ?? "8"),
      stopBits:             String(d.config.stopBits ?? "1"),
      // OPC-UA
      opcuaSecurityMode:    d.config.opcuaSecurityMode ?? "None",
      opcuaUsername:        d.config.opcuaUsername ?? "",
      opcuaPassword:        "",
      // BACnet/IP
      bacnetDeviceInstance: String(d.config.bacnetDeviceInstance ?? ""),
    });
    setEditing(true);
  }

  function saveEdit(d: Device) {
    if (!configForm) return;
    const body: Record<string, unknown> = {
      pollingIntervalSec: Number(configForm.pollingIntervalSec) || 30,
      gatewayId: configForm.gatewayId || null,
    };
    const p = d.protocol;
    if (p === "modbus" || p === "modbus_tcp") {
      if (configForm.ipAddress)    body.ipAddress    = configForm.ipAddress;
      if (configForm.port)         body.port         = Number(configForm.port);
      if (configForm.modbusUnitId) body.modbusUnitId = Number(configForm.modbusUnitId);
    } else if (p === "modbus_rtu") {
      if (configForm.serialPort)   body.serialPort = configForm.serialPort;
      if (configForm.baudRate)     body.baudRate   = Number(configForm.baudRate);
      body.parity   = configForm.parity;
      body.dataBits = Number(configForm.dataBits) || 8;
      body.stopBits = Number(configForm.stopBits) || 1;
      if (configForm.modbusUnitId) body.modbusUnitId = Number(configForm.modbusUnitId);
    } else if (p === "mqtt") {
      if (configForm.brokerUrl) body.brokerUrl = configForm.brokerUrl;
      if (configForm.topic)     body.topic     = configForm.topic;
    } else if (p === "http" || p === "websocket") {
      if (configForm.url) body.url = configForm.url;
      body.httpAuthMethod = configForm.httpAuthMethod;
      if (configForm.httpAuthMethod !== "none" && configForm.httpAuthValue)
        body.httpAuthValue = configForm.httpAuthValue;
      if (configForm.httpAuthMethod === "api_key")
        body.httpApiKeyHeader = configForm.httpApiKeyHeader;
    } else if (p === "opcua") {
      if (configForm.url) body.url = configForm.url;
      body.opcuaSecurityMode = configForm.opcuaSecurityMode;
      if (configForm.opcuaUsername) body.opcuaUsername = configForm.opcuaUsername;
      if (configForm.opcuaPassword) body.opcuaPassword = configForm.opcuaPassword;
    } else if (p === "bacnet") {
      if (configForm.ipAddress)            body.ipAddress            = configForm.ipAddress;
      if (configForm.port)                 body.port                 = Number(configForm.port);
      if (configForm.bacnetDeviceInstance) body.bacnetDeviceInstance = Number(configForm.bacnetDeviceInstance);
    }
    updateMutation.mutate(body);
  }

  async function discoverFields() {
    if (!deviceId) return;
    setSniffLoading(true);
    try {
      const r = await fetch(`${BASE}api/devices/${deviceId}/sniff-fields`, { credentials: "include" });
      const j = await r.json() as { ok?: boolean; fields?: { jsonPath: string; suggestedKey: string; type: string; sample: unknown }[]; message?: string };
      if (r.ok && j.fields) setSniffFields(j.fields);
      else toast({ title: "Discovery failed", description: j.message ?? "Could not fetch fields", variant: "destructive" });
    } catch { toast({ title: "Discovery failed", variant: "destructive" }); }
    finally { setSniffLoading(false); }
  }

  function saveFieldMap() {
    const valid = fieldMapDraft.filter(f => f.key.trim() && f.label.trim());
    updateMutation.mutate({ fieldMap: valid } as Record<string, unknown>);
    setFieldMapEditing(false);
    setSniffFields(null);
  }

  function addDiscoveredField(f: { jsonPath: string; suggestedKey: string; type: string; sample: unknown }) {
    const alreadyAdded = fieldMapDraft.some(d => d.jsonPath === f.jsonPath);
    if (alreadyAdded) return;
    setFieldMapDraft(prev => [...prev, {
      key: f.suggestedKey,
      label: f.suggestedKey.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).trim(),
      unit: "",
      jsonPath: f.jsonPath,
    }]);
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading device…</div>
      </AppLayout>
    );
  }

  if (!device) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/devices")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Devices
          </Button>
          <p className="text-muted-foreground">Device not found.</p>
        </div>
      </AppLayout>
    );
  }

  const uptimePct =
    device.connectivityTimeline.length > 0
      ? Math.round(
          (device.connectivityTimeline.filter((p) => p.status === "online").length /
            device.connectivityTimeline.length) *
            100,
        )
      : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Back + header */}
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/devices")} className="gap-2 -ml-2 mb-3">
            <ArrowLeft className="h-4 w-4" /> Back to Devices
          </Button>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Cpu className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold">{device.name}</h1>
                {device.pendingDeploy && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                    Pending deploy
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {typeLabel(device.type)} · {device.protocol.toUpperCase()} ·{" "}
                {plantsMap[device.plantId] ?? device.plantId}
              </p>
            </div>
            {canManage && (
              <div className="flex gap-2">
                {device.pendingDeploy && (
                  <Button
                    size="sm" variant="outline"
                    className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                    onClick={() => setConfirmSync(true)}
                    disabled={syncMutation.isPending}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {syncMutation.isPending ? "Syncing…" : "Sync Config"}
                  </Button>
                )}
                <Button
                  size="sm" variant="outline"
                  className="gap-2"
                  onClick={() => setConfirmRestart(true)}
                  disabled={restartMutation.isPending}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {restartMutation.isPending ? "Restarting…" : "Restart"}
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="gap-2"
                  onClick={() => void queryClient.invalidateQueries({ queryKey: ["device", deviceId] })}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left — live status panel */}
          <div className="space-y-4">
            {/* Status card */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live Status</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <StatusDot status={device.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last seen</span>
                  <span className="text-sm tabular-nums flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {timeAgo(device.lastSeenAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Health Score</span>
                  <span className={`text-sm font-bold tabular-nums ${
                    (device.healthScore ?? 100) >= 80 ? "text-status-normal"
                      : (device.healthScore ?? 100) >= 50 ? "text-status-warning" : "text-status-fault"
                  }`}>
                    {device.healthScore ?? "—"}{device.healthScore != null && "/100"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Firmware</span>
                  <span className="flex items-center gap-1.5">
                    <code className="text-xs">{device.firmwareVersion}</code>
                    {!device.firmwareUpToDate && (
                      <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400 px-1 py-0">
                        Update available
                      </Badge>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Signal strength */}
            {device.status !== "offline" && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Signal className="h-3.5 w-3.5" /> Signal Strength
                </h3>
                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums">
                    {device.signalStrengthPct}
                    <span className="text-base font-normal text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      device.signalStrengthPct >= 60
                        ? "bg-status-normal"
                        : device.signalStrengthPct >= 30
                          ? "bg-status-warning"
                          : "bg-status-fault"
                    }`}
                    style={{ width: `${device.signalStrengthPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-center">
                  {device.signalStrengthPct >= 70
                    ? "Good signal"
                    : device.signalStrengthPct >= 40
                      ? "Moderate signal"
                      : "Weak signal"}
                </p>
              </div>
            )}

            {/* 24h uptime */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">24h Uptime</h3>
              <div className="text-2xl font-bold tabular-nums">
                {uptimePct}
                <span className="text-sm font-normal text-muted-foreground">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Based on 15-min polling intervals</p>
            </div>
          </div>

          {/* Right — tabs */}
          <div className="lg:col-span-2 space-y-4">
            {/* Tab bar */}
            <div className="flex border-b border-border overflow-x-auto scrollbar-none">
              {(["config", "diagnostics", "logs", "history", "live-data"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors capitalize border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    activeTab === tab
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "live-data" && <Activity className="h-3.5 w-3.5" />}
                  {tab === "history" ? "Connectivity" : tab === "live-data" ? "Live Data" : tab}
                </button>
              ))}
            </div>

            {/* Config tab */}
            {activeTab === "config" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Connection Parameters</h3>
                  {canManage && !editing && (
                    <Button size="sm" variant="outline" onClick={() => startEdit(device)}>
                      Edit Config
                    </Button>
                  )}
                </div>

                {!editing ? (
                  <div className="rounded-lg border border-border overflow-hidden">
                    {[
                      { label: "Protocol",           value: device.protocol.toUpperCase() },
                      { label: "Assigned Gateway",    value: device.gatewayId ? (gateways.find((g) => g.id === device.gatewayId)?.name ?? "Unknown gateway") : "Cloud (direct connection)" },
                      { label: "IP Address",          value: device.config.ipAddress },
                      { label: "Port",                value: device.config.port },
                      { label: "Modbus Unit ID",      value: device.config.modbusUnitId },
                      { label: "Broker URL",          value: device.config.brokerUrl },
                      { label: "Topic",               value: device.config.topic },
                      { label: "Polling Interval",    value: device.config.pollingIntervalSec ? `${device.config.pollingIntervalSec}s` : null },
                    ]
                      .filter((r) => r.value != null)
                      .map(({ label, value }) => (
                        <div key={label} className="flex items-center border-b border-border last:border-0 px-4 py-2.5">
                          <span className="w-40 text-xs text-muted-foreground">{label}</span>
                          <code className="text-sm">{String(value)}</code>
                        </div>
                      ))}
                    {/* HTTP Push — ingest URL always visible so user can always find the token */}
                    {device.protocol === "http_push" && (device.config as Record<string, unknown>)?.ingestToken && (() => {
                      const token = String((device.config as Record<string, unknown>).ingestToken);
                      const url = `${window.location.origin}/api/ingest/${token}`;
                      return (
                        <div className="border-t border-border px-4 py-3 bg-green-500/5 space-y-1.5">
                          <span className="text-xs text-muted-foreground block">Ingest URL — POST here from your device</span>
                          <div className="flex items-center gap-2">
                            <code className="text-xs flex-1 break-all leading-relaxed">{url}</code>
                            <button
                              onClick={() => void navigator.clipboard.writeText(url)}
                              className="flex-shrink-0 text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
                            >Copy</button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border p-4 space-y-4">
                    {configForm && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {device.protocol === "modbus" && (
                            <>
                              <div>
                                <Label>IP Address</Label>
                                <Input className="mt-1" value={configForm.ipAddress}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, ipAddress: e.target.value }))} />
                              </div>
                              <div>
                                <Label>Port</Label>
                                <Input className="mt-1" type="number" value={configForm.port}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, port: e.target.value }))} />
                              </div>
                              <div>
                                <Label>Modbus Unit ID</Label>
                                <Input className="mt-1" type="number" value={configForm.modbusUnitId}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, modbusUnitId: e.target.value }))} />
                              </div>
                            </>
                          )}
                          {device.protocol === "mqtt" && (
                            <>
                              <div className="col-span-1 sm:col-span-2">
                                <Label>Broker URL</Label>
                                <Input className="mt-1" value={configForm.brokerUrl}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, brokerUrl: e.target.value }))} />
                              </div>
                              <div className="col-span-1 sm:col-span-2">
                                <Label>Topic</Label>
                                <Input className="mt-1" value={configForm.topic}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, topic: e.target.value }))} />
                              </div>
                            </>
                          )}
                          {/* ── Modbus RTU fields ── */}
                          {(device.protocol === "modbus_rtu") && (<>
                            <div>
                              <Label>Serial Port</Label>
                              <Input className="mt-1 font-mono text-sm" placeholder="/dev/ttyUSB0" value={configForm.serialPort}
                                onChange={(e) => setConfigForm((f) => f && ({ ...f, serialPort: e.target.value }))} />
                            </div>
                            <div>
                              <Label>Baud Rate</Label>
                              <Select value={configForm.baudRate} onValueChange={(v) => setConfigForm((f) => f && ({ ...f, baudRate: v }))}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["1200","2400","4800","9600","19200","38400","57600","115200"].map((r) => (
                                    <SelectItem key={r} value={r}>{r}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Parity</Label>
                              <Select value={configForm.parity} onValueChange={(v) => setConfigForm((f) => f && ({ ...f, parity: v }))}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  <SelectItem value="even">Even</SelectItem>
                                  <SelectItem value="odd">Odd</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Data Bits</Label>
                              <Select value={configForm.dataBits} onValueChange={(v) => setConfigForm((f) => f && ({ ...f, dataBits: v }))}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["5","6","7","8"].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Stop Bits</Label>
                              <Select value={configForm.stopBits} onValueChange={(v) => setConfigForm((f) => f && ({ ...f, stopBits: v }))}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">1</SelectItem>
                                  <SelectItem value="2">2</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Unit ID</Label>
                              <Input className="mt-1" type="number" min={1} max={247} value={configForm.modbusUnitId}
                                onChange={(e) => setConfigForm((f) => f && ({ ...f, modbusUnitId: e.target.value }))} />
                            </div>
                          </>)}

                          {/* ── HTTP fields ── */}
                          {device.protocol === "http" && (<>
                            <div className="col-span-1 sm:col-span-2">
                              <Label>Endpoint URL</Label>
                              <Input className="mt-1 font-mono text-sm" placeholder="https://api.device.com/readings" value={configForm.url}
                                onChange={(e) => setConfigForm((f) => f && ({ ...f, url: e.target.value }))} />
                            </div>
                            <div>
                              <Label>Authentication</Label>
                              <Select value={configForm.httpAuthMethod} onValueChange={(v) => setConfigForm((f) => f && ({ ...f, httpAuthMethod: v }))}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No auth</SelectItem>
                                  <SelectItem value="bearer">Bearer token</SelectItem>
                                  <SelectItem value="api_key">API key header</SelectItem>
                                  <SelectItem value="basic">Basic (user:pass)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {configForm.httpAuthMethod === "api_key" && (
                              <div>
                                <Label>Header name</Label>
                                <Input className="mt-1" placeholder="X-API-Key" value={configForm.httpApiKeyHeader}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, httpApiKeyHeader: e.target.value }))} />
                              </div>
                            )}
                            {configForm.httpAuthMethod !== "none" && (
                              <div>
                                <Label>{configForm.httpAuthMethod === "api_key" ? "Key value" : configForm.httpAuthMethod === "bearer" ? "Bearer token" : "Credentials (user:pass)"}</Label>
                                <Input type="password" className="mt-1" placeholder={device.config.httpAuthConfigured ? "••••••  (leave blank to keep current)" : "••••••••"} value={configForm.httpAuthValue}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, httpAuthValue: e.target.value }))} />
                              </div>
                            )}
                          </>)}

                          {/* ── WebSocket fields ── */}
                          {device.protocol === "websocket" && (<>
                            <div className="col-span-1 sm:col-span-2">
                              <Label>WebSocket URL</Label>
                              <Input className="mt-1 font-mono text-sm" placeholder="wss://device.example.com:8080/stream" value={configForm.url}
                                onChange={(e) => setConfigForm((f) => f && ({ ...f, url: e.target.value }))} />
                            </div>
                            <div>
                              <Label>Authentication</Label>
                              <Select value={configForm.httpAuthMethod} onValueChange={(v) => setConfigForm((f) => f && ({ ...f, httpAuthMethod: v }))}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No auth</SelectItem>
                                  <SelectItem value="bearer">Bearer token</SelectItem>
                                  <SelectItem value="api_key">API key header</SelectItem>
                                  <SelectItem value="basic">Basic (user:pass)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {configForm.httpAuthMethod === "api_key" && (
                              <div>
                                <Label>Header name</Label>
                                <Input className="mt-1" placeholder="X-API-Key" value={configForm.httpApiKeyHeader}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, httpApiKeyHeader: e.target.value }))} />
                              </div>
                            )}
                            {configForm.httpAuthMethod !== "none" && (
                              <div>
                                <Label>{configForm.httpAuthMethod === "api_key" ? "Key value" : configForm.httpAuthMethod === "bearer" ? "Bearer token" : "Credentials (user:pass)"}</Label>
                                <Input type="password" className="mt-1" placeholder={device.config.httpAuthConfigured ? "•••••• (leave blank to keep current)" : "••••••••"} value={configForm.httpAuthValue}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, httpAuthValue: e.target.value }))} />
                              </div>
                            )}
                          </>)}

                          {/* ── OPC-UA fields ── */}
                          {device.protocol === "opcua" && (<>
                            <div className="col-span-1 sm:col-span-2">
                              <Label>Endpoint URL</Label>
                              <Input className="mt-1 font-mono text-sm" placeholder="opc.tcp://192.168.1.20:4840" value={configForm.url}
                                onChange={(e) => setConfigForm((f) => f && ({ ...f, url: e.target.value }))} />
                            </div>
                            <div>
                              <Label>Security Mode</Label>
                              <Select value={configForm.opcuaSecurityMode} onValueChange={(v) => setConfigForm((f) => f && ({ ...f, opcuaSecurityMode: v }))}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="None">None</SelectItem>
                                  <SelectItem value="Sign">Sign</SelectItem>
                                  <SelectItem value="SignAndEncrypt">Sign &amp; Encrypt</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Username</Label>
                              <Input className="mt-1" placeholder="optional" value={configForm.opcuaUsername}
                                onChange={(e) => setConfigForm((f) => f && ({ ...f, opcuaUsername: e.target.value }))} />
                            </div>
                            <div>
                              <Label>Password</Label>
                              <Input type="password" className="mt-1" placeholder={device.config.opcuaPasswordConfigured ? "•••••• (leave blank to keep current)" : "optional"} value={configForm.opcuaPassword}
                                onChange={(e) => setConfigForm((f) => f && ({ ...f, opcuaPassword: e.target.value }))} />
                            </div>
                          </>)}

                          {/* ── BACnet/IP fields ── */}
                          {device.protocol === "bacnet" && (<>
                            <div>
                              <Label>IP Address</Label>
                              <Input className="mt-1 font-mono text-sm" placeholder="192.168.1.40" value={configForm.ipAddress}
                                onChange={(e) => setConfigForm((f) => f && ({ ...f, ipAddress: e.target.value }))} />
                            </div>
                            <div>
                              <Label>UDP Port</Label>
                              <Input className="mt-1" type="number" placeholder="47808" value={configForm.port}
                                onChange={(e) => setConfigForm((f) => f && ({ ...f, port: e.target.value }))} />
                            </div>
                            <div>
                              <Label>Device Instance</Label>
                              <Input className="mt-1" type="number" min={0} max={4194302} placeholder="1001" value={configForm.bacnetDeviceInstance}
                                onChange={(e) => setConfigForm((f) => f && ({ ...f, bacnetDeviceInstance: e.target.value }))} />
                            </div>
                          </>)}

                          {/* ── Polling interval (not for event-driven protocols) ── */}
                          {!["mqtt","websocket"].includes(device.protocol) && (
                            <div>
                              <Label>Polling Interval (seconds)</Label>
                              <Input className="mt-1" type="number" min={5} max={3600} value={configForm.pollingIntervalSec}
                                onChange={(e) => setConfigForm((f) => f && ({ ...f, pollingIntervalSec: e.target.value }))} />
                            </div>
                          )}
                          <div className="col-span-1 sm:col-span-2">
                            <Label>Assigned Gateway <span className="text-muted-foreground font-normal">(leave unset to poll directly from the cloud)</span></Label>
                            <Select
                              value={configForm.gatewayId || "none"}
                              onValueChange={(v) => setConfigForm((f) => f && ({ ...f, gatewayId: v === "none" ? "" : v }))}
                            >
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Cloud (direct connection)</SelectItem>
                                {gateways.filter((g) => !g.revokedAt).map((g) => (
                                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" onClick={() => saveEdit(device)} disabled={updateMutation.isPending} className="gap-2">
                            <Save className="h-3.5 w-3.5" />
                            {updateMutation.isPending ? "Saving…" : "Save Changes"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                        </div>
                        <p className="text-xs text-amber-400 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
                          Saving will mark config as pending deploy until synced to the device
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* ── Field Mappings section ───────────────────────────── */}
                {(device.protocol === "http" || device.protocol === "mqtt" || device.protocol === "websocket") && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">Field Mappings</h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Map JSON response fields to named parameters.{" "}
                          {!device.config.fieldMap?.length && !device.template?.fieldMap.length &&
                            "Currently in raw passthrough mode — all scalar values are auto-extracted."}
                        </p>
                      </div>
                      {canManage && !fieldMapEditing && (
                        <Button size="sm" variant="outline" onClick={() => {
                          setFieldMapDraft(device.config.fieldMap?.length
                            ? device.config.fieldMap
                            : (device.template?.fieldMap ?? []));
                          setFieldMapEditing(true);
                        }}>
                          Edit Mappings
                        </Button>
                      )}
                    </div>

                    {!fieldMapEditing ? (
                      /* ── View mode ── */
                      (() => {
                        const fm = device.config.fieldMap?.length ? device.config.fieldMap : device.template?.fieldMap ?? [];
                        return fm.length > 0 ? (
                          <div className="rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/30">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Key</th>
                                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Label</th>
                                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Unit</th>
                                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">JSON Path</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fm.map((f, i) => (
                                  <tr key={i} className="border-t border-border">
                                    <td className="px-3 py-2 font-mono text-primary">{f.key}</td>
                                    <td className="px-3 py-2">{f.label}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{f.unit || "—"}</td>
                                    <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[200px]">{f.jsonPath ?? `$.${f.key}`}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                            No explicit mappings — all numeric/string values are auto-extracted from the response.
                          </div>
                        );
                      })()
                    ) : (
                      /* ── Edit mode ── */
                      <div className="rounded-lg border border-border p-4 space-y-4">
                        {/* Discover button */}
                        {device.config.url && (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void discoverFields()} disabled={sniffLoading}>
                              {sniffLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                              {sniffLoading ? "Fetching…" : "Discover Available Fields"}
                            </Button>
                            <span className="text-[11px] text-muted-foreground">Fetches the endpoint and lists all extractable values</span>
                          </div>
                        )}

                        {/* Discovered fields panel */}
                        {sniffFields && (
                          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                            <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                              <Wand2 className="h-3.5 w-3.5" />
                              {sniffFields.length} fields discovered — click to add
                            </p>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {sniffFields.map((f, i) => {
                                const added = fieldMapDraft.some(d => d.jsonPath === f.jsonPath);
                                return (
                                  <button key={i} onClick={() => addDiscoveredField(f)} disabled={added}
                                    className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded text-xs transition-colors ${
                                      added ? "opacity-40 cursor-not-allowed" : "hover:bg-primary/10 cursor-pointer"
                                    }`}
                                  >
                                    {f.type === "number" ? <Hash className="h-3 w-3 text-blue-400 shrink-0" /> : <Type className="h-3 w-3 text-green-400 shrink-0" />}
                                    <code className="text-muted-foreground font-mono flex-1 truncate">{f.jsonPath}</code>
                                    <span className="text-muted-foreground shrink-0 tabular-nums">
                                      {String(f.sample).slice(0, 18)}{String(f.sample).length > 18 ? "…" : ""}
                                    </span>
                                    {added && <CheckCircle2 className="h-3 w-3 text-status-normal shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Field map table editor */}
                        {fieldMapDraft.length > 0 && (
                          <div className="rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/30">
                                <tr>
                                  <th className="px-2 py-2 text-left font-medium text-muted-foreground w-28">Key *</th>
                                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Label *</th>
                                  <th className="px-2 py-2 text-left font-medium text-muted-foreground w-20">Unit</th>
                                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">JSON Path (e.g. $.data.data[0].value)</th>
                                  <th className="px-2 py-2 w-8" />
                                </tr>
                              </thead>
                              <tbody>
                                {fieldMapDraft.map((f, i) => (
                                  <tr key={i} className="border-t border-border">
                                    <td className="px-2 py-1">
                                      <input className="w-full bg-transparent border border-border rounded px-1.5 py-1 font-mono text-primary focus:outline-none focus:border-primary/60"
                                        value={f.key} placeholder="acPowerKw"
                                        onChange={e => setFieldMapDraft(d => d.map((x,j) => j===i ? {...x,key:e.target.value} : x))} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <input className="w-full bg-transparent border border-border rounded px-1.5 py-1 focus:outline-none focus:border-primary/60"
                                        value={f.label} placeholder="AC Power"
                                        onChange={e => setFieldMapDraft(d => d.map((x,j) => j===i ? {...x,label:e.target.value} : x))} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <input className="w-full bg-transparent border border-border rounded px-1.5 py-1 focus:outline-none focus:border-primary/60"
                                        value={f.unit} placeholder="kW"
                                        onChange={e => setFieldMapDraft(d => d.map((x,j) => j===i ? {...x,unit:e.target.value} : x))} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <input className="w-full bg-transparent border border-border rounded px-1.5 py-1 font-mono focus:outline-none focus:border-primary/60"
                                        value={f.jsonPath ?? ""} placeholder="$.data.power"
                                        onChange={e => setFieldMapDraft(d => d.map((x,j) => j===i ? {...x,jsonPath:e.target.value||undefined} : x))} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <button onClick={() => setFieldMapDraft(d => d.filter((_,j) => j!==i))}
                                        className="text-muted-foreground hover:text-destructive transition-colors">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div className="flex items-center gap-2 flex-wrap">
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() =>
                            setFieldMapDraft(d => [...d, { key: "", label: "", unit: "", jsonPath: "" }])
                          }>
                            <Plus className="h-3.5 w-3.5" /> Add Row
                          </Button>
                          {fieldMapDraft.length > 0 && (
                            <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:bg-destructive/10"
                              onClick={() => setFieldMapDraft([])}>
                              Clear All
                            </Button>
                          )}
                          <div className="flex-1" />
                          <Button size="sm" onClick={saveFieldMap} disabled={updateMutation.isPending}>
                            <Save className="h-3.5 w-3.5 mr-1" />
                            {updateMutation.isPending ? "Saving…" : "Save Mappings"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setFieldMapEditing(false); setSniffFields(null); }}>Cancel</Button>
                        </div>
                        <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
                          Saving will restart the driver immediately to apply the new field map
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Diagnostics tab */}
            {activeTab === "diagnostics" && (
              <div className="space-y-5">
                {!diagnostics ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">Loading diagnostics…</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-border bg-card p-3">
                        <div className="text-xs text-muted-foreground mb-1">Health Score</div>
                        <div className={`text-2xl font-bold tabular-nums ${
                          (diagnostics.healthScore ?? 100) >= 80 ? "text-status-normal"
                            : (diagnostics.healthScore ?? 100) >= 50 ? "text-status-warning" : "text-status-fault"
                        }`}>
                          {diagnostics.healthScore ?? "—"}
                          {diagnostics.healthScore != null && <span className="text-sm font-normal text-muted-foreground">/100</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {diagnostics.dataSource === "live" ? "From last hour of comms" : "Simulated (no driver comms yet)"}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-card p-3">
                        <div className="text-xs text-muted-foreground mb-1">24h Success Rate</div>
                        <div className="text-2xl font-bold tabular-nums">
                          {diagnostics.pollingStats.successRate24h ?? "—"}
                          {diagnostics.pollingStats.successRate24h != null && "%"}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {diagnostics.pollingStats.readingCount24h} ok · {diagnostics.pollingStats.errorCount24h} failed
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-card p-3">
                        <div className="text-xs text-muted-foreground mb-1">Avg RTT</div>
                        <div className="text-2xl font-bold tabular-nums">
                          {diagnostics.pollingStats.avgRttMs ?? "—"}
                          {diagnostics.pollingStats.avgRttMs != null && <span className="text-sm font-normal text-muted-foreground">ms</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Consecutive failures: {diagnostics.consecutiveFailures}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border p-4 space-y-2">
                      <h3 className="text-sm font-semibold">24h Connectivity Timeline</h3>
                      <div className="flex items-center gap-[1px] h-8">
                        {diagnostics.connectivityTimeline.map((b, i) => {
                          const cls = b.status === "online" ? "bg-status-normal"
                            : b.status === "degraded" ? "bg-status-warning"
                            : b.status === "offline" || b.status === "error" ? "bg-status-fault"
                            : "bg-muted-foreground/15";
                          return (
                            <div key={i} title={`${new Date(b.timestamp).toLocaleTimeString()} — ${b.status} (${b.successCount} ok / ${b.failureCount} fail)`}
                              className={`flex-1 h-full rounded-[1px] ${cls}`} />
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>24h ago</span><span>Now</span>
                      </div>
                      <div className="flex gap-4 text-[10px] text-muted-foreground">
                        {[
                          { label: "Online", cls: "bg-status-normal" },
                          { label: "Degraded", cls: "bg-status-warning" },
                          { label: "Offline/Error", cls: "bg-status-fault" },
                          { label: "No data", cls: "bg-muted-foreground/15" },
                        ].map(({ label, cls }) => (
                          <span key={label} className="flex items-center gap-1.5">
                            <span className={`h-2 w-4 rounded-sm ${cls}`} /> {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border p-4">
                      <h3 className="text-sm font-semibold mb-3">Error Breakdown (24h)</h3>
                      <DonutChart
                        centerLabel={String(diagnostics.errorBreakdown.reduce((s, e) => s + e.count, 0))}
                        centerSubLabel="events"
                        slices={diagnostics.errorBreakdown.map((e, i) => ({
                          label: e.category,
                          value: e.count,
                          color: ["hsl(0,72%,55%)", "hsl(38,92%,50%)", "hsl(280,60%,55%)", "hsl(200,70%,50%)", "hsl(var(--muted-foreground))"][i % 5]!,
                        }))}
                      />
                    </div>

                    {firmwareHistory.length > 0 && (
                      <div className="rounded-lg border border-border p-4 space-y-2">
                        <h3 className="text-sm font-semibold">Firmware History</h3>
                        <div className="space-y-1.5">
                          {firmwareHistory.map((h) => (
                            <div key={h.id} className="flex items-center justify-between text-xs border-b border-border/50 last:border-0 py-1.5">
                              <span className="font-mono">
                                {h.previousVersion ? `${h.previousVersion} → ` : ""}<strong>{h.newVersion}</strong>
                              </span>
                              <span className="text-muted-foreground">{new Date(h.detectedAt).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                        <h3 className="text-sm font-semibold">Comm Log</h3>
                        <div className="flex gap-1">
                          {(["ALL", "INFO", "WARN", "ERROR"] as const).map((lvl) => (
                            <button
                              key={lvl}
                              onClick={() => setLogLevelFilter(lvl)}
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                logLevelFilter === lvl ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {lvl}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="overflow-y-auto max-h-[360px] font-mono text-xs">
                        <table className="w-full">
                          <tbody>
                            {diagLogs.map((entry, i) => (
                              <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                                <td className="px-3 py-1.5 text-muted-foreground tabular-nums whitespace-nowrap">
                                  {new Date(entry.timestamp).toLocaleTimeString()}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap"><LogLevelBadge level={entry.level} /></td>
                                <td className="px-3 py-1.5 text-foreground/80">{entry.message}</td>
                              </tr>
                            ))}
                            {diagLogs.length === 0 && (
                              <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No log entries match this filter</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Logs tab */}
            {activeTab === "logs" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Device Log — Last 100 Entries</h3>
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                    onClick={() => void queryClient.invalidateQueries({ queryKey: ["device-logs", deviceId] })}>
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </Button>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="overflow-y-auto max-h-[420px] font-mono text-xs">
                    <table className="w-full">
                      <tbody>
                        {[...logs].reverse().map((entry, i) => (
                          <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                            <td className="px-3 py-1.5 text-muted-foreground tabular-nums whitespace-nowrap">
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <LogLevelBadge level={entry.level} />
                            </td>
                            <td className="px-3 py-1.5 text-foreground/80">{entry.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Live Data tab */}
            {activeTab === "live-data" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Live Readings</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {streamHealth === "live"
                        ? "Streaming in real time — no refresh needed"
                        : streamHealth === "stale"
                          ? "Connected, but the device hasn't reported recently"
                          : device.dataSource === "live"
                            ? "Reconnecting to live stream…"
                            : "No live driver readings yet — showing simulated parameters"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {streamHealth === "live" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                        Live
                      </span>
                    ) : streamHealth === "stale" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        Stale
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                        Offline
                      </span>
                    )}
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-7 text-xs"
                        onClick={() => void runConnectionTest()}
                        disabled={testingConnection}
                      >
                        <FlaskConical className="h-3 w-3" />
                        {testingConnection ? "Testing…" : "Test Connection"}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Connection test result */}
                {testResult && (
                  <div className={`rounded-lg border p-3 flex items-start gap-3 text-sm ${
                    testResult.ok
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-red-500/30 bg-red-500/5"
                  }`}>
                    {testResult.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        {testResult.ok ? `Connected — ${testResult.latencyMs}ms RTT` : "Connection failed"}
                      </div>
                      {testResult.error && (
                        <div className="text-xs text-muted-foreground mt-0.5 break-all">{testResult.error}</div>
                      )}
                      {testResult.sampleParams && Object.keys(testResult.sampleParams).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(testResult.sampleParams).slice(0, 6).map(([k, v]) => (
                            <span key={k} className="text-[10px] font-mono bg-muted/30 rounded px-1.5 py-0.5">
                              {k}: <span className="text-foreground">{String(v)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setTestResult(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Template / register map */}
                {device.template && (
                  <div className="rounded-lg border border-border bg-muted/10 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Register map: {device.template.manufacturer} {device.template.model}
                        <span className="ml-2 text-[10px] bg-muted/30 rounded px-1.5 py-0.5">
                          {device.template.fieldMap.length} fields
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {device.template.fieldMap.slice(0, 10).map((f) => (
                        <span key={f.key} className="text-[10px] bg-muted/30 rounded px-1.5 py-0.5 text-muted-foreground">
                          {f.label}{f.unit ? ` (${f.unit})` : ""}
                        </span>
                      ))}
                      {device.template.fieldMap.length > 10 && (
                        <span className="text-[10px] text-muted-foreground">+{device.template.fieldMap.length - 10} more</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Latest reading params grid */}
                {latestReading ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Last reading: {new Date(latestReading.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(latestReading.params).map(([key, value]) => {
                        const fieldDef = device.template?.fieldMap.find((f) => f.key === key);
                        const justChanged = changedKeys.has(key);
                        return (
                          <div
                            key={key}
                            className={`rounded-lg border p-3 transition-colors duration-700 ${
                              justChanged ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                            }`}
                          >
                            <div className="text-xs text-muted-foreground mb-0.5">{fieldDef?.label ?? key}</div>
                            <div className="font-semibold text-sm tabular-nums">
                              {typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value ?? "—")}
                              {fieldDef?.unit && <span className="text-xs font-normal text-muted-foreground ml-1">{fieldDef.unit}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {chartField && readingHistory.length >= 2 && (
                      <div className="rounded-lg border border-border bg-card p-3">
                        <div className="text-xs text-muted-foreground mb-1">
                          {device.template?.fieldMap.find((f) => f.key === chartField)?.label ?? chartField} — live trend
                        </div>
                        <MiniLineChart
                          color="hsl(var(--primary))"
                          points={readingHistory.map((p) => ({
                            label: new Date(p.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                            value: p.value,
                          }))}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center">
                    <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                    <p className="text-sm text-muted-foreground">No readings recorded yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {device.dataSource === "simulated"
                        ? "Once a real device connects and sends data, readings will appear here."
                        : "Waiting for the first poll cycle to complete."}
                    </p>
                  </div>
                )}

                {/* CSV Import */}
                {canManage && (
                  <div className="rounded-lg border border-border bg-muted/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Import Historical Readings</span>
                      <span className="text-xs text-muted-foreground ml-auto">CSV only · max 10 MB</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Upload a CSV with a <code className="bg-muted px-1 rounded">timestamp</code> column and one column per parameter.
                      Existing readings for the same timestamps are skipped.
                    </p>

                    {importResult && (
                      <div className="flex items-center gap-2 text-xs bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                        <span>
                          Imported <strong>{importResult.imported}</strong> rows
                          {importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ""}
                          {" "}· columns: {importResult.columns.join(", ")}
                        </span>
                        <button className="ml-auto text-muted-foreground hover:text-foreground"
                          onClick={() => setImportResult(null)}><X className="h-3 w-3" /></button>
                      </div>
                    )}
                    {importError && (
                      <div className="flex items-center gap-2 text-xs bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                        <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        <span>{importError}</span>
                        <button className="ml-auto text-muted-foreground hover:text-foreground"
                          onClick={() => setImportError(null)}><X className="h-3 w-3" /></button>
                      </div>
                    )}

                    <input
                      ref={csvFileRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setImportResult(null);
                        setImportError(null);
                        try {
                          const text = await file.text();
                          const r = await fetch(`${BASE}api/devices/${deviceId}/import-readings`, {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "text/csv" },
                            body: text,
                          });
                          if (!r.ok) {
                            const err = await r.json() as { message?: string };
                            throw new Error(err.message ?? "Import failed");
                          }
                          const data = await r.json() as { imported: number; skipped: number; columns: string[] };
                          setImportResult(data);
                          void queryClient.invalidateQueries({ queryKey: ["device-readings", deviceId] });
                        } catch (err) {
                          setImportError(err instanceof Error ? err.message : "Import failed");
                        } finally {
                          if (csvFileRef.current) csvFileRef.current.value = "";
                        }
                      }}
                    />
                    <Button
                      variant="outline" size="sm" className="gap-2"
                      onClick={() => csvFileRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" /> Choose CSV File
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* History tab */}
            {activeTab === "history" && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">24h Connectivity Timeline</h3>
                <div className="rounded-lg border border-border p-4">
                  <ConnectivityTimeline points={device.connectivityTimeline} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    {
                      label: "Online",
                      count: device.connectivityTimeline.filter((p) => p.status === "online").length,
                      total: device.connectivityTimeline.length,
                      cls: "text-status-normal",
                    },
                    {
                      label: "Offline",
                      count: device.connectivityTimeline.filter((p) => p.status === "offline").length,
                      total: device.connectivityTimeline.length,
                      cls: "text-muted-foreground",
                    },
                    {
                      label: "Error",
                      count: device.connectivityTimeline.filter((p) => p.status === "error").length,
                      total: device.connectivityTimeline.length,
                      cls: "text-status-fault",
                    },
                  ].map(({ label, count, total, cls }) => (
                    <div key={label} className="rounded-lg border border-border p-3 text-center">
                      <div className={`text-xl font-bold tabular-nums ${cls}`}>
                        {total > 0 ? Math.round((count / total) * 100) : 0}%
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                      <div className="text-[10px] text-muted-foreground">{count} of {total} intervals</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Restart confirm dialog */}
      <AlertDialog open={confirmRestart} onOpenChange={setConfirmRestart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a restart command to <strong>{device.name}</strong>. The device will
              briefly go offline during the reboot cycle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { restartMutation.mutate(); setConfirmRestart(false); }}>
              Restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sync confirm dialog */}
      <AlertDialog open={confirmSync} onOpenChange={setConfirmSync}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sync config to device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will push the pending configuration to <strong>{device.name}</strong> and clear
              the "Pending deploy" flag. Confirm only after the device has received the new settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { syncMutation.mutate(); setConfirmSync(false); }}>
              Sync Config
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
