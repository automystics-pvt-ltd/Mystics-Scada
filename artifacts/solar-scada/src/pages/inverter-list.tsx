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
    label: "Normal",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    glow: "shadow-[0_0_0_1px_rgba(16,185,129,0.25)]",
    dot: "bg-emerald-400",
    icon: CheckCircle2,
    pulse: true,
  },
  standby: {
    label: "Standby",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    glow: "shadow-[0_0_0_1px_rgba(245,158,11,0.2)]",
    dot: "bg-amber-400",
    icon: PauseCircle,
    pulse: false,
  },
  fault: {
    label: "Fault",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    glow: "shadow-[0_0_0_1px_rgba(239,68,68,0.25)]",
    dot: "bg-red-400",
    icon: XCircle,
    pulse: false,
  },
  comm_lost: {
    label: "Comm Lost",
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/30",
    glow: "",
    dot: "bg-slate-400",
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
  const map = new Map(live.map((l) => [l.id, l]));
  return polled.map((inv) => {
    const l = map.get(inv.id);
    return l ? { ...inv, ...l } : inv;
  });
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${color.includes("emerald") ? "bg-emerald-400" : color.includes("amber") ? "bg-amber-400" : color.includes("red") ? "bg-red-400" : "bg-slate-400"}`} />
      <span className="tabular-nums font-bold">{count}</span>
      <span className="opacity-70">{label}</span>
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
          group relative flex flex-col rounded-xl border bg-card cursor-pointer
          transition-all duration-200
          hover:border-primary/40 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5
          ${cfg.border} ${cfg.glow}
        `}
      >
        {/* Running pulse accent line */}
        {cfg.pulse && (
          <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
        )}

        {/* Card header */}
        <div className="flex items-start justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Status dot */}
            <div className="relative flex-shrink-0">
              <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              {cfg.pulse && (
                <div className={`absolute inset-0 rounded-full ${cfg.dot} animate-ping opacity-60`} />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-foreground truncate leading-tight">
                {inv.name}
              </h3>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                S/N: {inv.serialNumber ?? inv.id.slice(0, 12).toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Connection icon */}
            <div className={`w-7 h-7 rounded-md flex items-center justify-center ${cfg.bg}`}>
              {inv.status === "comm_lost" ? (
                <WifiOff className={`w-3.5 h-3.5 ${cfg.color}`} />
              ) : (
                <Zap className={`w-3.5 h-3.5 ${cfg.color}`} />
              )}
            </div>
            {/* Status badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
              <StatusIcon className="w-2.5 h-2.5" />
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-4 h-px bg-border/50" />

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-0 px-4 py-3">
          <div className="pr-3 border-r border-border/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Daily Generation</p>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-foreground tabular-nums">{energyMwh}</span>
              <span className="text-xs text-muted-foreground">MWh</span>
            </div>
          </div>
          <div className="pl-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Active Power</p>
            <div className="flex items-baseline gap-1">
              <span className={`text-lg font-bold tabular-nums ${inv.status === "running" ? "text-emerald-400" : "text-foreground"}`}>
                {(inv.acPowerKw ?? 0).toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">kW</span>
            </div>
          </div>
        </div>

        {/* Power utilisation bar */}
        <div className="px-4 pb-1">
          <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
            <span>Power utilisation</span>
            <span className="tabular-nums">{powerPct.toFixed(0)}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                powerPct > 80 ? "bg-emerald-400" : powerPct > 40 ? "bg-amber-400" : "bg-slate-500"
              }`}
              style={{ width: `${powerPct}%` }}
            />
          </div>
        </div>

        {/* Secondary metrics row */}
        <div className="grid grid-cols-3 gap-0 border-t border-border/50 mt-3">
          <div className="flex flex-col items-center py-2.5 border-r border-border/50">
            <Activity className="w-3 h-3 text-muted-foreground mb-1" />
            <span className="text-[10px] text-muted-foreground">Efficiency</span>
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {(inv.efficiencyPct ?? 0).toFixed(1)}%
            </span>
          </div>
          <div className="flex flex-col items-center py-2.5 border-r border-border/50">
            <Thermometer className="w-3 h-3 text-muted-foreground mb-1" />
            <span className="text-[10px] text-muted-foreground">Temp</span>
            <span className={`text-xs font-semibold tabular-nums ${(inv.temperatureC ?? 0) > 65 ? "text-amber-400" : "text-foreground"}`}>
              {(inv.temperatureC ?? 0).toFixed(0)}°C
            </span>
          </div>
          <div className="flex flex-col items-center py-2.5">
            <TrendingUp className="w-3 h-3 text-muted-foreground mb-1" />
            <span className="text-[10px] text-muted-foreground">DC Power</span>
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {(inv.dcPowerKw ?? 0).toFixed(1)} kW
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
        group flex items-center gap-4 px-4 py-3 border-b border-border/50 last:border-0
        hover:bg-muted/20 cursor-pointer transition-colors
      `}>
        {/* Status dot */}
        <div className="relative flex-shrink-0">
          <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          {cfg.pulse && <div className={`absolute inset-0 rounded-full ${cfg.dot} animate-ping opacity-50`} />}
        </div>

        {/* Name + S/N */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{inv.name}</p>
          <p className="text-[10px] text-muted-foreground font-mono truncate">
            S/N: {inv.serialNumber ?? inv.id.slice(0, 12).toUpperCase()}
          </p>
        </div>

        {/* Status */}
        <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color} border ${cfg.border} w-24 justify-center`}>
          <StatusIcon className="w-2.5 h-2.5" />
          {cfg.label}
        </span>

        {/* Metrics */}
        <div className="hidden md:flex items-center gap-8 tabular-nums text-sm">
          <div className="text-right w-20">
            <p className="text-[10px] text-muted-foreground">Power</p>
            <p className={`font-semibold ${inv.status === "running" ? "text-emerald-400" : "text-foreground"}`}>
              {(inv.acPowerKw ?? 0).toFixed(2)} <span className="text-xs font-normal text-muted-foreground">kW</span>
            </p>
          </div>
          <div className="text-right w-24">
            <p className="text-[10px] text-muted-foreground">Daily Gen.</p>
            <p className="font-semibold text-foreground">
              {((inv.dailyEnergyKwh ?? 0) / 1000).toFixed(3)} <span className="text-xs font-normal text-muted-foreground">MWh</span>
            </p>
          </div>
          <div className="text-right w-16">
            <p className="text-[10px] text-muted-foreground">Efficiency</p>
            <p className="font-semibold text-foreground">{(inv.efficiencyPct ?? 0).toFixed(1)}%</p>
          </div>
          <div className="text-right w-16">
            <p className="text-[10px] text-muted-foreground">Temp</p>
            <p className={`font-semibold ${(inv.temperatureC ?? 0) > 65 ? "text-amber-400" : "text-foreground"}`}>
              {(inv.temperatureC ?? 0).toFixed(0)}°C
            </p>
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
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

  const { liveInverters } = usePlantTelemetryStream(plantId ?? "");
  const inverters = useMemo(() => mergeInverters(polled, liveInverters), [polled, liveInverters]);

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
        <div className="flex items-center gap-2 mb-4">
          <Link href="/">
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3 h-3" /> Portfolio
            </button>
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <Link href={`${BASE}plants/${plantId}`}>
            <span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              {plant?.name ?? "Plant"}
            </span>
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <span className="text-xs text-foreground font-medium">Devices</span>
        </div>

        {/* ── Plant header ────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              {plant?.name ?? "Device Management"}
            </h1>
            {plant?.location && (
              <p className="text-xs text-muted-foreground mt-0.5">{plant.location}</p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
            <Radio className="w-3 h-3 text-emerald-400" />
            <span>Live · updating</span>
          </div>
        </div>

        {/* ── Sub-navigation tabs ─────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-border/50 mb-5 -mx-1 px-1 overflow-x-auto">
          {subNav.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            const isCurrentSection = item.href.endsWith("/inverters") && (location.endsWith("/inverters") || location.includes("/inverters"));
            return (
              <Link key={item.name} href={item.href}>
                <button
                  className={`
                    flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap
                    border-b-2 transition-all -mb-px
                    ${isCurrentSection || (item.href.endsWith("/inverters") && location.endsWith("/inverters"))
                      ? "border-primary text-primary"
                      : isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                    }
                  `}
                >
                  {item.icon && <item.icon className="w-3.5 h-3.5" />}
                  {item.name}
                </button>
              </Link>
            );
          })}
        </div>

        {/* ── Status summary pills ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setStatusFilter("all")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              statusFilter === "all"
                ? "bg-primary/10 border-primary/40 text-primary"
                : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <Cpu className="w-3 h-3" />
            <span className="font-bold">{inverters.length}</span>
            <span className="opacity-70">Total</span>
          </button>
          {counts.running > 0 && (
            <button onClick={() => setStatusFilter(statusFilter === "running" ? "all" : "running")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${statusFilter === "running" ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "border-border/50 text-muted-foreground hover:border-emerald-500/30 hover:text-emerald-400"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="font-bold">{counts.running}</span>
              <span className="opacity-70">Normal</span>
            </button>
          )}
          {counts.standby > 0 && (
            <button onClick={() => setStatusFilter(statusFilter === "standby" ? "all" : "standby")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${statusFilter === "standby" ? "bg-amber-500/20 border-amber-500/50 text-amber-400" : "border-border/50 text-muted-foreground hover:border-amber-500/30 hover:text-amber-400"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="font-bold">{counts.standby}</span>
              <span className="opacity-70">Standby</span>
            </button>
          )}
          {counts.fault > 0 && (
            <button onClick={() => setStatusFilter(statusFilter === "fault" ? "all" : "fault")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${statusFilter === "fault" ? "bg-red-500/20 border-red-500/50 text-red-400" : "border-border/50 text-muted-foreground hover:border-red-500/30 hover:text-red-400"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span className="font-bold">{counts.fault}</span>
              <span className="opacity-70">Fault</span>
            </button>
          )}
          {counts.comm_lost > 0 && (
            <button onClick={() => setStatusFilter(statusFilter === "comm_lost" ? "all" : "comm_lost")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${statusFilter === "comm_lost" ? "bg-slate-500/20 border-slate-500/50 text-slate-300" : "border-border/50 text-muted-foreground hover:border-slate-500/30 hover:text-slate-300"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span className="font-bold">{counts.comm_lost}</span>
              <span className="opacity-70">Comm Lost</span>
            </button>
          )}
        </div>

        {/* ── Filter bar ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-5">
          {/* Search */}
          <div className="relative flex-1 max-w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search by device name or S/N…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-muted/30 border border-border/60 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all"
            />
          </div>

          {/* Results count */}
          <span className="text-xs text-muted-foreground tabular-nums">
            {filtered.length} / {inverters.length} devices
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* View toggle */}
          <div className="flex items-center bg-muted/30 rounded-lg border border-border/50 p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Content ──────────────────────────────────────────────────── */}
        {isLoading ? (
          /* Skeleton */
          <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-2"}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/50 bg-card animate-pulse">
                <div className="p-4 space-y-3">
                  <div className="flex justify-between">
                    <div className="h-4 bg-muted/50 rounded w-32" />
                    <div className="h-5 bg-muted/50 rounded-full w-16" />
                  </div>
                  <div className="h-3 bg-muted/50 rounded w-24" />
                  <div className="h-px bg-border/50" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-10 bg-muted/50 rounded" />
                    <div className="h-10 bg-muted/50 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border/50 flex items-center justify-center mb-4">
              <Cpu className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No devices found</p>
            <p className="text-xs text-muted-foreground">
              {search || statusFilter !== "all" ? "Try adjusting your filters" : "No inverters registered for this plant"}
            </p>
            {(search || statusFilter !== "all") && (
              <button
                onClick={() => { setSearch(""); setStatusFilter("all"); }}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((inv) => (
              <InverterCard key={inv.id} inv={inv} plantId={plantId ?? ""} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
            {filtered.map((inv) => (
              <InverterRow key={inv.id} inv={inv} plantId={plantId ?? ""} />
            ))}
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        {!isLoading && filtered.length > 0 && (
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-medium text-foreground">{filtered.length}</span> of{" "}
              <span className="font-medium text-foreground">{inverters.length}</span> devices
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Updates every 10s via live stream
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
