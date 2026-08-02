import {
  useGetInverter,
  useGetInverterTrend,
  useGetPlant,
  getGetInverterQueryKey,
  getGetInverterTrendQueryKey,
  type InverterStatus,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import {
  Zap, Layers, ArrowRight, ChevronRight, ArrowLeft, RefreshCw,
  TrendingUp, TrendingDown, AlertTriangle, Settings, BarChart2,
  Info, Wrench, Radio, ChevronDown, ChevronUp,
  Search, ChevronLeft, FileText, TriangleAlert, Bell, X,
} from "lucide-react";
import { SvgAreaChart } from "@/components/ui/svg-charts";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";

const BASE = import.meta.env.BASE_URL as string;

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG: Record<InverterStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  running:   { label: "Grid-connected operation", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-400" },
  standby:   { label: "Standby",                  color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   dot: "bg-amber-400" },
  fault:     { label: "Fault",                     color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30",     dot: "bg-red-400" },
  comm_lost: { label: "Communication lost",        color: "text-slate-400",   bg: "bg-slate-500/10",   border: "border-slate-500/30",   dot: "bg-slate-400" },
};

// ── Severity → alarm type ─────────────────────────────────────────────────────
type AlarmTypeName = "Fault" | "Alarm" | "Notification";
function alarmType(severity: string): AlarmTypeName {
  if (severity === "critical" || severity === "major") return "Fault";
  if (severity === "minor") return "Alarm";
  return "Notification";
}
function AlarmTypeBadge({ severity }: { severity: string }) {
  const t = alarmType(severity);
  if (t === "Fault") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/20">
      <TriangleAlert className="w-2.5 h-2.5" /> Fault
    </span>
  );
  if (t === "Alarm") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <Bell className="w-2.5 h-2.5" /> Alarm
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">
      <Info className="w-2.5 h-2.5" /> Info
    </span>
  );
}

// Deterministic fault code from title
function faultCodeFor(title: string, severity: string): number {
  const t = title.toLowerCase();
  if (t.includes("offline") || t.includes("comm")) return 1;
  if (t.includes("undervoltage") || t.includes("under voltage")) return 4;
  if (t.includes("overvoltage") || t.includes("over voltage")) return 5;
  if (t.includes("overcurrent") || t.includes("over current")) return 8;
  if (t.includes("temperature") || t.includes("temp")) return 12;
  if (t.includes("pv") || t.includes("anomaly")) return 549;
  if (t.includes("performance") || t.includes("pr")) return 100;
  if (t.includes("grid")) return 4;
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) & 0x3FF;
  return (h % 800) + 100;
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "--";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// ── Fault knowledge base ──────────────────────────────────────────────────────
interface FaultKb { cause: string; suggestions: string[] }
const FAULT_KB: Record<number, FaultKb> = {
  1: {
    cause: "The device has not reported data within 3× its configured polling interval and has been marked offline by the system.",
    suggestions: [
      "Verify the device is powered on and the status LED is active.",
      "Check the network/MQTT connection between the TRB246 and the SCADA gateway.",
      "Ensure the MQTT broker URL and credentials in the device configuration are correct.",
      "Inspect the TRB246 management interface for any active alarms or disconnection events.",
      "If the issue persists, restart the device and the SCADA driver. Contact support if offline state continues beyond 30 minutes.",
    ],
  },
  4: {
    cause: "Grid voltage is lower than the set voltage protection value. The inverter has disconnected from the grid to protect the system.",
    suggestions: [
      "The inverter will reconnect automatically once grid voltage returns to normal.",
      "Measure the actual grid voltage at the point of connection and compare with the inverter's voltage protection threshold.",
      "Contact your electricity provider if grid undervoltage is persistent.",
      "Check whether voltage protection parameters are correctly set via the inverter's LCD or configuration app.",
      "Inspect the AC cable connections and ensure they are firmly seated.",
      "If the fault recurs repeatedly, contact the inverter manufacturer's service team.",
    ],
  },
  5: {
    cause: "Grid voltage is higher than the set overvoltage protection value. The inverter has disconnected to prevent equipment damage.",
    suggestions: [
      "The inverter will reconnect automatically once grid voltage normalises.",
      "Measure actual grid voltage and compare with protection threshold settings.",
      "Contact your electricity distribution company if persistent overvoltage is observed.",
      "Check local wiring for loose connections that may cause transient voltage spikes.",
      "Review and adjust the overvoltage trip threshold if appropriate for your grid region.",
    ],
  },
  8: {
    cause: "AC output current exceeds the inverter's overcurrent protection limit.",
    suggestions: [
      "Check for any short circuits or abnormal loads on the AC output side.",
      "Inspect the AC cable sizing — undersized cables cause excessive resistance and current.",
      "Verify the DC input from PV strings is within the inverter's rated input range.",
      "Reset the inverter and monitor for recurrence. Persistent overcurrent may indicate a hardware fault.",
    ],
  },
  12: {
    cause: "Inverter internal temperature has exceeded the safe operating threshold. Thermal protection has been triggered.",
    suggestions: [
      "Ensure the inverter enclosure has adequate ventilation and cooling airflow.",
      "Clean any dust or debris from ventilation slots and heat sinks.",
      "Check ambient temperature at the installation site — avoid direct sunlight exposure.",
      "Verify that the cooling fan (if applicable) is operating correctly.",
      "Reduce inverter load during peak heat hours if temperature spikes are recurring.",
      "If temperature protection triggers frequently, consider relocating the inverter to a cooler environment.",
    ],
  },
  100: {
    cause: "Inverter performance ratio (PR) has dropped significantly below the expected baseline for current irradiance conditions.",
    suggestions: [
      "Inspect PV panel surfaces for soiling, shading, or bird droppings and clean as necessary.",
      "Check for bypass diode failures in the PV module junction boxes.",
      "Verify string open-circuit voltages and short-circuit currents match expected values.",
      "Review historical PR trends to determine if degradation is gradual (long-term) or sudden (fault-related).",
      "Inspect DC cable connections and combiner box fuses for corrosion or failure.",
    ],
  },
  549: {
    cause: "PV input anomaly detected. The DC voltage or current from the PV string is outside expected operating parameters.",
    suggestions: [
      "Check PV string open-circuit voltages using a multimeter and compare against datasheet values.",
      "Inspect for shading on PV modules — partial shading can create voltage mismatch.",
      "Verify string combiner fuses are intact and properly rated.",
      "Check MPPT input voltage range: ensure string Voc does not exceed inverter MPPT limits.",
      "Inspect DC cabling for insulation damage, loose terminations, or polarity reversals.",
    ],
  },
};

