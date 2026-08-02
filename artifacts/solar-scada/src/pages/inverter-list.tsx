import { useState, useMemo } from "react";
import {
  useListInverters,
  useGetPlant,
  getListInvertersQueryKey,
  type InverterStatus,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams, useLocation } from "wouter";
import {
  Cpu, Zap, Thermometer, TrendingUp, LayoutGrid, List,
  Search, ChevronRight, Wifi, WifiOff, AlertTriangle,
  Clock, BarChart2, Sun, Activity, Filter, MoreVertical,
  CheckCircle2, XCircle, PauseCircle, Radio, ArrowLeft,
  Network, Layers, CloudLightning, BarChart4,
} from "lucide-react";
import { usePlantTelemetryStream, type LiveInverter } from "@/hooks/usePlantTelemetryStream";

const BASE = import.meta.env.BASE_URL as string;

// ── Sub-navigation (same as plant-dashboard) ─────────────────────────────────
const SUB_NAV = (plantId: string) => [
  { name: "Overview",   href: `${BASE}plants/${plantId}`,                icon: null },
  { name: "SLD",        href: `${BASE}plants/${plantId}/sld`,            icon: Network },
  { name: "Zones",      href: `${BASE}plants/${plantId}/zones`,          icon: Layers },
  { name: "Inverters",  href: `${BASE}plants/${plantId}/inverters`,      icon: Cpu },
  { name: "Weather",    href: `${BASE}plants/${plantId}/weather`,        icon: CloudLightning },
  { name: "Analytics",  href: `${BASE}plants/${plantId}/analytics`,      icon: BarChart4 },
];

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG: Record<InverterStatus, {
  label: string;
  color: string;
  bg: string;
  border: string;
  glow: string;
  dot: string;
  icon: React.FC<{ className?: string }>;
  pulse: boolean;
}> = {
  running: {
    label: "Running",
    color: "text-status-normal",
    bg: "bg-status-normal/10",
    border: "border-status-normal/30",
    glow: "shadow-[0_0_10px_hsl(var(--status-normal)/0.15)]",
    dot: "bg-status-normal shadow-[0_0_5px_hsl(var(--status-normal))]",
    icon: CheckCircle2,
    pulse: true,
  },
  standby: {
    label: "Standby",
    color: "text-status-warning",
    bg: "bg-status-warning/10",
    border: "border-status-warning/30",
    glow: "shadow-[0_0_10px_hsl(var(--status-warning)/0.1)]",
    dot: "bg-status-warning",
    icon: PauseCircle,
    pulse: false,
  },
  fault: {
    label: "Fault",
    color: "text-status-fault",
    bg: "bg-status-fault/10",
    border: "border-status-fault/30",
    glow: "shadow-[0_0_10px_hsl(var(--status-fault)/0.15)]",
    dot: "bg-status-fault shadow-[0_0_5px_hsl(var(--status-fault))]",
    icon: XCircle,
    pulse: false,
  },
  comm_lost: {
    label: "Offline",
    color: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-border/50",
    glow: "",
    dot: "bg-muted-foreground",
    icon: WifiOff,
    pulse: false,
  },
};

type ViewMode = "grid" | "list";
type StatusFilter = "all" | InverterStatus;

