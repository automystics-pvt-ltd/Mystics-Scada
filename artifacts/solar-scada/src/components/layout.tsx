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
  { name: "Devices",        href: "/devices",              icon: Cpu        },
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
      color: "text-indigo-400",
      bgColor: "bg-indigo-500/15",
      items: OPERATIONS_ITEMS,
    },
    {
      id: "devices",
      label: "Devices & Data",
      icon: Cpu,
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/15",
      items: DEVICES_ITEMS,
    },
    {
      id: "admin",
      label: "Administration",
      icon: Settings2,
      color: "text-amber-400",
      bgColor: "bg-amber-500/15",
      items: ADMIN_ITEMS,
    },
  ];
  if (isSuperAdmin) {
    base.push({
      id: "platform",
      label: "Platform Admin",
      icon: ShieldAlert,
      color: "text-purple-400",
      bgColor: "bg-purple-500/15",
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
        group relative w-full flex flex-col items-center justify-center gap-1
        py-3 transition-all duration-150
        ${isActive ? section.bgColor : "hover:bg-sidebar-accent/40"}
      `}
    >
      {/* Active left-edge bar */}
      {isActive && (
        <span
          className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${section.color.replace("text-", "bg-")}`}
        />
      )}
      <Icon
        className={`h-[18px] w-[18px] transition-colors ${
          isActive ? section.color : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70"
        }`}
      />
      <span
        className={`text-[9px] font-semibold leading-none tracking-tight transition-colors ${
          isActive ? section.color : "text-sidebar-foreground/30 group-hover:text-sidebar-foreground/50"
        }`}
      >
        {section.id === "operations" ? "Ops"
          : section.id === "devices"  ? "Data"
          : section.id === "admin"    ? "Admin"
          : "Platform"}
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
          relative flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg
          cursor-pointer transition-all duration-100 group
          ${isActive
            ? "bg-sidebar-accent shadow-sm"
            : "hover:bg-sidebar-accent/50"
          }
        `}
      >
        {isActive && (
          <span
            className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full ${sectionColor.replace("text-", "bg-")}`}
          />
        )}
        <Icon
          className={`h-3.5 w-3.5 flex-shrink-0 transition-colors ${
            isActive
              ? sectionColor
              : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/60"
          }`}
        />
        <span
          className={`text-[13px] font-medium truncate transition-colors ${
            isActive
              ? "text-sidebar-foreground"
              : "text-sidebar-foreground/65 group-hover:text-sidebar-foreground"
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
      <div className="flex h-screen overflow-hidden bg-background">

        {/* ── Sidebar: Rail + Panel ── */}
        <aside className="hidden md:flex flex-shrink-0 border-r border-sidebar-border bg-sidebar">

          {/* ── Rail (52px) ──────────────────────────────────────────────────── */}
          <div className="w-[52px] flex flex-col border-r border-sidebar-border/60 bg-sidebar">
            {/* Brand mark */}
            <div className="h-12 flex items-center justify-center border-b border-sidebar-border/60 flex-shrink-0">
              <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
              </div>
            </div>

            {/* Section icons */}
            <nav className="flex-1 flex flex-col pt-1">
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
                  className="mt-auto mb-1 w-full flex flex-col items-center justify-center py-3 text-sidebar-foreground/25 hover:text-purple-400 hover:bg-purple-500/10 transition-all"
                >
                  <ShieldAlert className="h-[18px] w-[18px]" />
                  <span className="text-[8px] font-semibold mt-1 tracking-tight">Admin</span>
                </a>
              )}
            </nav>

            {/* Rail bottom: stream dot + user avatar */}
            <div className="flex flex-col items-center gap-1.5 py-2 border-t border-sidebar-border/60 flex-shrink-0">
              {/* Stream status dot */}
              <div title={connected ? `Live · ${syncAgoLabel} ago` : "Stream offline"}>
                <div className={`relative flex items-center justify-center w-7 h-7 rounded-full ${
                  connected ? "bg-emerald-500/10" : "bg-red-500/10"
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    connected
                      ? flash ? "bg-emerald-400 scale-125" : "bg-emerald-500 animate-pulse"
                      : "bg-red-500"
                  } transition-all duration-300`} />
                </div>
              </div>

              {/* Theme toggle */}
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                title={theme === "dark" ? "Light mode" : "Dark mode"}
                className="w-7 h-7 rounded-md flex items-center justify-center text-sidebar-foreground/30 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors"
              >
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>

              {/* Control room */}
              <button
                onClick={toggleCR}
                title="Control Room Mode"
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                  crActive ? "text-primary bg-primary/20" : "text-sidebar-foreground/30 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
              </button>

              {/* User avatar */}
              {user && (
                <button
                  onClick={() => setUserMenuOpen(o => !o)}
                  title={user.name}
                  className="relative w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center hover:ring-2 hover:ring-primary/30 transition-all"
                >
                  <span className="text-[10px] font-bold text-primary leading-none">
                    {getInitials(user.name)}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* ── Panel (192px) ───────────────────────────────────────────────── */}
          <div className="w-48 flex flex-col">

            {/* Panel header: org brand */}
            <div className="h-12 flex items-center gap-2.5 px-3 border-b border-sidebar-border/60 flex-shrink-0">
              {user?.orgLogoUrl ? (
                <img
                  src={user.orgLogoUrl}
                  alt={user.orgName ?? "Org"}
                  className="w-6 h-6 rounded-md object-cover border border-sidebar-border flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-6 h-6 rounded-md bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-bold text-primary">
                    {getOrgInitials(user?.orgName ?? user?.orgId ?? "?")}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-sidebar-foreground/90 truncate leading-tight">
                  {user?.orgName ?? "My Organisation"}
                </p>
                <p className="text-[9px] text-sidebar-foreground/35 leading-tight">Solar SCADA</p>
              </div>
              <NotificationBell />
            </div>

            {/* Section label + items */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {/* Section header */}
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <currentSection.icon
                  className={`h-3.5 w-3.5 flex-shrink-0 ${currentSection.color}`}
                />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${currentSection.color}`}>
                  {currentSection.label}
                </span>
              </div>

              {/* Nav items */}
              <nav className="pb-3 space-y-0.5">
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
              <div className="mx-3 border-t border-sidebar-border/40 pt-3 pb-3">
                <p className="text-[9px] text-sidebar-foreground/30 font-semibold uppercase tracking-widest px-2 mb-1.5">
                  Jump to
                </p>
                {sections.filter(s => s.id !== activeSection).map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent/40 transition-colors group text-left"
                  >
                    <s.icon className={`h-3 w-3 flex-shrink-0 ${s.color} opacity-60 group-hover:opacity-100`} />
                    <span className="text-[11px] text-sidebar-foreground/45 group-hover:text-sidebar-foreground/75 transition-colors truncate">
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Panel bottom: stream details + user info */}
            <div className="border-t border-sidebar-border/60 flex-shrink-0">
              {/* Stream indicator row */}
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {connected
                    ? <Radio className={`h-3 w-3 text-emerald-500 ${flash ? "text-emerald-300" : "animate-pulse"}`} />
                    : <WifiOff className="h-3 w-3 text-red-500" />}
                  <span className={`text-[10px] font-medium ${connected ? "text-emerald-500" : "text-red-500"}`}>
                    {connected ? "Live" : "Offline"}
                  </span>
                </div>
                <span className="text-[10px] text-sidebar-foreground/40 font-mono">
                  {connected ? syncAgoLabel : "—"}
                </span>
              </div>

              {/* Tick sparkline */}
              {connected && (
                <div className="flex gap-px px-3 pb-2">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-sm transition-all duration-300 ${
                        flash && i >= 12 - (tickCount % 12) - 1
                          ? "h-2.5 bg-emerald-500"
                          : "h-1.5 bg-emerald-500/20"
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* User row */}
              {user && (
                <div className="relative px-2 pb-2">
                  <button
                    onClick={() => setUserMenuOpen(o => !o)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-primary">{getInitials(user.name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-sidebar-foreground truncate">{user.name}</p>
                      <p className="text-[9px] text-sidebar-foreground/40 truncate">{user.roleName}</p>
                    </div>
                    <ChevronDown className={`h-3 w-3 text-sidebar-foreground/30 flex-shrink-0 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {/* User menu popover */}
                  {userMenuOpen && (
                    <div className="absolute bottom-full left-2 right-2 mb-1 bg-popover border border-border rounded-xl shadow-xl overflow-hidden z-50">
                      {/* User info */}
                      <div className="px-3 py-2.5 border-b border-border/60">
                        <p className="text-[11px] font-semibold text-foreground truncate">{user.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                            {user.roleName}
                          </span>
                          {user.isSuperAdmin && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-400 font-semibold">
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
                          className="flex items-center gap-2 px-3 py-2 text-[11px] text-purple-400 hover:bg-purple-500/10 transition-colors border-b border-border/60"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          <span className="flex-1">Platform Admin Login</span>
                          <ExternalLink className="h-3 w-3 opacity-50" />
                        </a>
                      ) : (
                        <Link href="/superadmin">
                          <div
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 text-[11px] text-purple-400 hover:bg-purple-500/10 transition-colors border-b border-border/60 cursor-pointer"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                            <span className="flex-1">Platform Admin Portal</span>
                          </div>
                        </Link>
                      )}

                      {/* Sign out */}
                      <button
                        onClick={async () => { setUserMenuOpen(false); await logout(); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <LogOut className="h-3.5 w-3.5" />
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
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Impersonation banner */}
          {user?.orgOverride && (
            <div className="flex items-center justify-between px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-400 text-xs font-medium flex-shrink-0">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>
                  Acting as org:{" "}
                  <span className="font-bold text-amber-300">{user.orgOverrideName ?? user.orgOverride}</span>
                </span>
                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 py-0">
                  IMPERSONATION ACTIVE
                </Badge>
              </div>
              <Button
                size="sm" variant="ghost"
                className="h-6 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 gap-1 px-2"
                onClick={() => void exitImpersonation()}
              >
                <X className="h-3 w-3" /> Exit
              </Button>
            </div>
          )}

          <main className="flex-1 overflow-y-auto bg-background focus:outline-none">
            <div className="py-4 px-4 md:py-6 md:px-8 h-full pb-[72px] md:pb-6">
              {children}
            </div>
          </main>
          <BottomNav />
        </div>
      </div>
    </>
  );
}