function getFaultKb(title: string, severity: string): FaultKb {
  const code = faultCodeFor(title, severity);
  if (FAULT_KB[code]) return FAULT_KB[code];
  // Generic fallback
  return {
    cause: `${title}. The system has flagged this condition as a ${alarmType(severity).toLowerCase()} requiring attention.`,
    suggestions: [
      "Review recent operational data for the affected device to identify anomalies.",
      "Inspect physical connections, wiring, and protection devices at the installation.",
      "Check device logs and event history for related events preceding this fault.",
      "Resolve the root cause, then manually acknowledge or clear this alarm in the SCADA system.",
      "If the issue cannot be resolved on-site, contact the device manufacturer's technical support.",
    ],
  };
}

// ── Fault detail modal ────────────────────────────────────────────────────────
function FaultDetailModal({
  alert, deviceModel, onClose,
}: {
  alert: any; deviceModel: string; onClose: () => void;
}) {
  const kb = getFaultKb(alert.title, alert.severity);
  const code = faultCodeFor(alert.title, alert.severity);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border/60 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 flex-shrink-0">
          <h2 className="text-base font-semibold text-foreground">Fault details</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {/* Device info grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            {[
              { label: "Device name",  value: alert.deviceName,    mono: false },
              { label: "Device model", value: deviceModel,         mono: true  },
            ].map(({ label, value, mono }) => (
              <div key={label}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                <p className={`text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`}>{value ?? "--"}</p>
              </div>
            ))}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Alarm type</p>
              <AlarmTypeBadge severity={alert.severity} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Fault code</p>
              <p className="text-sm font-medium font-mono text-foreground">{code}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Alarm source</p>
              <p className="text-sm font-medium text-foreground">System information</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Occurrence time</p>
              <p className="text-xs font-mono text-foreground tabular-nums">{fmtDateTime(alert.createdAt)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Recovery time</p>
              <p className="text-xs font-mono tabular-nums">
                {alert.resolvedAt
                  ? <span className="text-emerald-400">{fmtDateTime(alert.resolvedAt)}</span>
                  : <span className="text-amber-400 flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Active</span>
                }
              </p>
            </div>
          </div>

          <div className="w-full h-px bg-border/40" />

          {/* Fault cause */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Fault cause</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{kb.cause}</p>
          </div>

          {/* Suggestions */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Suggestions</h3>
            <div className="space-y-2">
              {kb.suggestions.length > 1 && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {alarmType(alert.severity) === "Fault"
                    ? "The inverter will attempt recovery once the fault condition clears. If the fault recurs:"
                    : "To resolve this condition:"}
                </p>
              )}
              <ol className="space-y-1.5">
                {kb.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-muted/40 border border-border/50 flex items-center justify-center text-[9px] font-bold text-foreground mt-0.5">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border/40 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg border border-border/60 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Parameter cell ────────────────────────────────────────────────────────────
function ParamCell({
  label, value, unit, highlight = false, trend, loading = false,
}: {
  label: string; value: string | number | null | undefined; unit?: string;
  highlight?: boolean; trend?: "up" | "down" | "flat" | "live"; loading?: boolean;
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
            {trend === "up"   && <TrendingUp   className="w-3 h-3 flex-shrink-0 text-emerald-400" />}
            {trend === "down" && <TrendingDown  className="w-3 h-3 flex-shrink-0 text-red-400" />}
            {trend === "live" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />}
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, collapsible = false, open = true, onToggle }: {
  title: string; collapsible?: boolean; open?: boolean; onToggle?: () => void;
}) {
  return (
    <button
      className={`w-full flex items-center justify-between px-4 py-2.5 bg-muted/20 border-b border-border/40 ${collapsible ? "cursor-pointer hover:bg-muted/30 transition-colors" : "cursor-default"}`}
      onClick={collapsible ? onToggle : undefined}
    >
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
      {collapsible && (open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />)}
    </button>
  );
}

function Tab({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon: React.FC<{ className?: string }>; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-all -mb-px ${
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  );
}

type TabId = "general" | "curve" | "fault" | "settings";

// ── Month options ─────────────────────────────────────────────────────────────
function getMonthOptions(): { value: string; label: string }[] {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    opts.push({ value, label });
  }
  return opts;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InverterDetail() {
  const { plantId, inverterId } = useParams();
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [range, setRange] = useState<"hour" | "day" | "week" | "month">("day");
  const [mpptOpen, setMpptOpen] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // Fault tab state
  const [selectedFault, setSelectedFault] = useState<any | null>(null);
  const [faultStatus, setFaultStatus] = useState<"pending" | "resolved">("pending");
  const [faultMonth, setFaultMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [alarmInput, setAlarmInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [alarmSearch, setAlarmSearch] = useState("");
  const [codeSearch, setCodeSearch] = useState("");
  const [faultPage, setFaultPage] = useState(1);
  const [faultPageSize, setFaultPageSize] = useState(20);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const { data: inv, isLoading, refetch } = useGetInverter(inverterId ?? "", {
    query: { enabled: !!inverterId, refetchInterval: 5_000, queryKey: getGetInverterQueryKey(inverterId ?? "") },
  });

  const { data: plant } = useGetPlant(plantId ?? "", {
    query: { enabled: !!plantId },
  });

  const { data: trend } = useGetInverterTrend(inverterId ?? "", { range }, {
    query: { enabled: !!inverterId && activeTab === "curve", queryKey: getGetInverterTrendQueryKey(inverterId ?? "", { range }) },
  });

  // Fault records fetch
  const statusParam = faultStatus === "pending" ? "open" : "resolved";
  const { data: rawAlerts = [], isLoading: alertsLoading } = useQuery<any[]>({
    queryKey: ["fault-alerts", plantId, statusParam],
    queryFn: async () => {
      const params = new URLSearchParams({ status: statusParam });
      if (plantId) params.set("plantId", plantId);
      const r = await fetch(`${BASE}api/alerts?${params}`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!plantId && activeTab === "fault",
    staleTime: 30_000,
    refetchInterval: activeTab === "fault" ? 60_000 : false,
  });

  // Client-side filter + month + search + pagination
  const filteredAlerts = useMemo(() => {
    let list = Array.isArray(rawAlerts) ? rawAlerts : [];
    // Month filter
    if (faultMonth) {
      const [y, m] = faultMonth.split("-").map(Number);
      list = list.filter(a => {
        const d = new Date(a.createdAt);
        return d.getFullYear() === y && (d.getMonth() + 1) === m;
      });
    }
    // Text search
    if (alarmSearch) list = list.filter(a => a.title?.toLowerCase().includes(alarmSearch.toLowerCase()));
    if (codeSearch) list = list.filter(a => String(faultCodeFor(a.title, a.severity)).includes(codeSearch));
    return list;
  }, [rawAlerts, faultMonth, alarmSearch, codeSearch]);

  const totalFaults = filteredAlerts.length;
  const totalPages = Math.max(1, Math.ceil(totalFaults / faultPageSize));
  const pagedAlerts = filteredAlerts.slice((faultPage - 1) * faultPageSize, faultPage * faultPageSize);

  const handleFaultSearch = () => {
    setAlarmSearch(alarmInput);
    setCodeSearch(codeInput);
    setFaultPage(1);
  };

  const handleFaultStatusChange = (s: "pending" | "resolved") => {
    setFaultStatus(s);
    setFaultPage(1);
  };

  const statusCfg = STATUS_CFG[inv?.status ?? "comm_lost"];
  const handleRefresh = () => { refetch(); setLastRefreshed(new Date()); };

  const fmt1 = (v?: number | null) => v != null ? v.toFixed(1) : "--";
  const fmt2 = (v?: number | null) => v != null ? v.toFixed(2) : "--";
  const fmt3 = (v?: number | null) => v != null ? v.toFixed(3) : "--";
  const fmtEnergy = (kwh?: number | null) => {
    if (kwh == null) return { value: "--", unit: "" };
    if (kwh >= 1000) return { value: (kwh / 1000).toFixed(3), unit: "MWh" };
    return { value: kwh.toFixed(1), unit: "kWh" };
  };
  const daily = fmtEnergy(inv?.dailyEnergyKwh);
  const lifetime = { value: inv?.lifetimeEnergyMwh != null ? inv.lifetimeEnergyMwh.toFixed(3) : "--", unit: "MWh" };

  const updateTime = lastRefreshed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <AppLayout>
      <div className="flex flex-col space-y-0 min-h-0">

        {/* ── Breadcrumb ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-4">
          <Link href="/"><button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-3 h-3" /> Portfolio</button></Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <Link href={`${BASE}plants/${plantId}`}><span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">{plant?.name ?? "Plant"}</span></Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <Link href={`${BASE}plants/${plantId}/inverters`}><span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">Device</span></Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <span className="text-xs text-foreground font-medium">{inv?.name ?? "Inverter"}</span>
        </div>

        {/* ── Device header ────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${statusCfg.bg} ${statusCfg.border}`}>
              <Zap className={`w-5 h-5 ${statusCfg.color}`} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">{inv?.name ?? "Inverter"}</h1>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                {plant?.name && <span>Plant: <span className="text-foreground">{plant.name}</span></span>}
                <span className="text-border">·</span>
                <span>Device model: <span className="text-foreground font-mono">TRB246</span></span>
              </div>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${inv?.status === "running" ? "animate-pulse" : ""}`} />
            {statusCfg.label}
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            Auto-refresh every 5s
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-0 border-b border-border/50 mb-0 overflow-x-auto">
          <Tab active={activeTab === "general"} onClick={() => setActiveTab("general")} icon={Info}>General information</Tab>
          <Tab active={activeTab === "fault"}   onClick={() => setActiveTab("fault")}   icon={AlertTriangle}>
            Fault
            {rawAlerts.length > 0 && activeTab !== "fault" && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold">
                {rawAlerts.length > 99 ? "99+" : rawAlerts.length}
              </span>
            )}
          </Tab>
          <Tab active={activeTab === "curve"}   onClick={() => setActiveTab("curve")}   icon={BarChart2}>Curve</Tab>
          <Tab active={activeTab === "settings"} onClick={() => setActiveTab("settings")} icon={Settings}>Settings</Tab>
        </div>

        {/* ══════════════ GENERAL INFORMATION tab ══════════════════════ */}
        {activeTab === "general" && (
          <div className="bg-card border border-border/60 rounded-b-xl rounded-tr-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/10">
              <h3 className="text-xs font-semibold text-foreground">Measuring point parameter</h3>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground">Data update time: {updateTime}</span>
                <button onClick={handleRefresh} className="p-1 rounded hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground" title="Refresh data">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <SectionHeader title="Overview" />
            <div className="grid grid-cols-3">
              <ParamCell label="Daily generation"       value={daily.value}              unit={daily.unit}  loading={isLoading} trend="live" highlight />
              <ParamCell label="Total active power"     value={fmt1(inv?.acPowerKw)}     unit="kW"          loading={isLoading} trend="live" highlight />
              <ParamCell label="Total DC power"         value={fmt1(inv?.dcPowerKw)}     unit="kW"          loading={isLoading} trend="live" />
              <ParamCell label="Operating status"       value={statusCfg.label}          loading={isLoading} />
              <ParamCell label="AC current (Phase A)"   value={fmt1(inv?.acCurrentA)}    unit="A"           loading={isLoading} trend="live" />
              <ParamCell label="DC current"             value={fmt1(inv?.dcCurrentA)}    unit="A"           loading={isLoading} trend="live" />
              <ParamCell label="Grid frequency"         value={fmt2(inv?.frequencyHz)}   unit="Hz"          loading={isLoading} trend="live" />
              <ParamCell label="AC line voltage"        value={fmt1(inv?.acVoltageV)}    unit="V"           loading={isLoading} trend="live" />
              <ParamCell label="DC voltage"             value={fmt1(inv?.dcVoltageV)}    unit="V"           loading={isLoading} trend="live" />
              <ParamCell label="Total power factor"     value={fmt3(inv?.powerFactor)}   loading={isLoading} trend="live" />
              <ParamCell label="Efficiency"             value={fmt1(inv?.efficiencyPct)} unit="%"           loading={isLoading} trend={(inv?.efficiencyPct ?? 100) > 95 ? "up" : "down"} />
              <ParamCell label="Internal temperature"   value={fmt1(inv?.temperatureC)}  unit="°C"          loading={isLoading} trend={(inv?.temperatureC ?? 0) > 60 ? "up" : "flat"} />
              <ParamCell label="Monthly generation"     value={fmtEnergy(inv?.monthlyEnergyKwh).value} unit={fmtEnergy(inv?.monthlyEnergyKwh).unit} loading={isLoading} />
              <ParamCell label="Total generation"       value={lifetime.value}           unit={lifetime.unit} loading={isLoading} />
              <ParamCell label="Plant capacity"         value={plant?.capacityKw != null ? (plant.capacityKw / 1000).toFixed(2) : "--"} unit="MWp" />
            </div>

            <SectionHeader title="MPPT / DC information" collapsible open={mpptOpen} onToggle={() => setMpptOpen(v => !v)} />
            {mpptOpen && (
              <div className="grid grid-cols-3">
                <ParamCell label="DC voltage"   value={fmt1(inv?.dcVoltageV)}    unit="V"  loading={isLoading} trend="live" />
                <ParamCell label="DC current"   value={fmt1(inv?.dcCurrentA)}    unit="A"  loading={isLoading} trend="live" />
                <ParamCell label="DC power"     value={fmt1(inv?.dcPowerKw)}     unit="kW" loading={isLoading} trend="live" highlight />
                <ParamCell label="Efficiency"   value={fmt1(inv?.efficiencyPct)} unit="%"  loading={isLoading} />
                <ParamCell label="DC/AC ratio"  value={inv?.dcPowerKw != null && inv?.acPowerKw != null && inv.acPowerKw > 0 ? (inv.dcPowerKw / inv.acPowerKw).toFixed(3) : "--"} loading={isLoading} />
                <ParamCell label="Internal temp" value={fmt1(inv?.temperatureC)}  unit="°C" loading={isLoading} />
              </div>
            )}

            <div className="flex items-center justify-between px-4 py-4 border-t border-border/40 bg-muted/5">
              <Link href={`${BASE}plants/${plantId}/inverters/${inverterId}/strings`}>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 hover:border-primary/50 transition-all">
                  <Layers className="w-3.5 h-3.5" /> String Diagnostics <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </Link>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/60 text-muted-foreground text-xs font-medium hover:bg-muted/30 hover:text-foreground transition-all">
                <Wrench className="w-3.5 h-3.5" /> Repair / Maintenance
              </button>
            </div>
          </div>
        )}

        {/* ══════════════ FAULT tab ════════════════════════════════════ */}
        {activeTab === "fault" && (
          <div className="bg-card border border-border/60 rounded-b-xl rounded-tr-xl overflow-hidden">

            {/* ── Filter bar ───────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/5">
              {/* Pending / Resolved toggle */}
              <div className="flex items-center rounded-lg border border-border/60 overflow-hidden text-xs font-medium">
                <button
                  onClick={() => handleFaultStatusChange("pending")}
                  className={`px-4 py-2 transition-all ${
                    faultStatus === "pending"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => handleFaultStatusChange("resolved")}
                  className={`px-4 py-2 transition-all border-l border-border/60 ${
                    faultStatus === "resolved"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                >
                  Resolved
                </button>
              </div>

              {/* Month picker */}
              <select
                value={faultMonth}
                onChange={e => { setFaultMonth(e.target.value); setFaultPage(1); }}
                className="h-8 px-3 rounded-lg border border-border/60 bg-muted/20 text-xs text-foreground focus:outline-none focus:border-primary/50 hover:border-border transition-colors"
              >
                {monthOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              {/* Alarm name search */}
              <input
                type="text"
                placeholder="Alarm name"
                value={alarmInput}
                onChange={e => setAlarmInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleFaultSearch()}
                className="h-8 px-3 rounded-lg border border-border/60 bg-muted/20 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 hover:border-border transition-colors w-36"
              />

              {/* Fault code search */}
              <input
                type="text"
                placeholder="Fault code"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleFaultSearch()}
                className="h-8 px-3 rounded-lg border border-border/60 bg-muted/20 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 hover:border-border transition-colors w-28"
              />

              {/* Search button */}
              <button
                onClick={handleFaultSearch}
                className="h-8 flex items-center gap-1.5 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Search className="w-3 h-3" /> Search
              </button>

              {/* Clear */}
              {(alarmSearch || codeSearch) && (
                <button
                  onClick={() => { setAlarmInput(""); setCodeInput(""); setAlarmSearch(""); setCodeSearch(""); setFaultPage(1); }}
                  className="h-8 px-3 rounded-lg border border-border/60 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
                >
                  Clear
                </button>
              )}
            </div>

            {/* ── Table ────────────────────────────────────────────── */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/10">
                    {["Alarm name", "Alarm type", "Fault code", "Device name", "Device model", "Reporter", "Occurrence time", "Recovery time", "Action"].map(col => (
                      <th key={col} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alertsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/30">
                        {Array.from({ length: 9 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-muted/30 rounded animate-pulse" style={{ width: `${40 + (j * 13) % 50}%` }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : pagedAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16 text-muted-foreground">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-muted/20 border border-border/40 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-muted-foreground/40" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground mb-0.5">No records found</p>
                            <p className="text-xs text-muted-foreground">
                              No {faultStatus === "pending" ? "pending" : "resolved"} fault records for{" "}
                              {monthOptions.find(o => o.value === faultMonth)?.label ?? faultMonth}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedAlerts.map((alert: any, idx: number) => (
                      <tr
                        key={alert.id ?? idx}
                        className="border-b border-border/30 hover:bg-muted/10 transition-colors group"
                      >
                        <td className="px-4 py-3 font-medium text-foreground max-w-[200px]">
                          <span className="block truncate" title={alert.title}>{alert.title}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <AlarmTypeBadge severity={alert.severity} />
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {faultCodeFor(alert.title, alert.severity)}
                        </td>
                        <td className="px-4 py-3 text-foreground whitespace-nowrap">
                          {alert.deviceName ?? inv?.name ?? "--"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono whitespace-nowrap">
                          TRB246
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          system
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap tabular-nums">
                          {fmtDateTime(alert.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap tabular-nums">
                          {alert.resolvedAt ? fmtDateTime(alert.resolvedAt) : (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                              alert.severity === "critical" || alert.severity === "major" ? "text-red-400" : "text-amber-400"
                            }`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            title="View fault details"
                            onClick={() => setSelectedFault(alert)}
                            className="p-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ───────────────────────────────────────── */}
            {!alertsLoading && totalFaults > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-muted/5">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Total <span className="text-foreground font-medium">{totalFaults}</span></span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={faultPageSize}
                      onChange={e => { setFaultPageSize(Number(e.target.value)); setFaultPage(1); }}
                      className="h-7 px-2 rounded border border-border/60 bg-muted/20 text-xs text-foreground focus:outline-none"
                    >
                      {[10, 20, 50].map(n => <option key={n} value={n}>{n}/page</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setFaultPage(p => Math.max(1, p - 1))}
                    disabled={faultPage === 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const p = totalPages <= 5
                      ? i + 1
                      : faultPage <= 3
                        ? i + 1
                        : faultPage >= totalPages - 2
                          ? totalPages - 4 + i
                          : faultPage - 2 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setFaultPage(p)}
                        className={`w-7 h-7 flex items-center justify-center rounded border text-xs font-medium transition-all ${
                          p === faultPage
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setFaultPage(p => Math.min(totalPages, p + 1))}
                    disabled={faultPage === totalPages}
                    className="w-7 h-7 flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1.5 ml-2 text-xs text-muted-foreground">
                    Go to
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={faultPage}
                      onChange={e => {
                        const v = Number(e.target.value);
                        if (v >= 1 && v <= totalPages) setFaultPage(v);
                      }}
                      className="w-12 h-7 px-2 rounded border border-border/60 bg-muted/20 text-xs text-center text-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ CURVE tab ════════════════════════════════════ */}
        {activeTab === "curve" && (
          <div className="bg-card border border-border/60 rounded-b-xl rounded-tr-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/10">
              <h3 className="text-xs font-semibold">Power Generation Trend</h3>
              <div className="flex items-center bg-muted/30 rounded-lg border border-border/50 p-0.5 gap-0.5">
                {(["hour", "day", "week", "month"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      range === r ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 border-b border-border/40">
              {[
                { label: "AC Power",    value: `${fmt1(inv?.acPowerKw)} kW`,    color: "text-emerald-400" },
                { label: "DC Power",    value: `${fmt1(inv?.dcPowerKw)} kW`,    color: "text-amber-400" },
                { label: "Efficiency",  value: `${fmt1(inv?.efficiencyPct)}%`,   color: "text-primary" },
                { label: "Temperature", value: `${fmt1(inv?.temperatureC)} °C`,  color: "text-foreground" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex flex-col items-center py-3 border-r border-border/40 last:border-r-0">
                  <span className="text-[10px] text-muted-foreground mb-1">{label}</span>
                  <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>
                </div>
              ))}
            </div>
            <div className="px-4 pt-4 pb-5">
              {trend && trend.length > 0 ? (
                <>
                  <SvgAreaChart
                    data={(trend as unknown as Record<string, unknown>[])}
                    xKey="timestamp"
                    series={[
                      { key: "acPowerKw", name: "AC Power", color: "hsl(142 71% 45%)" },
                      { key: "dcPowerKw", name: "DC Power", color: "hsl(38 92% 50%)", dashed: true },
                    ]}
                    height={280}
                    yFmt={(v) => `${v.toFixed(0)} kW`}
                    xFmt={(t) => {
                      const d = new Date(t);
                      if (range === "hour" || range === "day") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      return d.toLocaleDateString([], { month: "short", day: "numeric" });
                    }}
                  />
                  <div className="flex gap-5 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-0.5 bg-emerald-500 rounded" /> AC Power</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t border-dashed border-amber-400" /> DC Power</span>
                  </div>
                </>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Loading trend data…</div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════ SETTINGS tab ═════════════════════════════════ */}
        {activeTab === "settings" && (
          <div className="bg-card border border-border/60 rounded-b-xl rounded-tr-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border/40 bg-muted/10">
              <h3 className="text-xs font-semibold">Device Settings</h3>
            </div>
            <div className="grid grid-cols-3">
              <ParamCell label="Inverter ID"     value={inv?.id} />
              <ParamCell label="Protocol"        value="MQTT / Modbus TCP" />
              <ParamCell label="Firmware"        value="TRB2M_R_00.07.22.1" />
              <ParamCell label="Poll interval"   value="5" unit="s" />
              <ParamCell label="Plant"           value={plant?.name} />
              <ParamCell label="Rated capacity"  value={plant?.capacityKw != null ? (plant.capacityKw / 1000).toFixed(2) : "--"} unit="MWp" />
            </div>
            <div className="px-4 py-4 border-t border-border/40">
              <Link href={`/devices/${inverterId}`}>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all">
                  <Settings className="w-3.5 h-3.5" /> Advanced Device Settings <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </Link>
            </div>
          </div>
        )}

      </div>

      {/* ── Fault detail modal ──────────────────────────────────────── */}
      {selectedFault && (
        <FaultDetailModal
          alert={selectedFault}
          deviceModel="TRB246"
          onClose={() => setSelectedFault(null)}
        />
      )}
    </AppLayout>
  );
}