// ── Merge polled + live SSE data ──────────────────────────────────────────────
function mergeInverters(polled: any[] | undefined, live: LiveInverter[] | undefined): any[] {
  if (!polled?.length) return [];
  if (!live?.length) return polled;
  const map = new Map(live.map((l) => [l.index, l]));
  return polled.map((inv) => {
    const l = map.get(inv.index);
    return l ? { ...inv, ...l } : inv;
  });
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${color}`}>
      <span className="tabular-nums font-mono text-xs">{count}</span>
      <span className="opacity-80">{label}</span>
    </div>
  );
}

// ── Inverter Card ─────────────────────────────────────────────────────────────
function InverterCard({ inv, plantId }: { inv: any; plantId: string }) {
  const cfg = STATUS_CFG[inv.status as InverterStatus] ?? STATUS_CFG.comm_lost;
  const StatusIcon = cfg.icon;
  const capacityKw = 5; // nominal per inverter — used for power bar
  const powerPct = Math.min(100, Math.max(0, ((inv.acPowerKw ?? 0) / capacityKw) * 100));
  const energyMwh = ((inv.dailyEnergyKwh ?? 0) / 1000).toFixed(3);

  return (
    <Link href={`${BASE}plants/${plantId}/inverters/${inv.id}`}>
      <div
        className={`
          group relative flex flex-col rounded-xl border bg-card/40 backdrop-blur-md cursor-pointer
          transition-all duration-300
          hover:border-accent-brand/40 hover:bg-accent-brand/5 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5
          ${cfg.border} ${cfg.glow} overflow-hidden
        `}
      >
        {/* Active left bar */}
        <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${cfg.pulse ? "bg-status-normal" : inv.status === 'fault' ? "bg-status-fault" : inv.status === 'standby' ? "bg-status-warning" : "bg-transparent group-hover:bg-accent-brand"}`} />

        {/* Card header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 min-w-0 pl-1">
            {/* Status dot */}
            <div className="relative flex-shrink-0 mt-0.5">
              <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              {cfg.pulse && (
                <div className={`absolute inset-0 rounded-full ${cfg.dot} animate-ping opacity-60`} />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-foreground truncate leading-tight group-hover:text-accent-brand transition-colors">
                {inv.name}
              </h3>
              <p className="text-[9px] text-muted-foreground font-mono mt-1 truncate uppercase tracking-widest">
                SN: {inv.serialNumber ?? inv.id.slice(0, 12).toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Connection icon */}
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${cfg.bg}`}>
              {inv.status === "comm_lost" ? (
                <WifiOff className={`w-3.5 h-3.5 ${cfg.color}`} />
              ) : (
                <Zap className={`w-3.5 h-3.5 ${cfg.color}`} />
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-border/50" />

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-0 px-5 py-4 pl-6">
          <div className="pr-4 border-r border-border/50">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Daily Gen</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-foreground tabular-nums tracking-tighter">{energyMwh}</span>
              <span className="text-[10px] font-semibold text-muted-foreground">MWh</span>
            </div>
          </div>
          <div className="pl-4">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">AC Power</p>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl font-bold font-mono tabular-nums tracking-tighter ${inv.status === "running" ? "text-status-normal" : "text-foreground"}`}>
                {(inv.acPowerKw ?? 0).toFixed(2)}
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground">kW</span>
            </div>
          </div>
        </div>

        {/* Power utilisation bar */}
        <div className="px-5 pb-2 pl-6">
          <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
            <span>Utilisation</span>
            <span className="tabular-nums">{powerPct.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                powerPct > 80 ? "bg-status-normal shadow-[0_0_8px_hsl(var(--status-normal)/0.8)]" : powerPct > 40 ? "bg-status-warning shadow-[0_0_8px_hsl(var(--status-warning)/0.8)]" : "bg-muted-foreground"
              }`}
              style={{ width: `${powerPct}%` }}
            />
          </div>
        </div>

        {/* Secondary metrics row */}
        <div className="grid grid-cols-3 gap-0 border-t border-border/50 mt-4 bg-muted/10">
          <div className="flex flex-col items-center py-3 border-r border-border/50">
            <Activity className="w-3.5 h-3.5 text-muted-foreground mb-1.5" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Efficiency</span>
            <span className="text-xs font-mono font-bold text-foreground mt-0.5">
              {(inv.efficiencyPct ?? 0).toFixed(1)}%
            </span>
          </div>
          <div className="flex flex-col items-center py-3 border-r border-border/50">
            <Thermometer className="w-3.5 h-3.5 text-muted-foreground mb-1.5" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Temp</span>
            <span className={`text-xs font-mono font-bold mt-0.5 ${(inv.temperatureC ?? 0) > 65 ? "text-status-warning" : "text-foreground"}`}>
              {(inv.temperatureC ?? 0).toFixed(0)}°C
            </span>
          </div>
          <div className="flex flex-col items-center py-3">
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground mb-1.5" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">DC Power</span>
            <span className="text-xs font-mono font-bold text-foreground mt-0.5">
              {(inv.dcPowerKw ?? 0).toFixed(1)} <span className="text-[9px] text-muted-foreground font-sans">kW</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── List row ──────────────────────────────────────────────────────────────────
function InverterRow({ inv, plantId }: { inv: any; plantId: string }) {
  const cfg = STATUS_CFG[inv.status as InverterStatus] ?? STATUS_CFG.comm_lost;
  const StatusIcon = cfg.icon;

  return (
    <Link href={`${BASE}plants/${plantId}/inverters/${inv.id}`}>
      <div className={`
        group flex items-center gap-4 px-5 py-4 border-b border-border/50 last:border-0
        hover:bg-muted/30 cursor-pointer transition-colors relative overflow-hidden
      `}>
        <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${cfg.pulse ? "bg-status-normal" : inv.status === 'fault' ? "bg-status-fault" : inv.status === 'standby' ? "bg-status-warning" : "bg-transparent group-hover:bg-accent-brand"}`} />

        {/* Status dot */}
        <div className="relative flex-shrink-0 ml-2">
          <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
          {cfg.pulse && <div className={`absolute inset-0 rounded-full ${cfg.dot} animate-ping opacity-60`} />}
        </div>

        {/* Name + S/N */}
        <div className="flex-1 min-w-0 pl-2">
          <p className="text-sm font-bold text-foreground truncate group-hover:text-accent-brand transition-colors">{inv.name}</p>
          <p className="text-[10px] text-muted-foreground font-mono truncate uppercase tracking-widest mt-0.5">
            S/N: {inv.serialNumber ?? inv.id.slice(0, 12).toUpperCase()}
          </p>
        </div>

        {/* Status */}
        <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${cfg.bg} ${cfg.color} border ${cfg.border} w-28 justify-center`}>
          <StatusIcon className="w-3 h-3" />
          {cfg.label}
        </span>

        {/* Metrics */}
        <div className="hidden md:flex items-center gap-10 tabular-nums text-sm">
          <div className="text-right w-24">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Power</p>
            <p className={`font-mono font-bold tracking-tighter ${inv.status === "running" ? "text-status-normal" : "text-foreground"}`}>
              {(inv.acPowerKw ?? 0).toFixed(2)} <span className="text-[10px] font-semibold text-muted-foreground font-sans">kW</span>
            </p>
          </div>
          <div className="text-right w-24">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Daily Gen.</p>
            <p className="font-mono font-bold text-foreground tracking-tighter">
              {((inv.dailyEnergyKwh ?? 0) / 1000).toFixed(3)} <span className="text-[10px] font-semibold text-muted-foreground font-sans">MWh</span>
            </p>
          </div>
          <div className="text-right w-20">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Efficiency</p>
            <p className="font-mono font-bold text-foreground tracking-tighter">{(inv.efficiencyPct ?? 0).toFixed(1)}%</p>
          </div>
          <div className="text-right w-20">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Temp</p>
            <p className={`font-mono font-bold tracking-tighter ${(inv.temperatureC ?? 0) > 65 ? "text-status-warning" : "text-foreground"}`}>
              {(inv.temperatureC ?? 0).toFixed(0)}°C
            </p>
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-accent-brand transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 ml-2" />
      </div>
    </Link>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InverterList() {
  const { plantId } = useParams();
  const [location] = useLocation();

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: plant } = useGetPlant(plantId ?? "", {
    query: { enabled: !!plantId },
  });

  const { data: polled, isLoading } = useListInverters(plantId ?? "", {
    query: {
      enabled: !!plantId,
      refetchInterval: 10000,
      queryKey: getListInvertersQueryKey(plantId ?? ""),
    },
  });

  const { latest } = usePlantTelemetryStream(plantId ?? "");
  const inverters = useMemo(() => mergeInverters(polled, latest?.inverters), [polled, latest]);

  // Filter
  const filtered = useMemo(() => {
    let list = inverters;
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
    }
    return list;
  }, [inverters, statusFilter, search]);

  // Counts
  const counts = useMemo(() => ({
    running:   inverters.filter((i) => i.status === "running").length,
    standby:   inverters.filter((i) => i.status === "standby").length,
    fault:     inverters.filter((i) => i.status === "fault").length,
    comm_lost: inverters.filter((i) => i.status === "comm_lost").length,
  }), [inverters]);

  const subNav = SUB_NAV(plantId ?? "");

  return (
    <AppLayout>
      <div className="flex flex-col min-h-0 space-y-0">

        {/* ── Breadcrumb + plant name ─────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6">
          <Link href="/">
            <button className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Portfolio
            </button>
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <Link href={`${BASE}plants/${plantId}`}>
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              {plant?.name ?? "Plant"}
            </span>
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-foreground">Inverters</span>
        </div>

        {/* ── Plant header ────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-4 animate-fade-up">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
              <Cpu className="w-7 h-7 text-accent-brand" />
              {plant?.name ? `${plant.name} Inverters` : "Device Management"}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Real-time telemetry and diagnostics for all string inverters
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-accent-brand bg-accent-brand/10 px-3 py-1.5 rounded border border-accent-brand/20">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>LIVE SYNC</span>
          </div>
        </div>

        {/* ── Sub-navigation tabs ─────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-b border-border/50 mb-6 -mx-1 px-1 overflow-x-auto animate-fade-up" style={{ animationDelay: '50ms' }}>
          {subNav.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            const isCurrentSection = item.href.endsWith("/inverters") && (location.endsWith("/inverters") || location.includes("/inverters"));
            return (
              <Link key={item.name} href={item.href}>
                <button
                  className={`
                    flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap
                    border-b-2 transition-all -mb-px
                    ${isCurrentSection || (item.href.endsWith("/inverters") && location.endsWith("/inverters"))
                      ? "border-accent-brand text-accent-brand bg-accent-brand/5"
                      : isActive
                      ? "border-accent-brand text-accent-brand"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30"
                    }
                  `}
                >
                  {item.icon && <item.icon className="w-4 h-4" />}
                  {item.name}
                </button>
              </Link>
            );
          })}
        </div>

        {/* ── Status summary pills ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 mb-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
          <button
            onClick={() => setStatusFilter("all")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${
              statusFilter === "all"
                ? "bg-accent-brand/10 border-accent-brand/40 text-accent-brand shadow-sm"
                : "bg-card border-border/50 text-muted-foreground hover:border-border hover:text-foreground shadow-sm"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span className="font-mono text-xs">{inverters.length}</span>
            <span className="opacity-80">Total</span>
          </button>
          {counts.running > 0 && (
            <button onClick={() => setStatusFilter(statusFilter === "running" ? "all" : "running")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all shadow-sm ${statusFilter === "running" ? "bg-status-normal/20 border-status-normal/50 text-status-normal shadow-[0_0_10px_hsl(var(--status-normal)/0.1)]" : "bg-card border-border/50 text-muted-foreground hover:border-status-normal/30 hover:text-status-normal"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-status-normal shadow-[0_0_5px_hsl(var(--status-normal))]" />
              <span className="font-mono text-xs">{counts.running}</span>
              <span className="opacity-80">Online</span>
            </button>
          )}
          {counts.standby > 0 && (
            <button onClick={() => setStatusFilter(statusFilter === "standby" ? "all" : "standby")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all shadow-sm ${statusFilter === "standby" ? "bg-status-warning/20 border-status-warning/50 text-status-warning shadow-[0_0_10px_hsl(var(--status-warning)/0.1)]" : "bg-card border-border/50 text-muted-foreground hover:border-status-warning/30 hover:text-status-warning"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-status-warning shadow-[0_0_5px_hsl(var(--status-warning))]" />
              <span className="font-mono text-xs">{counts.standby}</span>
              <span className="opacity-80">Standby</span>
            </button>
          )}
          {counts.fault > 0 && (
            <button onClick={() => setStatusFilter(statusFilter === "fault" ? "all" : "fault")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all shadow-sm ${statusFilter === "fault" ? "bg-status-fault/20 border-status-fault/50 text-status-fault shadow-[0_0_10px_hsl(var(--status-fault)/0.1)]" : "bg-card border-border/50 text-muted-foreground hover:border-status-fault/30 hover:text-status-fault"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-status-fault shadow-[0_0_5px_hsl(var(--status-fault))]" />
              <span className="font-mono text-xs">{counts.fault}</span>
              <span className="opacity-80">Faults</span>
            </button>
          )}
          {counts.comm_lost > 0 && (
            <button onClick={() => setStatusFilter(statusFilter === "comm_lost" ? "all" : "comm_lost")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all shadow-sm ${statusFilter === "comm_lost" ? "bg-muted/50 border-muted-foreground/50 text-muted-foreground" : "bg-card border-border/50 text-muted-foreground hover:border-muted-foreground/30 hover:text-muted-foreground"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="font-mono text-xs">{counts.comm_lost}</span>
              <span className="opacity-80">Offline</span>
            </button>
          )}
        </div>

        {/* ── Filter bar ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6 animate-fade-up" style={{ animationDelay: '150ms' }}>
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search by device name or S/N…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm font-medium bg-card/50 border border-border/60 rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent-brand/50 focus:border-accent-brand/50 transition-all shadow-sm"
            />
          </div>

          {/* Results count */}
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground tabular-nums bg-muted/20 px-3 py-2 rounded-lg border border-border/50">
            {filtered.length} / {inverters.length} devices
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* View toggle */}
          <div className="flex items-center bg-card rounded-lg border border-border/50 p-1 shadow-sm">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-md transition-all ${viewMode === "grid" ? "bg-accent-brand/10 shadow-sm text-accent-brand" : "text-muted-foreground hover:text-foreground"}`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-md transition-all ${viewMode === "list" ? "bg-accent-brand/10 shadow-sm text-accent-brand" : "text-muted-foreground hover:text-foreground"}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Content ──────────────────────────────────────────────────── */}
        <div className="animate-fade-up" style={{ animationDelay: '200ms' }}>
          {isLoading ? (
            /* Skeleton */
            <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" : "flex flex-col gap-3"}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-card-border bg-card/40 p-5 h-56 animate-shimmer" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center bg-card/20 border border-border/50 border-dashed rounded-2xl">
              <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border/50 flex items-center justify-center mb-5">
                <Cpu className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-bold text-foreground mb-1">No devices found</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                {search || statusFilter !== "all" ? "Try adjusting your filters" : "No inverters registered for this plant"}
              </p>
              {(search || statusFilter !== "all") && (
                <button
                  onClick={() => { setSearch(""); setStatusFilter("all"); }}
                  className="mt-5 text-[10px] font-bold uppercase tracking-widest text-accent-brand hover:bg-accent-brand/10 px-4 py-2 rounded-lg transition-colors border border-accent-brand/20"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map((inv) => (
                <InverterCard key={inv.id} inv={inv} plantId={plantId ?? ""} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-card-border bg-card/40 backdrop-blur-md overflow-hidden shadow-sm">
              {filtered.map((inv) => (
                <InverterRow key={inv.id} inv={inv} plantId={plantId ?? ""} />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        {!isLoading && filtered.length > 0 && (
          <div className="flex items-center justify-between pt-6 pb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Showing <span className="text-foreground">{filtered.length}</span> of{" "}
              <span className="text-foreground">{inverters.length}</span> devices
            </p>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-lg border border-border/50">
              <Clock className="w-3.5 h-3.5" /> Updates every 10s via live stream
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
