import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, AlertTriangle, Wrench, FileText, Settings2,
  Users, Zap, Radio, WifiOff, LogOut, ChevronDown, ShieldAlert,
  X, Cpu, Building2, Brain, Sun, Moon, Monitor, BookOpen,
  Database, Server, FolderDown, Network, Bell, Flag,
  ClipboardList, Lock, CreditCard, Headphones, HardDrive,
  PlugZap, PackagePlus, UserCog, Gauge, ScrollText, LogIn,
  DatabaseZap, Timer, BellRing, SlidersHorizontal, UserCheck,
  Building, ShieldCheck, ExternalLink,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useTelemetry } from "@/context/TelemetryStreamContext";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/components/theme-provider";
import { useControlRoom } from "@/context/ControlRoomContext";
import { ControlRoomOverlay } from "@/components/control-room-overlay";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationBell } from "@/components/notification-panel";

// ─── Types ────────────────────────────────────────────────────────────────────
interface NavItem { name: string; href: string; icon: React.ElementType }
type SectionId = "operations" | "devices" | "admin" | "platform";

interface Section {
  id: SectionId;
  label: string;
  icon: React.ElementType;
  color: string;          // tailwind text color for active state
  bgColor: string;        // tailwind bg for active rail icon
  items: NavItem[];
}

// ─── Section definitions ──────────────────────────────────────────────────────
const OPERATIONS_ITEMS: NavItem[] = [
  { name: "Portfolio",    href: "/",            icon: LayoutDashboard },
  { name: "AI Insights",  href: "/insights",    icon: Brain           },
  { name: "Alert Center", href: "/alerts",      icon: AlertTriangle   },
  { name: "Work Orders",  href: "/maintenance", icon: Wrench          },
  { name: "Reports",      href: "/reports",     icon: FileText        },
];

const DEVICES_ITEMS: NavItem[] = [
  { name: "Firmware",       href: "/devices/firmware",     icon: HardDrive  },
  { name: "Dev Templates",  href: "/device-templates",     icon: BookOpen   },
  { name: "Driver Health",  href: "/driver-health",        icon: Gauge      },
  { name: "Connect Source", href: "/connect-data-source",  icon: PlugZap    },
  { name: "FTP Sources",    href: "/ftp-sources",          icon: Server     },
  { name: "Auto-Provision", href: "/autoprovision",        icon: PackagePlus},
];

const ADMIN_ITEMS: NavItem[] = [
  { name: "Organisation",  href: "/org",               icon: Building2      },
  { name: "Users",         href: "/admin/users",       icon: Users          },
  { name: "Roles",         href: "/admin/roles",       icon: UserCog        },
  { name: "Notifications", href: "/org/notifications", icon: Bell           },
  { name: "Gateways",      href: "/org/gateways",      icon: Network        },
  { name: "Audit Log",     href: "/org/audit-log",     icon: ClipboardList  },
  { name: "Settings",      href: "/settings",          icon: SlidersHorizontal },
];

const PLATFORM_ITEMS: NavItem[] = [
  { name: "Dashboard",      href: "/superadmin",                 icon: LayoutDashboard  },
  { name: "Tenants",        href: "/superadmin/orgs",            icon: Building         },
  { name: "All Users",      href: "/superadmin/users",           icon: UserCheck        },
  { name: "Feature Flags",  href: "/superadmin/feature-flags",   icon: Flag             },
  { name: "Audit Logs",     href: "/superadmin/audit-logs",      icon: ScrollText       },
  { name: "Login History",  href: "/superadmin/login-history",   icon: LogIn            },
  { name: "System Health",  href: "/superadmin/system-health",   icon: ShieldCheck      },
  { name: "DB Monitor",     href: "/superadmin/db",              icon: DatabaseZap      },
  { name: "Jobs Monitor",   href: "/superadmin/jobs",            icon: Timer            },
  { name: "Notifications",  href: "/superadmin/notifications",   icon: BellRing         },
  { name: "System Config",  href: "/superadmin/config",          icon: SlidersHorizontal},
  { name: "Security",       href: "/superadmin/security",        icon: Lock             },
  { name: "Billing",        href: "/superadmin/billing",         icon: CreditCard       },
  { name: "Support",        href: "/superadmin/support",         icon: Headphones       },
];

