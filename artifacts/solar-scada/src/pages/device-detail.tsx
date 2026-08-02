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
  Info,
  BarChart2,
  Settings,
  Table2,
  ChevronUp,
  ChevronDown,
  Stethoscope,
  ShieldAlert,
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
import { MiniLineChart } from "@/components/ui/svg-charts";

const BASE = import.meta.env.BASE_URL;

type DeviceStatus = "online" | "offline" | "error";

interface FieldDef {
  key: string;
  label: string;
  unit: string;
  jsonPath?: string;
  multiplier?: number;
  offset?: number;
  registerName?: string;
  encoding?: string;
}

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
    httpAuthMethod: string | null;
    httpApiKeyHeader: string | null;
    httpAuthConfigured: boolean;
    serialPort: string | null;
    baudRate: number | null;
    parity: string | null;
    dataBits: number | null;
    stopBits: number | null;
    opcuaSecurityMode: string | null;
    opcuaUsername: string | null;
    opcuaPasswordConfigured: boolean;
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

// ── Utility ───────────────────────────────────────────────────────────────────

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtValue(v: number | string | boolean | null | undefined, decimals = 2): string {
  if (v == null) return "--";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: decimals });
  return String(v);
}

// ── ParamCell ─────────────────────────────────────────────────────────────────
function ParamCell({
  label, value, unit, highlight = false, live = false, loading = false,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  highlight?: boolean;
  live?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3.5 border-b border-r border-border/40 last:border-r-0">
      <span className="text-[10px] text-muted-foreground leading-tight truncate">{label}</span>
      <div className="flex items-baseline gap-1.5 min-h-[1.5rem]">
        {loading ? (
          <div className="h-5 w-20 bg-muted/40 rounded animate-pulse" />
        ) : (
          <>
            <span className={`text-sm font-semibold tabular-nums ${highlight ? "text-emerald-400" : "text-foreground"}`}>
              {value ?? "--"}
            </span>
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
            {live && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
function SectionHeader({
  title, collapsible = false, open = true, onToggle,
}: {
  title: string; collapsible?: boolean; open?: boolean; onToggle?: () => void;
}) {
  return (
    <button
      className={`w-full flex items-center justify-between px-4 py-2.5 bg-muted/20 border-b border-border/40 ${collapsible ? "cursor-pointer hover:bg-muted/30 transition-colors" : "cursor-default"}`}
      onClick={collapsible ? onToggle : undefined}
    >
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
      {collapsible && (open
        ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function TabBtn({
  active, onClick, icon: Icon, children,
}: {
  active: boolean; onClick: () => void; icon: React.FC<{ className?: string }>; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-all -mb-px ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  );
}

type TabId = "general" | "raw-registers" | "curve" | "diagnostics" | "settings";

// ── Diagnostics types ─────────────────────────────────────────────────────────
interface DiagnosticsData {
  deviceId: string;
  healthScore: number | null;
  consecutiveFailures: number;
  dataSource: "live" | "simulated";
  connectivityTimeline: { timestamp: string; status: string; successCount: number; failureCount: number }[];
  pollingStats: {
    readingCount24h: number;
    errorCount24h: number;
    successRate24h: number | null;
    avgRttMs: number | null;
    lastRttMs: number | null;
    lastReadingAt: string | Date | null;
    driverStatus: string;
  };
  errorBreakdown: { category: string; count: number }[];
}

interface CommLogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  eventType: string | null;
  registerAddr: number | null;
  rttMs: number | null;
}

// ── ConnectivityTimeline (SVG) ────────────────────────────────────────────────
function ConnectivityTimeline({ buckets }: { buckets: { timestamp: string; status: string; successCount: number; failureCount: number }[] }) {
  const W = 720; const H = 36; const gap = 1;
  const n = buckets.length;
  const barW = Math.max(1, (W - gap * (n - 1)) / n);
  const colorOf = (s: string) =>
    s === "online" ? "#34d399" : s === "degraded" ? "#fbbf24" : s === "offline" || s === "error" ? "#f87171" : "#374151";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {buckets.map((b, i) => (
        <rect
          key={i}
          x={i * (barW + gap)}
          y={0}
          width={barW}
          height={H}
          fill={colorOf(b.status)}
          opacity={b.status === "no_data" ? 0.15 : 0.85}
        >
          <title>{new Date(b.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — {b.status}{b.successCount + b.failureCount > 0 ? ` (${b.successCount}✓ ${b.failureCount}✗)` : ""}</title>
        </rect>
      ))}
    </svg>
  );
}

// ── ErrorDonut (SVG) ──────────────────────────────────────────────────────────
const DONUT_COLORS = ["#f87171", "#fbbf24", "#60a5fa", "#a78bfa", "#34d399"];
function ErrorDonut({ breakdown }: { breakdown: { category: string; count: number }[] }) {
  const total = breakdown.reduce((s, b) => s + b.count, 0);
  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-6">
        <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2 opacity-70" />
        <p className="text-xs">No errors in 24h</p>
      </div>
    );
  }
  const R = 40; const cx = 56; const cy = 56;

  // Use stroke-based donut to avoid SVG arc degenerate case (start==end when sweep=2π)
  // Each segment = circle with stroke-dasharray sliced by dashoffset rotation.
  const circumference = 2 * Math.PI * R;
  let cumulative = 0;
  const segments = breakdown.map((b, i) => {
    const fraction = b.count / total;
    const dashLen = fraction * circumference;
    // Rotate so this segment starts where the last ended; start from top (-90°)
    const rotateDeg = (cumulative / total) * 360 - 90;
    cumulative += b.count;
    return { dashLen, circumference, rotateDeg, color: DONUT_COLORS[i % DONUT_COLORS.length]!, category: b.category, count: b.count };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 112 112" style={{ width: 88, height: 88, flexShrink: 0 }}>
        {/* Background ring */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="hsl(var(--border))" strokeWidth={20} opacity={0.2} />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={20}
            strokeDasharray={`${s.dashLen} ${s.circumference - s.dashLen}`}
            strokeDashoffset={0}
            transform={`rotate(${s.rotateDeg} ${cx} ${cy})`}
            opacity={0.85}
          >
            <title>{s.category}: {s.count}</title>
          </circle>
        ))}
        {/* Center hole label */}
        <circle cx={cx} cy={cy} r={22} fill="hsl(var(--card))" />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" className="fill-foreground" style={{ fontSize: 13, fontWeight: 700 }}>{total}</text>
        <text x={cx} y={cy + 13} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 7, fill: "hsl(var(--muted-foreground))" }}>errors</text>
      </svg>
      <div className="space-y-1.5 min-w-0">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="text-muted-foreground truncate">{s.category}</span>
            <span className="ml-auto font-semibold tabular-nums text-foreground pl-2">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section groupings for General Information ─────────────────────────────────
const SECTION_KEYS: { title: string; keys: string[] }[] = [
  {
    title: "AC Grid",
    keys: ["acVoltageV", "acVoltageBcV", "acVoltageCaV", "acCurrentA", "acCurrentBA", "acCurrentCA", "frequencyHz", "powerFactor"],
  },
  {
    title: "Power",
    keys: ["actPowerKw", "meterPowerKw", "phaseAPowerKw", "phaseBPowerKw"],
  },
  {
    title: "DC Strings",
    keys: ["string1CurrentA", "string2CurrentA", "string3CurrentA", "string4CurrentA", "string5CurrentA", "string6CurrentA"],
  },
  {
    title: "MPPT",
    keys: ["mppt1VoltageV", "mppt1CurrentA", "mppt2VoltageV", "mppt2CurrentA"],
  },
  {
    title: "Energy",
    keys: ["energyTodayKwh", "energyLifetimeMwh"],
  },
  {
    title: "Thermal & Faults",
    keys: ["temperatureC", "faultCode", "faultAlarm", "alarmCode"],
  },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DeviceDetailPage() {
  const [, params] = useRoute("/devices/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("device.manage") ?? false;

  const deviceId = params?.id ?? "";
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirmSync, setConfirmSync] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  // Collapsible section state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggleSection = (title: string) =>
    setOpenSections((prev) => ({ ...prev, [title]: !(prev[title] ?? true) }));
  const isSectionOpen = (title: string) => openSections[title] ?? true;

  // Diagnostics log level filter
  const [logLevel, setLogLevel] = useState<"ALL" | "INFO" | "WARN" | "ERROR">("ALL");

  // CSV import state
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; columns: string[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Config edit state
  const [editing, setEditing] = useState(false);
  const [configForm, setConfigForm] = useState<{
    pollingIntervalSec: string; gatewayId: string;
    ipAddress: string; port: string; modbusUnitId: string;
    brokerUrl: string; topic: string;
    url: string;
    httpAuthMethod: string; httpAuthValue: string; httpApiKeyHeader: string;
    serialPort: string; baudRate: string; parity: string; dataBits: string; stopBits: string;
    opcuaSecurityMode: string; opcuaUsername: string; opcuaPassword: string;
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

  const { data: plantsMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["plants-name-map"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/plants`, { credentials: "include" });
      if (!r.ok) return {};
      const arr = await r.json() as { id: string; name: string }[];
      return Object.fromEntries(arr.map((p) => [p.id, p.name]));
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

  const { data: diagnostics, isLoading: diagLoading } = useQuery<DiagnosticsData>({
    queryKey: ["device-diagnostics", deviceId],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}/diagnostics`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load diagnostics");
      return r.json() as Promise<DiagnosticsData>;
    },
    enabled: activeTab === "diagnostics",
    refetchInterval: activeTab === "diagnostics" ? 30_000 : false,
  });

  const { data: commLogs = [], isLoading: logsLoading, isError: logsError } = useQuery<CommLogEntry[]>({
    queryKey: ["device-logs", deviceId, logLevel],
    queryFn: async () => {
      const params = new URLSearchParams({ count: "200" });
      if (logLevel !== "ALL") params.set("level", logLevel);
      const r = await fetch(`${BASE}api/devices/${deviceId}/logs?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to load comm logs (${r.status})`);
      return r.json() as Promise<CommLogEntry[]>;
    },
    enabled: activeTab === "diagnostics",
    refetchInterval: activeTab === "diagnostics" ? 30_000 : false,
  });

  const { data: polledReading } = useQuery<Reading | null>({
    queryKey: ["device-readings", deviceId],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}/readings?limit=1`, { credentials: "include" });
      if (!r.ok) return null;
      const arr = await r.json() as Reading[];
      return arr[0] ?? null;
    },
    enabled: activeTab === "general" || activeTab === "raw-registers" || activeTab === "curve",
    refetchInterval: 15_000,
  });

  // Real-time SSE push
  const deviceStream = useDeviceStream(
    activeTab === "general" || activeTab === "raw-registers" || activeTab === "curve" ? deviceId : null,
  );

  const latestReading: Reading | null = deviceStream.latest ?? polledReading ?? null;

  // Reading history ring buffer for curve tab — stores all numeric params per tick
  const [readingHistory, setReadingHistory] = useState<{ ts: string; nums: Record<string, number> }[]>([]);
  const [chartField, setChartField] = useState<string | null>(null);
  const prevParamsRef = useRef<Record<string, number | string | boolean | null>>({});
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());
  const MAX_HISTORY_POINTS = 200;

  useEffect(() => {
    setReadingHistory([]);
    setChartField(null);
    prevParamsRef.current = {};
    setChangedKeys(new Set());
  }, [deviceId]);

  useEffect(() => {
    if (!deviceStream.latest) return;
    const { params } = deviceStream.latest;
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

    // Pick a default field (first numeric) once; keep user selection if still numeric
    setChartField((prev) => {
      if (prev && typeof params[prev] === "number") return prev;
      const firstNumeric = Object.entries(params).find(([, v]) => typeof v === "number");
      return firstNumeric ? firstNumeric[0] : prev;
    });

    setReadingHistory((prevHistory) => {
      if (document.visibilityState === "hidden") return prevHistory;
      if (prevHistory.length > 0 && prevHistory[prevHistory.length - 1]!.ts === ts) return prevHistory;
      // Collect ALL numeric values from this reading so any field can be charted
      const nums: Record<string, number> = {};
      for (const [k, v] of Object.entries(params)) {
        if (typeof v === "number") nums[k] = v;
      }
      if (Object.keys(nums).length === 0) return prevHistory;
      const next = [...prevHistory, { ts, nums }];
      return next.length > MAX_HISTORY_POINTS ? next.slice(next.length - MAX_HISTORY_POINTS) : next;
    });
  }, [deviceStream.latest]);

  // Stream health
  const pollingIntervalMs = (device?.config.pollingIntervalSec ?? 30) * 1000;
  const staleThresholdMs = Math.max(pollingIntervalMs * 2, 10_000);
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 2_000);
    return () => clearInterval(t);
  }, []);
  const msSinceLastEvent = deviceStream.lastEventAt ? Date.now() - deviceStream.lastEventAt.getTime() : null;
  const streamHealth: "live" | "stale" | "offline" =
    !deviceStream.connected || msSinceLastEvent === null
      ? "offline"
      : msSinceLastEvent > staleThresholdMs
        ? "stale"
        : "live";

  // Last refresh time for header
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const updateTime = lastRefreshed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  function handleRefresh() {
    void queryClient.invalidateQueries({ queryKey: ["device", deviceId] });
    void queryClient.invalidateQueries({ queryKey: ["device-readings", deviceId] });
    setLastRefreshed(new Date());
  }

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
      pollingIntervalSec: String(d.config.pollingIntervalSec ?? 30),
      gatewayId: d.gatewayId ?? "",
      ipAddress: d.config.ipAddress ?? "",
      port: String(d.config.port ?? ""),
      modbusUnitId: String(d.config.modbusUnitId ?? ""),
      brokerUrl: d.config.brokerUrl ?? "",
      topic: d.config.topic ?? "",
      url: d.config.url ?? "",
      httpAuthMethod: d.config.httpAuthMethod ?? "none",
      httpAuthValue: "",
      httpApiKeyHeader: d.config.httpApiKeyHeader ?? "X-API-Key",
      serialPort: d.config.serialPort ?? "",
      baudRate: String(d.config.baudRate ?? "9600"),
      parity: d.config.parity ?? "none",
      dataBits: String(d.config.dataBits ?? "8"),
      stopBits: String(d.config.stopBits ?? "1"),
      opcuaSecurityMode: d.config.opcuaSecurityMode ?? "None",
      opcuaUsername: d.config.opcuaUsername ?? "",
      opcuaPassword: "",
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
      if (configForm.ipAddress) body.ipAddress = configForm.ipAddress;
      if (configForm.port) body.port = Number(configForm.port);
      if (configForm.modbusUnitId) body.modbusUnitId = Number(configForm.modbusUnitId);
    } else if (p === "modbus_rtu") {
      if (configForm.serialPort) body.serialPort = configForm.serialPort;
      if (configForm.baudRate) body.baudRate = Number(configForm.baudRate);
      body.parity = configForm.parity;
      body.dataBits = Number(configForm.dataBits) || 8;
      body.stopBits = Number(configForm.stopBits) || 1;
      if (configForm.modbusUnitId) body.modbusUnitId = Number(configForm.modbusUnitId);
    } else if (p === "mqtt") {
      if (configForm.brokerUrl) body.brokerUrl = configForm.brokerUrl;
      if (configForm.topic) body.topic = configForm.topic;
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
      if (configForm.ipAddress) body.ipAddress = configForm.ipAddress;
      if (configForm.port) body.port = Number(configForm.port);
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
    } catch {
      toast({ title: "Discovery failed", variant: "destructive" });
    } finally {
      setSniffLoading(false);
    }
  }

  function saveFieldMap() {
    const valid = fieldMapDraft.filter((f) => f.key.trim() && f.label.trim());
    updateMutation.mutate({ fieldMap: valid } as Record<string, unknown>);
    setFieldMapEditing(false);
    setSniffFields(null);
  }

  function addDiscoveredField(f: { jsonPath: string; suggestedKey: string; type: string; sample: unknown }) {
    const alreadyAdded = fieldMapDraft.some((d) => d.jsonPath === f.jsonPath);
    if (alreadyAdded) return;
    setFieldMapDraft((prev) => [...prev, {
      key: f.suggestedKey,
      label: f.suggestedKey.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim(),
      unit: "",
      jsonPath: f.jsonPath,
    }]);
  }

  // ── Derived helpers ───────────────────────────────────────────────────────
  const effectiveFM: FieldDef[] =
    (device?.config?.fieldMap?.length ? device.config.fieldMap : device?.template?.fieldMap) ?? [];

  function getFieldDef(key: string): FieldDef | undefined {
    return effectiveFM.find((f) => f.key === key);
  }

  function getParamValue(key: string): string {
    if (!latestReading) return "--";
    const v = latestReading.params[key];
    if (v == null) return "--";
    if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return String(v);
  }

  // ── Loading / not found ───────────────────────────────────────────────────
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

  const plantName = plantsMap[device.plantId] ?? device.plantId;
  const modelLabel = device.template ? `${device.template.manufacturer} ${device.template.model}` : typeLabel(device.type);

  // ── Status badge config ───────────────────────────────────────────────────
  const statusCfg = {
    online:  { label: "Online",  color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-400" },
    offline: { label: "Offline", color: "text-slate-400",   bg: "bg-slate-500/10",   border: "border-slate-500/30",   dot: "bg-slate-400" },
    error:   { label: "Error",   color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30",     dot: "bg-red-400"   },
  }[device.status];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex flex-col space-y-0 min-h-0">

        {/* ── Breadcrumb / back ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => navigate("/devices")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Devices
          </button>
          <span className="text-border text-xs">›</span>
          <span className="text-xs text-foreground font-medium">{device.name}</span>
        </div>

        {/* ── Device header ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${statusCfg.bg} ${statusCfg.border}`}>
              <Cpu className={`w-5 h-5 ${statusCfg.color}`} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">{device.name}</h1>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                <span>Plant: <span className="text-foreground">{plantName}</span></span>
                <span className="text-border">·</span>
                <span>Model: <span className="text-foreground font-mono">{modelLabel}</span></span>
                <span className="text-border">·</span>
                <span>{device.protocol.toUpperCase()}</span>
              </div>
            </div>
          </div>

          {/* Status badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${device.status === "online" ? "animate-pulse" : ""}`} />
            {statusCfg.label}
          </div>

          {/* Actions */}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {device.pendingDeploy && canManage && (
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
            {canManage && (
              <Button
                size="sm" variant="outline" className="gap-2"
                onClick={() => setConfirmRestart(true)}
                disabled={restartMutation.isPending}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {restartMutation.isPending ? "Restarting…" : "Restart"}
              </Button>
            )}
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-0 border-b border-border/50 mb-0 overflow-x-auto">
          <TabBtn active={activeTab === "general"}      onClick={() => setActiveTab("general")}      icon={Info}>General information</TabBtn>
          <TabBtn active={activeTab === "raw-registers"} onClick={() => setActiveTab("raw-registers")} icon={Table2}>Raw Registers</TabBtn>
          <TabBtn active={activeTab === "curve"}        onClick={() => setActiveTab("curve")}        icon={BarChart2}>Curve</TabBtn>
          <TabBtn active={activeTab === "diagnostics"}  onClick={() => setActiveTab("diagnostics")}  icon={Stethoscope}>Diagnostics</TabBtn>
          <TabBtn active={activeTab === "settings"}     onClick={() => setActiveTab("settings")}     icon={Settings}>Settings</TabBtn>
        </div>

        {/* ══════════════ GENERAL INFORMATION tab ══════════════════════ */}
        {activeTab === "general" && (
          <div className="bg-card border border-border/60 rounded-b-xl rounded-tr-xl overflow-hidden">
            {/* Sub-header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/10">
              <h3 className="text-xs font-semibold text-foreground">Measuring point parameter</h3>
              <div className="flex items-center gap-3">
                {latestReading && (
                  <span className="text-[10px] text-muted-foreground">
                    Data update time: {new Date(latestReading.ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}{" "}
                    {new Date(latestReading.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                <button
                  onClick={handleRefresh}
                  className="p-1 rounded hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
                  title="Refresh data"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Stream health indicator */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-muted/5">
              {streamHealth === "live" ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" /> Live
                </span>
              ) : streamHealth === "stale" ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Stale
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" /> Offline
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {streamHealth === "live"
                  ? "Streaming in real time"
                  : streamHealth === "stale"
                    ? "Device hasn't reported recently"
                    : "No live stream — showing last polled data"}
              </span>
            </div>

            {/* Grouped sections */}
            {SECTION_KEYS.map(({ title, keys }) => {
              // Only render if at least one key is known in fieldMap OR has data
              const relevantFields = effectiveFM.length > 0
                ? keys.filter((k) => effectiveFM.some((f) => f.key === k))
                : keys;
              const hasData = latestReading
                ? keys.some((k) => latestReading.params[k] != null)
                : false;
              if (relevantFields.length === 0 && !hasData) return null;

              const displayKeys = relevantFields.length > 0 ? relevantFields : keys.filter((k) => latestReading?.params[k] != null);

              return (
                <div key={title}>
                  <SectionHeader
                    title={title}
                    collapsible
                    open={isSectionOpen(title)}
                    onToggle={() => toggleSection(title)}
                  />
                  {isSectionOpen(title) && (
                    <div className="grid grid-cols-3">
                      {displayKeys.map((key) => {
                        const fd = getFieldDef(key);
                        const label = fd?.label ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
                        const unit = fd?.unit;
                        const val = getParamValue(key);
                        const isLive = changedKeys.has(key) || streamHealth === "live";
                        return (
                          <ParamCell
                            key={key}
                            label={label}
                            value={val}
                            unit={unit}
                            live={isLive}
                            loading={isLoading}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Any extra params not in predefined sections */}
            {(() => {
              const allSectionKeys = SECTION_KEYS.flatMap((s) => s.keys);
              const extraKeys = latestReading
                ? Object.keys(latestReading.params).filter((k) => !allSectionKeys.includes(k))
                : [];
              if (extraKeys.length === 0) return null;
              return (
                <div>
                  <SectionHeader title="Other" collapsible open={isSectionOpen("Other")} onToggle={() => toggleSection("Other")} />
                  {isSectionOpen("Other") && (
                    <div className="grid grid-cols-3">
                      {extraKeys.map((key) => {
                        const fd = getFieldDef(key);
                        const label = fd?.label ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
                        return (
                          <ParamCell
                            key={key}
                            label={label}
                            value={getParamValue(key)}
                            unit={fd?.unit}
                            live={streamHealth === "live"}
                            loading={isLoading}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {!latestReading && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Activity className="h-8 w-8 opacity-30 mb-3" />
                <p className="text-sm font-medium">No readings yet</p>
                <p className="text-xs mt-1">
                  {device.dataSource === "simulated"
                    ? "Waiting for the real device to connect."
                    : "Waiting for the first poll cycle."}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ RAW REGISTERS tab ════════════════════════════ */}
        {activeTab === "raw-registers" && (
          <div className="bg-card border border-border/60 rounded-b-xl rounded-tr-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/10">
              <h3 className="text-xs font-semibold text-foreground">
                Register dump — {effectiveFM.length > 0 ? `${effectiveFM.length} mapped registers` : "all parameters"}
              </h3>
              <button
                onClick={handleRefresh}
                className="p-1 rounded hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/10">
                    {["Register name", "Parameter key", "Decoded value", "Unit", "Multiplier"].map((col) => (
                      <th key={col} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {effectiveFM.length > 0 ? (
                    effectiveFM.map((fd) => {
                      const val = latestReading?.params[fd.key];
                      const displayVal = val == null
                        ? "--"
                        : typeof val === "number"
                          ? val.toLocaleString(undefined, { maximumFractionDigits: 4 })
                          : String(val);
                      const changed = latestReading && changedKeys.has(fd.key);
                      return (
                        <tr
                          key={fd.key}
                          className={`border-b border-border/30 transition-colors ${changed ? "bg-primary/5" : "hover:bg-muted/10"}`}
                        >
                          <td className="px-4 py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                            {fd.registerName ?? "--"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-primary whitespace-nowrap">
                            {fd.key}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums font-medium text-foreground whitespace-nowrap">
                            <span className={changed ? "text-emerald-400" : ""}>{displayVal}</span>
                            {changed && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                            {fd.unit || "--"}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground font-mono whitespace-nowrap">
                            {fd.multiplier != null ? `×${fd.multiplier}` : "--"}
                            {fd.encoding ? <span className="ml-1.5 text-[10px] text-amber-400/80">{fd.encoding}</span> : null}
                          </td>
                        </tr>
                      );
                    })
                  ) : latestReading ? (
                    Object.entries(latestReading.params).map(([key, val]) => {
                      const displayVal = val == null
                        ? "--"
                        : typeof val === "number"
                          ? val.toLocaleString(undefined, { maximumFractionDigits: 4 })
                          : String(val);
                      return (
                        <tr key={key} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">--</td>
                          <td className="px-4 py-2.5 font-mono text-primary">{key}</td>
                          <td className="px-4 py-2.5 tabular-nums font-medium text-foreground">{displayVal}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">--</td>
                          <td className="px-4 py-2.5 text-muted-foreground">--</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                        <Activity className="h-7 w-7 opacity-30 mx-auto mb-2" />
                        No readings available yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════ CURVE tab ════════════════════════════════════ */}
        {activeTab === "curve" && (
          <div className="bg-card border border-border/60 rounded-b-xl rounded-tr-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/10">
              <h3 className="text-xs font-semibold">Live trend — {effectiveFM.find((f) => f.key === chartField)?.label ?? chartField ?? "—"}</h3>
              <div className="flex items-center gap-2">
                {streamHealth === "live" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" /> Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                    {streamHealth === "stale" ? "Stale" : "Offline"}
                  </span>
                )}
                {canManage && (
                  <Button
                    size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                    onClick={() => void runConnectionTest()}
                    disabled={testingConnection}
                  >
                    <FlaskConical className="h-3 w-3" />
                    {testingConnection ? "Testing…" : "Test Connection"}
                  </Button>
                )}
              </div>
            </div>

            {/* Quick-stats row */}
            {latestReading && effectiveFM.length > 0 && (
              <div className="grid border-b border-border/40"
                style={{ gridTemplateColumns: `repeat(${Math.min(4, effectiveFM.slice(0, 4).length)}, 1fr)` }}>
                {effectiveFM.slice(0, 4).map((fd) => {
                  const v = latestReading.params[fd.key];
                  const display = v == null
                    ? "--"
                    : typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v);
                  return (
                    <div key={fd.key} className="flex flex-col items-center py-3 border-r border-border/40 last:border-r-0">
                      <span className="text-[10px] text-muted-foreground mb-1">{fd.label}</span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {display}{fd.unit ? <span className="text-xs font-normal text-muted-foreground ml-0.5">{fd.unit}</span> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="px-4 pt-4 pb-5">
              {/* Field selector */}
              {effectiveFM.length > 0 && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] text-muted-foreground">Charted field:</span>
                  <select
                    value={chartField ?? ""}
                    onChange={(e) => setChartField(e.target.value || null)}
                    className="h-7 px-2 rounded border border-border/60 bg-muted/20 text-xs text-foreground focus:outline-none focus:border-primary/50"
                  >
                    {effectiveFM
                      .filter((f) => latestReading?.params[f.key] != null && typeof latestReading.params[f.key] === "number")
                      .map((f) => (
                        <option key={f.key} value={f.key}>{f.label}{f.unit ? ` (${f.unit})` : ""}</option>
                      ))}
                  </select>
                </div>
              )}

              {chartField && readingHistory.filter((p) => chartField in p.nums).length >= 2 ? (
                <MiniLineChart
                  color="hsl(var(--primary))"
                  points={readingHistory
                    .filter((p) => chartField in p.nums)
                    .map((p) => ({
                      label: new Date(p.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                      value: p.nums[chartField]!,
                    }))}
                />
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                  <Activity className="h-8 w-8 opacity-30 mb-3" />
                  <p className="text-sm">Waiting for live data…</p>
                  <p className="text-xs mt-1 text-center max-w-xs">
                    The chart populates as readings arrive. Switch to another tab and back to trigger a fetch, or wait for the next poll cycle.
                  </p>
                </div>
              )}
            </div>

            {/* Connection test result */}
            {testResult && (
              <div className={`mx-4 mb-4 rounded-lg border p-3 flex items-start gap-3 text-sm ${
                testResult.ok ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"
              }`}>
                {testResult.ok
                  ? <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                  : <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {testResult.ok ? `Connected — ${testResult.latencyMs}ms RTT` : "Connection failed"}
                  </div>
                  {testResult.error && (
                    <div className="text-xs text-muted-foreground mt-0.5 break-all">{testResult.error}</div>
                  )}
                </div>
                <button onClick={() => setTestResult(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ DIAGNOSTICS tab ══════════════════════════════ */}
        {activeTab === "diagnostics" && (
          <div className="bg-card border border-border/60 rounded-b-xl rounded-tr-xl overflow-hidden">
            {/* Sub-header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/10">
              <h3 className="text-xs font-semibold text-foreground">24h Diagnostics &amp; Connectivity</h3>
              <button
                onClick={() => {
                  void queryClient.invalidateQueries({ queryKey: ["device-diagnostics", deviceId] });
                  void queryClient.invalidateQueries({ queryKey: ["device-logs", deviceId] });
                }}
                className="p-1 rounded hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
                title="Refresh diagnostics"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {diagLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading diagnostics…
              </div>
            ) : diagnostics ? (
              <>
                {/* ── Stat cards ───────────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-border/40">
                  {/* Health score */}
                  <div className="flex flex-col gap-1 px-4 py-3.5 border-r border-border/40">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Health Score</span>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-bold tabular-nums ${
                        diagnostics.healthScore == null ? "text-muted-foreground"
                        : diagnostics.healthScore >= 80 ? "text-emerald-400"
                        : diagnostics.healthScore >= 50 ? "text-amber-400"
                        : "text-red-400"
                      }`}>
                        {diagnostics.healthScore != null ? diagnostics.healthScore : "--"}
                      </span>
                      {diagnostics.healthScore != null && <span className="text-xs text-muted-foreground">/100</span>}
                    </div>
                    {diagnostics.dataSource === "simulated" && (
                      <span className="text-[10px] text-amber-400/70">simulated</span>
                    )}
                  </div>

                  {/* Success rate */}
                  <div className="flex flex-col gap-1 px-4 py-3.5 border-r border-border/40">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Success Rate 24h</span>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-bold tabular-nums ${
                        diagnostics.pollingStats.successRate24h == null ? "text-muted-foreground"
                        : diagnostics.pollingStats.successRate24h >= 95 ? "text-emerald-400"
                        : diagnostics.pollingStats.successRate24h >= 80 ? "text-amber-400"
                        : "text-red-400"
                      }`}>
                        {diagnostics.pollingStats.successRate24h != null ? diagnostics.pollingStats.successRate24h : "--"}
                      </span>
                      {diagnostics.pollingStats.successRate24h != null && <span className="text-xs text-muted-foreground">%</span>}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {diagnostics.pollingStats.readingCount24h}✓ &nbsp;{diagnostics.pollingStats.errorCount24h}✗
                    </span>
                  </div>

                  {/* Avg RTT */}
                  <div className="flex flex-col gap-1 px-4 py-3.5 border-r border-border/40">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg RTT</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold tabular-nums text-foreground">
                        {diagnostics.pollingStats.avgRttMs != null ? diagnostics.pollingStats.avgRttMs : "--"}
                      </span>
                      {diagnostics.pollingStats.avgRttMs != null && <span className="text-xs text-muted-foreground">ms</span>}
                    </div>
                    {diagnostics.pollingStats.lastRttMs != null && (
                      <span className="text-[10px] text-muted-foreground">last: {diagnostics.pollingStats.lastRttMs}ms</span>
                    )}
                  </div>

                  {/* Consecutive failures */}
                  <div className="flex flex-col gap-1 px-4 py-3.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Consec. Failures</span>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-bold tabular-nums ${
                        diagnostics.consecutiveFailures === 0 ? "text-emerald-400"
                        : diagnostics.consecutiveFailures < 5 ? "text-amber-400"
                        : "text-red-400"
                      }`}>
                        {diagnostics.consecutiveFailures}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      Driver: <span className="font-mono">{diagnostics.pollingStats.driverStatus}</span>
                    </span>
                  </div>
                </div>

                {/* ── 24h Connectivity Timeline ────────────────────────── */}
                <div className="px-4 py-4 border-b border-border/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">24h Connectivity Timeline</span>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400/80 inline-block" /> Online</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400/80 inline-block" /> Degraded</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400/80 inline-block" /> Offline</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-border inline-block" /> No data</span>
                    </div>
                  </div>
                  <div className="rounded overflow-hidden border border-border/30">
                    <ConnectivityTimeline buckets={diagnostics.connectivityTimeline} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>24h ago</span>
                    <span>12h ago</span>
                    <span>Now</span>
                  </div>
                </div>

                {/* ── Error breakdown + Comm log ────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-3">
                  {/* Error breakdown donut */}
                  <div className="border-r border-border/40 px-4 py-4">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-3">Error Breakdown</span>
                    <ErrorDonut breakdown={diagnostics.errorBreakdown} />
                  </div>

                  {/* Comm log */}
                  <div className="sm:col-span-2 flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/5">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Comm Log</span>
                      {/* Level filter */}
                      <div className="flex items-center gap-1">
                        {(["ALL", "INFO", "WARN", "ERROR"] as const).map((lvl) => (
                          <button
                            key={lvl}
                            onClick={() => setLogLevel(lvl)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors border ${
                              logLevel === lvl
                                ? lvl === "ERROR" ? "bg-red-500/20 text-red-400 border-red-500/40"
                                  : lvl === "WARN" ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                  : lvl === "INFO" ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                                  : "bg-primary/10 text-primary border-primary/30"
                                : "bg-transparent text-muted-foreground border-transparent hover:border-border/60"
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="overflow-y-auto max-h-72">
                      {logsLoading ? (
                        <div className="flex items-center justify-center py-10 text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
                        </div>
                      ) : logsError ? (
                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                          <AlertCircle className="h-6 w-6 text-red-400 opacity-60 mb-2" />
                          <p className="text-xs text-red-400">Failed to load comm logs</p>
                          <button
                            onClick={() => void queryClient.invalidateQueries({ queryKey: ["device-logs", deviceId] })}
                            className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
                          >Retry</button>
                        </div>
                      ) : commLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                          <ShieldAlert className="h-6 w-6 opacity-30 mb-2" />
                          <p className="text-xs">No log entries found</p>
                        </div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-card z-10">
                            <tr className="border-b border-border/40 bg-muted/10">
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Time</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Level</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Message</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">RTT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {commLogs.map((log, i) => (
                              <tr key={i} className={`border-b border-border/20 ${
                                log.level === "ERROR" ? "bg-red-500/5 hover:bg-red-500/10"
                                : log.level === "WARN" ? "bg-amber-500/5 hover:bg-amber-500/10"
                                : "hover:bg-muted/10"
                              }`}>
                                <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">
                                  {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                </td>
                                <td className="px-3 py-1.5 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    log.level === "ERROR" ? "bg-red-500/15 text-red-400"
                                    : log.level === "WARN" ? "bg-amber-500/15 text-amber-400"
                                    : "bg-blue-500/10 text-blue-400"
                                  }`}>
                                    {log.level}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 text-foreground max-w-xs truncate">{log.message}</td>
                                <td className="px-3 py-1.5 text-muted-foreground font-mono whitespace-nowrap">
                                  {log.rttMs != null ? `${log.rttMs}ms` : "--"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <AlertCircle className="h-8 w-8 opacity-30 mb-3" />
                <p className="text-sm">Could not load diagnostics data</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ SETTINGS tab ═════════════════════════════════ */}
        {activeTab === "settings" && (
          <div className="bg-card border border-border/60 rounded-b-xl rounded-tr-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/10">
              <h3 className="text-xs font-semibold">Device Settings</h3>
              {canManage && !editing && (
                <button
                  onClick={() => startEdit(device)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
                >
                  <Settings className="w-3 h-3" /> Edit Config
                </button>
              )}
            </div>

            {/* Connection params — view mode */}
            {!editing && (
              <>
                <SectionHeader title="Connection" />
                <div className="grid grid-cols-3">
                  <ParamCell label="Protocol"         value={device.protocol.toUpperCase()} />
                  <ParamCell label="Poll interval"    value={String(device.config.pollingIntervalSec)} unit="s" />
                  <ParamCell label="Gateway"          value={device.gatewayId ? (gateways.find((g) => g.id === device.gatewayId)?.name ?? "Unknown") : "Cloud (direct)"} />
                  {device.config.brokerUrl  && <ParamCell label="Broker URL"    value={device.config.brokerUrl} />}
                  {device.config.topic      && <ParamCell label="MQTT topic"    value={device.config.topic} />}
                  {device.config.ipAddress  && <ParamCell label="IP address"    value={device.config.ipAddress} />}
                  {device.config.port       && <ParamCell label="Port"          value={String(device.config.port)} />}
                  {device.config.modbusUnitId != null && <ParamCell label="Unit ID"       value={String(device.config.modbusUnitId)} />}
                  {device.config.url        && <ParamCell label="Endpoint URL"  value={device.config.url} />}
                  {device.config.serialPort && <ParamCell label="Serial port"   value={device.config.serialPort} />}
                </div>

                <SectionHeader title="Device info" />
                <div className="grid grid-cols-3">
                  <ParamCell label="Device ID"    value={device.id} />
                  <ParamCell label="Firmware"     value={device.firmwareVersion || "--"} />
                  <ParamCell label="Health score" value={device.healthScore != null ? `${device.healthScore}/100` : "--"} />
                  <ParamCell label="Last seen"    value={device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "--"} />
                  <ParamCell label="Data source"  value={device.dataSource === "live" ? "Live driver" : "Simulated"} />
                  <ParamCell label="Type"         value={typeLabel(device.type)} />
                </div>

                {/* HTTP Push ingest URL */}
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

                {/* Field map section */}
                <SectionHeader title="Field map (register mapping)" collapsible open={isSectionOpen("fieldmap")} onToggle={() => toggleSection("fieldmap")} />
                {isSectionOpen("fieldmap") && (
                  <div className="px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {effectiveFM.length} register{effectiveFM.length !== 1 ? "s" : ""} mapped
                        {device.config.fieldMap?.length ? " (device-level)" : device.template ? " (template)" : ""}
                      </span>
                      {canManage && !fieldMapEditing && (
                        <button
                          onClick={() => { setFieldMapDraft([...(device.config.fieldMap ?? device.template?.fieldMap ?? [])]); setFieldMapEditing(true); }}
                          className="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
                        >
                          Edit field map
                        </button>
                      )}
                    </div>

                    {!fieldMapEditing ? (
                      effectiveFM.length > 0 ? (
                        <div className="rounded-lg border border-border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/20">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Key</th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Label</th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Unit</th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Register</th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Multiplier</th>
                              </tr>
                            </thead>
                            <tbody>
                              {effectiveFM.map((f) => (
                                <tr key={f.key} className="border-t border-border/50">
                                  <td className="px-3 py-2 font-mono text-primary">{f.key}</td>
                                  <td className="px-3 py-2 text-foreground">{f.label}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{f.unit || "--"}</td>
                                  <td className="px-3 py-2 font-mono text-muted-foreground">{(f as FieldDef & { registerName?: string }).registerName ?? "--"}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{f.multiplier != null ? `×${f.multiplier}` : "--"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No field map configured.</p>
                      )
                    ) : (
                      /* Field map editor */
                      <div className="space-y-3">
                        {/* Discover button */}
                        {device.config.url && (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void discoverFields()} disabled={sniffLoading}>
                              {sniffLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                              {sniffLoading ? "Fetching…" : "Discover Available Fields"}
                            </Button>
                          </div>
                        )}

                        {sniffFields && (
                          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                            <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                              <Wand2 className="h-3.5 w-3.5" />
                              {sniffFields.length} fields discovered — click to add
                            </p>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {sniffFields.map((f, i) => {
                                const added = fieldMapDraft.some((d) => d.jsonPath === f.jsonPath);
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

                        {fieldMapDraft.length > 0 && (
                          <div className="rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/30">
                                <tr>
                                  <th className="px-2 py-2 text-left font-medium text-muted-foreground w-28">Key *</th>
                                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Label *</th>
                                  <th className="px-2 py-2 text-left font-medium text-muted-foreground w-20">Unit</th>
                                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">JSON Path</th>
                                  <th className="px-2 py-2 w-8" />
                                </tr>
                              </thead>
                              <tbody>
                                {fieldMapDraft.map((f, i) => (
                                  <tr key={i} className="border-t border-border">
                                    <td className="px-2 py-1">
                                      <input className="w-full bg-transparent border border-border rounded px-1.5 py-1 font-mono text-primary focus:outline-none focus:border-primary/60"
                                        value={f.key} placeholder="acPowerKw"
                                        onChange={(e) => setFieldMapDraft((d) => d.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <input className="w-full bg-transparent border border-border rounded px-1.5 py-1 focus:outline-none focus:border-primary/60"
                                        value={f.label} placeholder="AC Power"
                                        onChange={(e) => setFieldMapDraft((d) => d.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <input className="w-full bg-transparent border border-border rounded px-1.5 py-1 focus:outline-none focus:border-primary/60"
                                        value={f.unit} placeholder="kW"
                                        onChange={(e) => setFieldMapDraft((d) => d.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <input className="w-full bg-transparent border border-border rounded px-1.5 py-1 font-mono focus:outline-none focus:border-primary/60"
                                        value={f.jsonPath ?? ""} placeholder="$.data.power"
                                        onChange={(e) => setFieldMapDraft((d) => d.map((x, j) => j === i ? { ...x, jsonPath: e.target.value || undefined } : x))} />
                                    </td>
                                    <td className="px-2 py-1">
                                      <button onClick={() => setFieldMapDraft((d) => d.filter((_, j) => j !== i))}
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
                          <Button size="sm" variant="outline" className="gap-1.5"
                            onClick={() => setFieldMapDraft((d) => [...d, { key: "", label: "", unit: "", jsonPath: "" }])}>
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
              </>
            )}

            {/* Edit mode for connection config */}
            {editing && configForm && (
              <div className="px-4 py-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Poll interval (seconds)</Label>
                    <Input className="mt-1" type="number" value={configForm.pollingIntervalSec}
                      onChange={(e) => setConfigForm((f) => f && { ...f, pollingIntervalSec: e.target.value })} />
                  </div>
                  <div>
                    <Label>Gateway</Label>
                    <Select value={configForm.gatewayId || "none"} onValueChange={(v) => setConfigForm((f) => f && { ...f, gatewayId: v === "none" ? "" : v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Cloud (direct connection)</SelectItem>
                        {gateways.filter((g) => !g.revokedAt).map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(device.protocol === "modbus" || device.protocol === "modbus_tcp") && (<>
                    <div><Label>IP Address</Label>
                      <Input className="mt-1" value={configForm.ipAddress}
                        onChange={(e) => setConfigForm((f) => f && { ...f, ipAddress: e.target.value })} /></div>
                    <div><Label>Port</Label>
                      <Input className="mt-1" type="number" value={configForm.port}
                        onChange={(e) => setConfigForm((f) => f && { ...f, port: e.target.value })} /></div>
                    <div><Label>Modbus Unit ID</Label>
                      <Input className="mt-1" type="number" value={configForm.modbusUnitId}
                        onChange={(e) => setConfigForm((f) => f && { ...f, modbusUnitId: e.target.value })} /></div>
                  </>)}

                  {device.protocol === "modbus_rtu" && (<>
                    <div><Label>Serial Port</Label>
                      <Input className="mt-1 font-mono text-sm" placeholder="/dev/ttyUSB0" value={configForm.serialPort}
                        onChange={(e) => setConfigForm((f) => f && { ...f, serialPort: e.target.value })} /></div>
                    <div><Label>Baud Rate</Label>
                      <Select value={configForm.baudRate} onValueChange={(v) => setConfigForm((f) => f && { ...f, baudRate: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["1200","2400","4800","9600","19200","38400","57600","115200"].map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select></div>
                    <div><Label>Parity</Label>
                      <Select value={configForm.parity} onValueChange={(v) => setConfigForm((f) => f && { ...f, parity: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="even">Even</SelectItem>
                          <SelectItem value="odd">Odd</SelectItem>
                        </SelectContent>
                      </Select></div>
                    <div><Label>Data Bits</Label>
                      <Select value={configForm.dataBits} onValueChange={(v) => setConfigForm((f) => f && { ...f, dataBits: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["5","6","7","8"].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                      </Select></div>
                    <div><Label>Stop Bits</Label>
                      <Select value={configForm.stopBits} onValueChange={(v) => setConfigForm((f) => f && { ...f, stopBits: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                        </SelectContent>
                      </Select></div>
                    <div><Label>Unit ID</Label>
                      <Input className="mt-1" type="number" min={1} max={247} value={configForm.modbusUnitId}
                        onChange={(e) => setConfigForm((f) => f && { ...f, modbusUnitId: e.target.value })} /></div>
                  </>)}

                  {device.protocol === "mqtt" && (<>
                    <div className="col-span-1 sm:col-span-2"><Label>Broker URL</Label>
                      <Input className="mt-1" value={configForm.brokerUrl}
                        onChange={(e) => setConfigForm((f) => f && { ...f, brokerUrl: e.target.value })} /></div>
                    <div className="col-span-1 sm:col-span-2"><Label>Topic</Label>
                      <Input className="mt-1" value={configForm.topic}
                        onChange={(e) => setConfigForm((f) => f && { ...f, topic: e.target.value })} /></div>
                  </>)}

                  {(device.protocol === "http" || device.protocol === "websocket") && (<>
                    <div className="col-span-1 sm:col-span-2"><Label>Endpoint URL</Label>
                      <Input className="mt-1 font-mono text-sm" value={configForm.url}
                        onChange={(e) => setConfigForm((f) => f && { ...f, url: e.target.value })} /></div>
                    <div><Label>Authentication</Label>
                      <Select value={configForm.httpAuthMethod} onValueChange={(v) => setConfigForm((f) => f && { ...f, httpAuthMethod: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No auth</SelectItem>
                          <SelectItem value="bearer">Bearer token</SelectItem>
                          <SelectItem value="api_key">API key header</SelectItem>
                          <SelectItem value="basic">Basic (user:pass)</SelectItem>
                        </SelectContent>
                      </Select></div>
                    {configForm.httpAuthMethod === "api_key" && (
                      <div><Label>Header name</Label>
                        <Input className="mt-1" placeholder="X-API-Key" value={configForm.httpApiKeyHeader}
                          onChange={(e) => setConfigForm((f) => f && { ...f, httpApiKeyHeader: e.target.value })} /></div>
                    )}
                    {configForm.httpAuthMethod !== "none" && (
                      <div><Label>{configForm.httpAuthMethod === "api_key" ? "Key value" : configForm.httpAuthMethod === "bearer" ? "Bearer token" : "Credentials (user:pass)"}</Label>
                        <Input type="password" className="mt-1" placeholder={device.config.httpAuthConfigured ? "•••••• (leave blank to keep)" : "••••••••"} value={configForm.httpAuthValue}
                          onChange={(e) => setConfigForm((f) => f && { ...f, httpAuthValue: e.target.value })} /></div>
                    )}
                  </>)}

                  {device.protocol === "opcua" && (<>
                    <div className="col-span-1 sm:col-span-2"><Label>OPC-UA Endpoint URL</Label>
                      <Input className="mt-1 font-mono text-sm" placeholder="opc.tcp://device:4840" value={configForm.url}
                        onChange={(e) => setConfigForm((f) => f && { ...f, url: e.target.value })} /></div>
                    <div><Label>Security Mode</Label>
                      <Select value={configForm.opcuaSecurityMode} onValueChange={(v) => setConfigForm((f) => f && { ...f, opcuaSecurityMode: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="None">None</SelectItem>
                          <SelectItem value="Sign">Sign</SelectItem>
                          <SelectItem value="SignAndEncrypt">Sign & Encrypt</SelectItem>
                        </SelectContent>
                      </Select></div>
                    <div><Label>Username</Label>
                      <Input className="mt-1" value={configForm.opcuaUsername}
                        onChange={(e) => setConfigForm((f) => f && { ...f, opcuaUsername: e.target.value })} /></div>
                    <div><Label>Password</Label>
                      <Input type="password" className="mt-1" placeholder={device.config.opcuaPasswordConfigured ? "•••••• (leave blank to keep)" : ""} value={configForm.opcuaPassword}
                        onChange={(e) => setConfigForm((f) => f && { ...f, opcuaPassword: e.target.value })} /></div>
                  </>)}

                  {device.protocol === "bacnet" && (<>
                    <div><Label>IP Address</Label>
                      <Input className="mt-1" value={configForm.ipAddress}
                        onChange={(e) => setConfigForm((f) => f && { ...f, ipAddress: e.target.value })} /></div>
                    <div><Label>Port</Label>
                      <Input className="mt-1" type="number" value={configForm.port}
                        onChange={(e) => setConfigForm((f) => f && { ...f, port: e.target.value })} /></div>
                    <div><Label>BACnet Device Instance</Label>
                      <Input className="mt-1" type="number" value={configForm.bacnetDeviceInstance}
                        onChange={(e) => setConfigForm((f) => f && { ...f, bacnetDeviceInstance: e.target.value })} /></div>
                  </>)}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button size="sm" onClick={() => saveEdit(device)} disabled={updateMutation.isPending}>
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {updateMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* CSV import section */}
            {canManage && !editing && (
              <div className="border-t border-border/40">
                <SectionHeader title="Import historical readings" collapsible open={isSectionOpen("csv")} onToggle={() => toggleSection("csv")} />
                {isSectionOpen("csv") && (
                  <div className="px-4 py-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Upload a CSV with a <code className="bg-muted px-1 rounded">timestamp</code> column and one column per parameter.
                      Existing readings for the same timestamps are skipped.
                    </p>
                    {importResult && (
                      <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                        <div>
                          <div className="font-medium">Import complete</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {importResult.imported} rows imported · {importResult.skipped} skipped
                          </div>
                          {importResult.columns.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Columns: {importResult.columns.join(", ")}
                            </div>
                          )}
                        </div>
                        <button onClick={() => setImportResult(null)} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {importError && (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                        <div>
                          <div className="font-medium">Import failed</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{importError}</div>
                        </div>
                        <button onClick={() => setImportError(null)} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <input
                        ref={csvFileRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setImportResult(null);
                          setImportError(null);
                          try {
                            const form = new FormData();
                            form.append("file", file);
                            const r = await fetch(`${BASE}api/devices/${deviceId}/readings/import`, {
                              method: "POST", credentials: "include", body: form,
                            });
                            const j = await r.json() as { imported?: number; skipped?: number; columns?: string[]; error?: string };
                            if (!r.ok) setImportError(j.error ?? "Upload failed");
                            else setImportResult({ imported: j.imported ?? 0, skipped: j.skipped ?? 0, columns: j.columns ?? [] });
                          } catch {
                            setImportError("Network error during upload");
                          } finally {
                            if (csvFileRef.current) csvFileRef.current.value = "";
                          }
                        }}
                      />
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => csvFileRef.current?.click()}>
                        <Upload className="h-3.5 w-3.5" /> Upload CSV
                      </Button>
                      <span className="text-xs text-muted-foreground">CSV only · max 10 MB</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Confirm dialogs ───────────────────────────────────────────── */}
      <AlertDialog open={confirmRestart} onOpenChange={setConfirmRestart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart device driver?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a restart command to the device driver. Any ongoing poll cycle will be interrupted and re-started.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { restartMutation.mutate(); setConfirmRestart(false); }}
            >
              Restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSync} onOpenChange={setConfirmSync}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sync configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the pending configuration changes as deployed and clears the "pending deploy" flag.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { syncMutation.mutate(); setConfirmSync(false); }}
            >
              Sync Config
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
