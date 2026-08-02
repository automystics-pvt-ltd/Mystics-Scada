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
const STATUS_CFG: Record<InverterStatus, { label: string; color: string; bg: string; border: string; dot: string; shadow: string }> = {
  running:   { label: "Grid-connected operation", color: "text-status-normal", bg: "bg-status-normal/10", border: "border-status-normal/30", dot: "bg-status-normal", shadow: "shadow-[0_0_15px_hsl(var(--status-normal)/0.15)]" },
  standby:   { label: "Standby",                  color: "text-status-warning",   bg: "bg-status-warning/10",   border: "border-status-warning/30",   dot: "bg-status-warning", shadow: "shadow-[0_0_15px_hsl(var(--status-warning)/0.15)]" },
  fault:     { label: "Fault",                     color: "text-status-fault",     bg: "bg-status-fault/10",     border: "border-status-fault/30",     dot: "bg-status-fault", shadow: "shadow-[0_0_15px_hsl(var(--status-fault)/0.15)]" },
  comm_lost: { label: "Communication lost",        color: "text-muted-foreground",   bg: "bg-muted/50",   border: "border-border/50",   dot: "bg-muted-foreground", shadow: "" },
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
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest bg-status-fault/15 text-status-fault border border-status-fault/30 shadow-[0_0_10px_hsl(var(--status-fault)/0.1)]">
      <TriangleAlert className="w-3 h-3" /> Fault
    </span>
  );
  if (t === "Alarm") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest bg-[#e67e22]/15 text-[#e67e22] border border-[#e67e22]/30 shadow-[0_0_10px_rgba(230,126,34,0.1)]">
      <Bell className="w-3 h-3" /> Alarm
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest bg-accent-brand/15 text-accent-brand border border-accent-brand/30 shadow-[0_0_10px_hsl(var(--accent-brand)/0.1)]">
      <Info className="w-3 h-3" /> Info
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
    <div className="flex flex-col gap-1.5 px-5 py-4 border-b border-r border-border/40 last:border-r-0 bg-card/20 hover:bg-card/40 transition-colors">
      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-tight truncate">{label}</span>
      <div className="flex items-baseline gap-1.5 min-h-[1.5rem]">
        {loading ? (
          <div className="h-6 w-20 bg-muted/40 rounded animate-shimmer" />
        ) : (
          <>
            <span className={`text-lg font-mono font-bold tabular-nums tracking-tighter ${highlight ? "text-status-normal shadow-[0_0_10px_hsl(var(--status-normal)/0.2)]" : "text-foreground"}`}>
              {value ?? "--"}
            </span>
            {unit && <span className="text-[10px] font-semibold text-muted-foreground font-sans">{unit}</span>}
            {trend === "up"   && <TrendingUp   className="w-3.5 h-3.5 flex-shrink-0 text-status-normal ml-1" />}
            {trend === "down" && <TrendingDown  className="w-3.5 h-3.5 flex-shrink-0 text-status-fault ml-1" />}
            {trend === "live" && <span className="inline-block w-2 h-2 rounded-full bg-status-normal shadow-[0_0_5px_hsl(var(--status-normal))] animate-pulse flex-shrink-0 ml-1" />}
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
      className={`w-full flex items-center justify-between px-5 py-3 bg-muted/10 border-b border-border/50 ${collapsible ? "cursor-pointer hover:bg-muted/30 transition-colors" : "cursor-default"}`}
      onClick={collapsible ? onToggle : undefined}
    >
      <span className="text-[10px] font-bold text-foreground uppercase tracking-widest">{title}</span>
      {collapsible && (open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
    </button>
  );
}

function Tab({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon: React.FC<{ className?: string }>; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap border-b-2 transition-all -mb-px ${
        active ? "border-accent-brand text-accent-brand bg-accent-brand/5" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30"
      }`}
    >
      <Icon className="w-4 h-4" />
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
        <div className="flex items-center gap-2 mb-6">
          <Link href="/"><button className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-3.5 h-3.5" /> Portfolio</button></Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <Link href={`${BASE}plants/${plantId}`}><span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground cursor-pointer transition-colors">{plant?.name ?? "Plant"}</span></Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <Link href={`${BASE}plants/${plantId}/inverters`}><span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground cursor-pointer transition-colors">Inverters</span></Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-foreground">{inv?.name ?? "Device"}</span>
        </div>

        {/* ── Device header ────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start gap-4 mb-6 animate-fade-up">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${statusCfg.bg} ${statusCfg.border} ${statusCfg.shadow}`}>
              <Zap className={`w-6 h-6 ${statusCfg.color}`} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">{inv?.name ?? "Inverter"}</h1>
              <div className="flex items-center gap-2 mt-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {plant?.name && <span>Plant: <span className="text-foreground">{plant.name}</span></span>}
                <span className="text-border">·</span>
                <span>Device model: <span className="text-foreground font-mono">TRB246</span></span>
              </div>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border} ${statusCfg.shadow}`}>
            <span className={`w-2 h-2 rounded-full ${statusCfg.dot} ${inv?.status === "running" ? "animate-pulse" : ""}`} />
            {statusCfg.label}
          </div>
          <div className="ml-auto flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-accent-brand bg-accent-brand/10 px-3 py-1.5 rounded-lg border border-accent-brand/20">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            LIVE SYNC
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-b border-border/50 mb-6 overflow-x-auto animate-fade-up" style={{ animationDelay: '50ms' }}>
          <Tab active={activeTab === "general"} onClick={() => setActiveTab("general")} icon={Info}>General information</Tab>
          <Tab active={activeTab === "fault"}   onClick={() => setActiveTab("fault")}   icon={AlertTriangle}>
            Fault
            {rawAlerts.length > 0 && activeTab !== "fault" && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-status-fault/20 text-status-fault text-[10px] font-bold border border-status-fault/30">
                {rawAlerts.length > 99 ? "99+" : rawAlerts.length}
              </span>
            )}
          </Tab>
          <Tab active={activeTab === "curve"}   onClick={() => setActiveTab("curve")}   icon={BarChart2}>Curve</Tab>
          <Tab active={activeTab === "settings"} onClick={() => setActiveTab("settings")} icon={Settings}>Settings</Tab>
        </div>

        {/* ══════════════ GENERAL INFORMATION tab ══════════════════════ */}
        {activeTab === "general" && (
          <div className="bg-card/40 backdrop-blur-md border border-card-border rounded-b-xl rounded-tr-xl overflow-hidden shadow-sm animate-fade-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-muted/10">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-widest">Measuring point parameter</h3>
              <div className="flex items-center gap-4">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest bg-card border border-border/50 px-3 py-1.5 rounded-lg shadow-sm">Data update time: <span className="text-foreground font-mono">{updateTime}</span></span>
                <button onClick={handleRefresh} className="p-2 rounded-lg bg-card border border-border/50 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground shadow-sm" title="Refresh data">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            <SectionHeader title="Overview" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 bg-card/20">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 bg-card/20 border-b border-border/50">
                <ParamCell label="DC voltage"   value={fmt1(inv?.dcVoltageV)}    unit="V"  loading={isLoading} trend="live" />
                <ParamCell label="DC current"   value={fmt1(inv?.dcCurrentA)}    unit="A"  loading={isLoading} trend="live" />
                <ParamCell label="DC power"     value={fmt1(inv?.dcPowerKw)}     unit="kW" loading={isLoading} trend="live" highlight />
                <ParamCell label="Efficiency"   value={fmt1(inv?.efficiencyPct)} unit="%"  loading={isLoading} />
                <ParamCell label="DC/AC ratio"  value={inv?.dcPowerKw != null && inv?.acPowerKw != null && inv.acPowerKw > 0 ? (inv.dcPowerKw / inv.acPowerKw).toFixed(3) : "--"} loading={isLoading} />
                <ParamCell label="Internal temp" value={fmt1(inv?.temperatureC)}  unit="°C" loading={isLoading} />
              </div>
            )}

            <div className="flex items-center justify-between px-5 py-5 border-t border-border/40 bg-muted/10">
              <Link href={`${BASE}plants/${plantId}/inverters/${inverterId}/strings`}>
                <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-accent-brand/30 bg-accent-brand/10 text-accent-brand text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/20 hover:border-accent-brand/50 transition-all shadow-sm">
                  <Layers className="w-4 h-4" /> String Diagnostics <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border/60 bg-card shadow-sm text-muted-foreground text-[10px] font-bold uppercase tracking-widest hover:bg-muted/30 hover:text-foreground transition-all">
                <Wrench className="w-4 h-4" /> Repair / Maintenance
              </button>
            </div>
          </div>
        )}

        {/* ══════════════ FAULT tab ════════════════════════════════════ */}
        {activeTab === "fault" && (
          <div className="bg-card/40 backdrop-blur-md border border-card-border rounded-b-xl rounded-tr-xl overflow-hidden shadow-sm animate-fade-up" style={{ animationDelay: '100ms' }}>

            {/* ── Filter bar ───────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border/50 bg-muted/10">
              {/* Pending / Resolved toggle */}
              <div className="flex items-center rounded-lg border border-border/50 overflow-hidden text-[10px] font-bold uppercase tracking-widest bg-card shadow-sm">
                <button
                  onClick={() => handleFaultStatusChange("pending")}
                  className={`px-5 py-2.5 transition-all ${
                    faultStatus === "pending"
                      ? "bg-accent-brand/10 text-accent-brand"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => handleFaultStatusChange("resolved")}
                  className={`px-5 py-2.5 transition-all border-l border-border/50 ${
                    faultStatus === "resolved"
                      ? "bg-accent-brand/10 text-accent-brand"
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
                className="h-10 px-4 rounded-lg border border-border/50 bg-card text-[10px] font-bold uppercase tracking-widest text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 hover:border-border transition-colors shadow-sm"
              >
                {monthOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              {/* Alarm name search */}
              <input
                type="text"
                placeholder="ALARM NAME"
                value={alarmInput}
                onChange={e => setAlarmInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleFaultSearch()}
                className="h-10 px-4 rounded-lg border border-border/50 bg-card text-[10px] font-bold uppercase tracking-widest text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 hover:border-border transition-colors w-48 shadow-sm"
              />

              {/* Fault code search */}
              <input
                type="text"
                placeholder="FAULT CODE"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleFaultSearch()}
                className="h-10 px-4 rounded-lg border border-border/50 bg-card text-[10px] font-bold uppercase tracking-widest text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 hover:border-border transition-colors w-32 shadow-sm"
              />

              {/* Search button */}
              <button
                onClick={handleFaultSearch}
                className="h-10 flex items-center gap-2 px-5 rounded-lg bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 transition-colors shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]"
              >
                <Search className="w-3.5 h-3.5" /> Search
              </button>

              {/* Clear */}
              {(alarmSearch || codeSearch) && (
                <button
                  onClick={() => { setAlarmInput(""); setCodeInput(""); setAlarmSearch(""); setCodeSearch(""); setFaultPage(1); }}
                  className="h-10 px-4 rounded-lg border border-border/50 bg-card shadow-sm text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
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
                      <th key={col} className="px-5 py-3.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alertsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/30 bg-card/20">
                        {Array.from({ length: 9 }).map((_, j) => (
                          <td key={j} className="px-5 py-4">
                            <div className="h-4 bg-muted/30 rounded animate-shimmer" style={{ width: `${40 + (j * 13) % 50}%` }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : pagedAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-20 text-muted-foreground bg-card/20">
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border/40 flex items-center justify-center border-dashed">
                            <AlertTriangle className="w-6 h-6 text-muted-foreground/40" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground mb-1 uppercase tracking-wider">No records found</p>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
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
                        className="border-b border-border/30 hover:bg-muted/30 transition-colors group bg-card/20"
                      >
                        <td className="px-5 py-4 font-bold text-foreground max-w-[200px] truncate group-hover:text-accent-brand transition-colors" title={alert.title}>
                          {alert.title}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <AlarmTypeBadge severity={alert.severity} />
                        </td>
                        <td className="px-5 py-4 font-mono font-bold text-muted-foreground">
                          {faultCodeFor(alert.title, alert.severity)}
                        </td>
                        <td className="px-5 py-4 text-foreground whitespace-nowrap font-medium">
                          {alert.deviceName ?? inv?.name ?? "--"}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground font-mono font-bold whitespace-nowrap text-[10px]">
                          TRB246
                        </td>
                        <td className="px-5 py-4 text-muted-foreground whitespace-nowrap text-[10px] font-bold uppercase tracking-widest">
                          SYSTEM
                        </td>
                        <td className="px-5 py-4 text-muted-foreground whitespace-nowrap tabular-nums font-mono">
                          {fmtDateTime(alert.createdAt)}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground whitespace-nowrap tabular-nums font-mono">
                          {alert.resolvedAt ? fmtDateTime(alert.resolvedAt) : (
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${
                              alert.severity === "critical" || alert.severity === "major" ? "text-status-fault" : "text-status-warning"
                            }`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shadow-[0_0_5px_currentColor]" />
                              ACTIVE
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <button
                            title="View fault details"
                            onClick={() => setSelectedFault(alert)}
                            className="p-2 rounded-lg border border-border/50 bg-card text-muted-foreground hover:text-accent-brand hover:border-accent-brand/40 hover:bg-accent-brand/10 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                          >
                            <FileText className="w-4 h-4" />
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
              <div className="flex items-center justify-between px-5 py-4 border-t border-border/50 bg-muted/10">
                <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <span>Total <span className="text-foreground font-mono bg-card px-2 py-1 rounded border border-border/50">{totalFaults}</span></span>
                  <div className="flex items-center gap-2">
                    <select
                      value={faultPageSize}
                      onChange={e => { setFaultPageSize(Number(e.target.value)); setFaultPage(1); }}
                      className="h-8 px-2 rounded-lg border border-border/50 bg-card text-[10px] font-bold uppercase tracking-widest text-foreground focus:outline-none focus:border-accent-brand/50 hover:border-border transition-colors shadow-sm"
                    >
                      {[10, 20, 50].map(n => <option key={n} value={n}>{n}/page</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFaultPage(p => Math.max(1, p - 1))}
                    disabled={faultPage === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all bg-card shadow-sm"
                  >
                    <ChevronLeft className="w-4 h-4" />
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
                        className={`w-8 h-8 flex items-center justify-center rounded-lg border text-[10px] font-bold transition-all shadow-sm ${
                          p === faultPage
                            ? "bg-accent-brand text-background border-accent-brand"
                            : "border-border/50 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/30"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setFaultPage(p => Math.min(totalPages, p + 1))}
                    disabled={faultPage === totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all bg-card shadow-sm"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-2 ml-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    GO TO
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={faultPage}
                      onChange={e => {
                        const v = Number(e.target.value);
                        if (v >= 1 && v <= totalPages) setFaultPage(v);
                      }}
                      className="w-14 h-8 px-2 rounded-lg border border-border/50 bg-card text-[10px] font-bold text-center text-foreground focus:outline-none focus:border-accent-brand/50 shadow-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ CURVE tab ════════════════════════════════════ */}
        {activeTab === "curve" && (
          <div className="bg-card/40 backdrop-blur-md border border-card-border rounded-b-xl rounded-tr-xl overflow-hidden shadow-sm animate-fade-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-muted/10">
              <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Power Generation Trend</h3>
              <div className="flex items-center bg-card rounded-lg border border-border/50 p-1 shadow-sm gap-1">
                {(["hour", "day", "week", "month"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${
                      range === r ? "bg-accent-brand/10 shadow-sm text-accent-brand" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 border-b border-border/50 bg-card/20">
              {[
                { label: "AC Power",    value: `${fmt1(inv?.acPowerKw)} kW`,    color: "text-status-normal" },
                { label: "DC Power",    value: `${fmt1(inv?.dcPowerKw)} kW`,    color: "text-status-warning" },
                { label: "Efficiency",  value: `${fmt1(inv?.efficiencyPct)}%`,   color: "text-accent-brand" },
                { label: "Temperature", value: `${fmt1(inv?.temperatureC)} °C`,  color: "text-foreground" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex flex-col items-center py-4 border-r border-border/50 last:border-r-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</span>
                  <span className={`text-lg font-mono font-bold tabular-nums tracking-tighter ${color}`}>{value}</span>
                </div>
              ))}
            </div>
            <div className="px-5 pt-5 pb-6 bg-card/20">
              {trend && trend.length > 0 ? (
                <>
                  <SvgAreaChart
                    data={(trend as unknown as Record<string, unknown>[])}
                    xKey="timestamp"
                    series={[
                      { key: "acPowerKw", name: "AC Power", color: "hsl(var(--status-normal))" },
                      { key: "dcPowerKw", name: "DC Power", color: "hsl(var(--status-warning))", dashed: true },
                    ]}
                    height={320}
                    yFmt={(v) => `${v.toFixed(0)} kW`}
                  />
                  <div className="flex gap-6 mt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground justify-center">
                    <span className="flex items-center gap-2"><span className="inline-block w-4 h-1 bg-status-normal rounded-full shadow-[0_0_5px_hsl(var(--status-normal))]" /> AC Power</span>
                    <span className="flex items-center gap-2"><span className="inline-block w-4 border-t-2 border-dashed border-status-warning" /> DC Power</span>
                  </div>
                </>
              ) : (
                <div className="h-72 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground border border-dashed border-border/50 rounded-xl">Loading trend data…</div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════ SETTINGS tab ═════════════════════════════════ */}
        {activeTab === "settings" && (
          <div className="bg-card/40 backdrop-blur-md border border-card-border rounded-b-xl rounded-tr-xl overflow-hidden shadow-sm animate-fade-up" style={{ animationDelay: '100ms' }}>
            <div className="px-5 py-4 border-b border-border/50 bg-muted/10">
              <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Device Settings</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 bg-card/20">
              <ParamCell label="Inverter ID"     value={inv?.id} />
              <ParamCell label="Protocol"        value="MQTT / Modbus TCP" />
              <ParamCell label="Firmware"        value="TRB2M_R_00.07.22.1" />
              <ParamCell label="Poll interval"   value="5" unit="s" />
              <ParamCell label="Plant"           value={plant?.name} />
              <ParamCell label="Rated capacity"  value={plant?.capacityKw != null ? (plant.capacityKw / 1000).toFixed(2) : "--"} unit="MWp" />
            </div>
            <div className="px-5 py-5 border-t border-border/50 bg-muted/10 flex justify-end">
              <Link href={`/devices/${inverterId}`}>
                <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border/60 bg-card shadow-sm text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all">
                  <Settings className="w-4 h-4" /> Advanced Device Settings <ArrowRight className="w-4 h-4" />
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