function buildSections(isSuperAdmin: boolean): Section[] {
  const base: Section[] = [
    {
      id: "operations",
      label: "Operations",
      icon: LayoutDashboard,
      color: "text-accent-brand",
      bgColor: "bg-accent-brand/15",
      items: OPERATIONS_ITEMS,
    },
    {
      id: "devices",
      label: "Devices & Data",
      icon: Cpu,
      color: "text-accent-brand",
      bgColor: "bg-accent-brand/15",
      items: DEVICES_ITEMS,
    },
    {
      id: "admin",
      label: "Administration",
      icon: Settings2,
      color: "text-accent-brand",
      bgColor: "bg-accent-brand/15",
      items: ADMIN_ITEMS,
    },
  ];
  if (isSuperAdmin) {
    base.push({
      id: "platform",
      label: "Platform Admin",
      icon: ShieldAlert,
      color: "text-accent-brand",
      bgColor: "bg-accent-brand/15",
      items: PLATFORM_ITEMS,
    });
  }
  return base;
}

// Determine which section owns the current route
function sectionForPath(path: string): SectionId {
  if (path.startsWith("/superadmin")) return "platform";
  if (
    path.startsWith("/devices") ||
    path.startsWith("/device-templates") ||
    path.startsWith("/driver-health") ||
    path.startsWith("/connect-data-source") ||
    path.startsWith("/ftp-sources") ||
    path.startsWith("/autoprovision")
  ) return "devices";
  if (
    path.startsWith("/admin") ||
    path.startsWith("/org") ||
    path.startsWith("/settings")
  ) return "admin";
  return "operations";
}

// ─── Rail icon button ─────────────────────────────────────────────────────────
function RailIcon({
  section, isActive, onClick,
}: {
  section: Section; isActive: boolean; onClick: () => void;
}) {
  const Icon = section.icon;
  return (
    <button
      onClick={onClick}
      title={section.label}
      className={`
        group relative w-full flex flex-col items-center justify-center gap-1.5
        py-4 transition-all duration-300
        ${isActive ? "bg-accent-brand/5 border-l-2 border-accent-brand" : "hover:bg-muted/30 border-l-2 border-transparent"}
      `}
    >
      <Icon
        className={`h-5 w-5 transition-colors duration-300 ${
          isActive ? section.color : "text-muted-foreground group-hover:text-foreground"
        }`}
      />
      <span
        className={`text-[9px] font-bold tracking-widest uppercase transition-colors duration-300 ${
          isActive ? section.color : "text-muted-foreground group-hover:text-foreground"
        }`}
      >
        {section.id === "operations" ? "Ops"
          : section.id === "devices"  ? "Data"
          : section.id === "admin"    ? "Admin"
          : "Sys"}
      </span>
    </button>
  );
}

// ─── Panel nav item ───────────────────────────────────────────────────────────
function PanelItem({
  item, location, sectionColor,
}: {
  item: NavItem; location: string; sectionColor: string;
}) {
  const isActive =
    location === item.href ||
    (item.href !== "/" && location.startsWith(item.href));
  const Icon = item.icon;

  return (
    <Link href={item.href}>
      <div
        className={`
          relative flex items-center gap-3 px-4 py-2.5 mx-2 my-0.5 rounded-lg
          cursor-pointer transition-all duration-200 group
          ${isActive
            ? "bg-accent-brand/10"
            : "hover:bg-muted/40"
          }
        `}
      >
        {isActive && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-accent-brand rounded-r-full shadow-[0_0_8px_rgba(20,205,230,0.8)]"
          />
        )}
        <Icon
          className={`h-4 w-4 flex-shrink-0 transition-colors ${
            isActive
              ? sectionColor
              : "text-muted-foreground group-hover:text-foreground"
          }`}
        />
        <span
          className={`text-xs font-semibold truncate transition-colors ${
            isActive
              ? "text-foreground"
              : "text-muted-foreground group-hover:text-foreground"
          }`}
        >
          {item.name}
        </span>
      </div>
    </Link>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────
export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { connected, lastSync, tickCount } = useTelemetry();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { isActive: crActive, toggle: toggleCR } = useControlRoom();
  const queryClient = useQueryClient();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const sections = buildSections(user?.isSuperAdmin ?? false);

  // Track which section panel is open (auto-follows the route)
  const autoSection = sectionForPath(location);
  const [activeSection, setActiveSection] = useState<SectionId>(autoSection);

  // Keep panel in sync when navigating via links
  useEffect(() => {
    setActiveSection(autoSection);
  }, [autoSection]);

  const currentSection = sections.find(s => s.id === activeSection) ?? sections[0];

  // ── Impersonation exit ───────────────────────────────────────────────────────
  async function exitImpersonation() {
    await fetch(`${import.meta.env.BASE_URL}api/superadmin/impersonate`, {
      method: "DELETE", credentials: "include",
      headers: { "X-SCADA-Request": "1" },
    });
    await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    await queryClient.invalidateQueries();
  }

  // ── Stream label ─────────────────────────────────────────────────────────────
  const [syncAgoLabel, setSyncAgoLabel] = useState("--");
  useEffect(() => {
    function update() {
      if (!lastSync) { setSyncAgoLabel("--"); return; }
      const s = Math.round((Date.now() - lastSync.getTime()) / 1000);
      setSyncAgoLabel(s <= 1 ? "now" : `${s}s`);
    }
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [lastSync]);

  // ── Flash tick ───────────────────────────────────────────────────────────────
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (tickCount === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 500);
    return () => clearTimeout(t);
  }, [tickCount]);

  // ── Initials helpers ─────────────────────────────────────────────────────────
  const getInitials = (n: string) =>
    n.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const getOrgInitials = (n: string) =>
    n.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <ControlRoomOverlay />
      <div className="flex h-screen overflow-hidden bg-black text-foreground selection:bg-accent-brand/30">

        {/* ── Sidebar: Rail + Panel ── */}
        <aside className="hidden md:flex flex-shrink-0 border-r border-border/50 bg-card/40 backdrop-blur-xl z-20">

          {/* ── Rail (64px) ──────────────────────────────────────────────────── */}
          <div className="w-[64px] flex flex-col border-r border-border/50 bg-card/60">
            {/* Brand mark */}
            <div className="h-16 flex items-center justify-center border-b border-border/50 flex-shrink-0">
              <Link href="/">
                <div className="w-9 h-9 rounded-lg bg-card border border-card-border shadow-[0_0_15px_rgba(20,205,230,0.15)] flex items-center justify-center cursor-pointer hover:border-accent-brand/50 transition-colors">
                  <Zap className="h-5 w-5 text-accent-brand" strokeWidth={2.5} />
                </div>
              </Link>
            </div>

            {/* Section icons */}
            <nav className="flex-1 flex flex-col pt-2">
              {sections.map(s => (
                <RailIcon
                  key={s.id}
                  section={s}
                  isActive={activeSection === s.id}
                  onClick={() => setActiveSection(s.id)}
                />
              ))}

              {/* Platform Admin external link (non-superadmins) */}
              {!user?.isSuperAdmin && (
                <a
                  href={`${import.meta.env.BASE_URL}platform-admin`}
                  title="Platform Admin Login"
                  className="mt-auto mb-2 w-full flex flex-col items-center justify-center py-4 text-muted-foreground hover:text-accent-brand hover:bg-accent-brand/5 transition-all"
                >
                  <ShieldAlert className="h-5 w-5" />
                  <span className="text-[9px] font-bold mt-1.5 tracking-widest uppercase">Admin</span>
                </a>
              )}
            </nav>

            {/* Rail bottom: stream dot + user avatar */}
            <div className="flex flex-col items-center gap-3 py-4 border-t border-border/50 flex-shrink-0">
              {/* Stream status dot */}
              <div title={connected ? `Live · ${syncAgoLabel} ago` : "Stream offline"}>
                <div className={`relative flex items-center justify-center w-8 h-8 rounded-full ${
                  connected ? "bg-emerald-500/10" : "bg-red-500/10"
                }`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    connected
                      ? flash ? "bg-emerald-400 scale-125 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-emerald-500 animate-pulse-subtle shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                      : "bg-red-500"
                  } transition-all duration-300`} />
                </div>
              </div>

              {/* Theme toggle */}
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                title={theme === "dark" ? "Light mode" : "Dark mode"}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              {/* Control room */}
              <button
                onClick={toggleCR}
                title="Control Room Mode"
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  crActive ? "text-accent-brand bg-accent-brand/10 border border-accent-brand/20" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <Monitor className="h-4 w-4" />
              </button>

              {/* User avatar */}
              {user && (
                <button
                  onClick={() => setUserMenuOpen(o => !o)}
                  title={user.name}
                  className="relative w-8 h-8 mt-1 rounded-lg bg-card border border-card-border shadow-sm flex items-center justify-center hover:border-accent-brand/50 hover:shadow-[0_0_10px_rgba(20,205,230,0.2)] transition-all"
                >
                  <span className="text-xs font-bold text-foreground leading-none">
                    {getInitials(user.name)}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* ── Panel (220px) ───────────────────────────────────────────────── */}
          <div className="w-[220px] flex flex-col bg-card/30">

            {/* Panel header: org brand */}
            <div className="h-16 flex items-center gap-3 px-4 border-b border-border/50 flex-shrink-0">
              {user?.orgLogoUrl ? (
                <img
                  src={user.orgLogoUrl}
                  alt={user.orgName ?? "Org"}
                  className="w-7 h-7 rounded object-cover border border-border flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-7 h-7 rounded bg-card border border-card-border flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-foreground">
                    {getOrgInitials(user?.orgName ?? user?.orgId ?? "?")}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate leading-tight tracking-tight">
                  {user?.orgName ?? "My Organisation"}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground leading-tight uppercase tracking-widest mt-0.5">Solar SCADA</p>
              </div>
              <NotificationBell />
            </div>

            {/* Section label + items */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-4">
              {/* Section header */}
              <div className="flex items-center gap-2.5 px-4 mb-4">
                <div className={`flex items-center justify-center w-6 h-6 rounded ${currentSection.bgColor}`}>
                  <currentSection.icon className={`h-3.5 w-3.5 flex-shrink-0 ${currentSection.color}`} />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {currentSection.label}
                </span>
              </div>

              {/* Nav items */}
              <nav className="space-y-1">
                {currentSection.items.map(item => (
                  <PanelItem
                    key={item.href}
                    item={item}
                    location={location}
                    sectionColor={currentSection.color}
                  />
                ))}
              </nav>

              {/* Divider + quick jump to other sections */}
              <div className="mx-4 mt-6 border-t border-border/50 pt-4">
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase mb-2">
                  Quick Jump
                </p>
                <div className="space-y-1">
                  {sections.filter(s => s.id !== activeSection).map(s => (
                    <button
                      key={s.id}
                      onClick={() => setActiveSection(s.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors group text-left"
                    >
                      <s.icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors truncate">
                        {s.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Panel bottom: stream details + user info */}
            <div className="border-t border-border/50 flex-shrink-0 bg-muted/10">
              {/* Stream indicator row */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                <div className="flex items-center gap-2">
                  {connected
                    ? <Radio className={`h-3.5 w-3.5 text-emerald-500 ${flash ? "text-emerald-300" : ""}`} />
                    : <WifiOff className="h-3.5 w-3.5 text-red-500" />}
                  <span className={`text-[11px] font-bold tracking-wide uppercase ${connected ? "text-emerald-500" : "text-red-500"}`}>
                    {connected ? "SYS.ONLINE" : "SYS.OFFLINE"}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {connected ? syncAgoLabel : "—"}
                </span>
              </div>

              {/* Tick sparkline */}
              {connected && (
                <div className="flex gap-1 px-4 py-3 h-8 items-end border-b border-border/30 bg-black/20">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-sm transition-all duration-300 ${
                        flash && i >= 24 - (tickCount % 24) - 1
                          ? "h-4 bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"
                          : "h-1 bg-emerald-500/20"
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* User row */}
              {user && (
                <div className="relative p-2">
                  <button
                    onClick={() => setUserMenuOpen(o => !o)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card border border-transparent hover:border-card-border transition-all text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{user.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest truncate mt-0.5">{user.roleName}</p>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {/* User menu popover */}
                  {userMenuOpen && (
                    <div className="absolute bottom-full left-2 right-2 mb-2 bg-card border border-card-border rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-up" style={{ animationDuration: '0.2s' }}>
                      {/* User info */}
                      <div className="px-4 py-3 border-b border-border bg-muted/20">
                        <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] px-2 py-0.5 rounded border border-border bg-background text-muted-foreground font-semibold uppercase tracking-wider">
                            {user.roleName}
                          </span>
                          {user.isSuperAdmin && (
                            <span className="text-[10px] px-2 py-0.5 rounded border border-accent-brand/30 bg-accent-brand/10 text-accent-brand font-bold uppercase tracking-wider">
                              SUPER ADMIN
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Platform admin entry */}
                      {!user.isSuperAdmin ? (
                        <a
                          href={`${import.meta.env.BASE_URL}platform-admin`}
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-accent-brand hover:bg-accent-brand/5 transition-colors border-b border-border"
                        >
                          <ShieldAlert className="h-4 w-4" />
                          <span className="flex-1">Admin Login</span>
                          <ExternalLink className="h-3 w-3 opacity-50" />
                        </a>
                      ) : (
                        <Link href="/superadmin">
                          <div
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-accent-brand hover:bg-accent-brand/5 transition-colors border-b border-border cursor-pointer"
                          >
                            <ShieldAlert className="h-4 w-4" />
                            <span className="flex-1">Platform Portal</span>
                          </div>
                        </Link>
                      )}

                      {/* Sign out */}
                      <button
                        onClick={async () => { setUserMenuOpen(false); await logout(); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-status-fault hover:bg-status-fault/10 transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          
          {/* subtle background grid */}
          <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
          <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent-brand/5 blur-[120px] pointer-events-none" />

          {/* Impersonation banner */}
          {user?.orgOverride && (
            <div className="flex items-center justify-between px-6 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-500 text-sm font-medium flex-shrink-0 z-10 relative">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-4 w-4" />
                <span>
                  Acting as org:{" "}
                  <span className="font-bold text-amber-400">{user.orgOverrideName ?? user.orgOverride}</span>
                </span>
                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500 py-0 uppercase tracking-widest font-bold ml-2">
                  IMPERSONATION ACTIVE
                </Badge>
              </div>
              <Button
                size="sm" variant="ghost"
                className="h-7 text-xs font-bold text-amber-500 hover:text-amber-400 hover:bg-amber-500/20 gap-2 px-3"
                onClick={() => void exitImpersonation()}
              >
                <X className="h-3 w-3" /> EXIT
              </Button>
            </div>
          )}

          <main className="flex-1 overflow-y-auto relative z-10">
            <div className="py-6 px-6 md:py-8 md:px-10 h-full max-w-[1600px] mx-auto pb-[80px] md:pb-8">
              {children}
            </div>
          </main>
          <BottomNav />
        </div>
      </div>
    </>
  );
}
