import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  AlertTriangle,
  Wrench,
  FileText,
  Settings,
  Users,
  Shield,
  Zap,
  Radio,
  WifiOff,
  LogOut,
  ChevronDown,
  ShieldAlert,
  X,
  Cpu,
  Building2,
  Brain,
  Sun,
  Moon,
  Monitor,
  BookOpen,
  Activity,
  Database,
  Server,
  FolderDown,
  Network,
  Bell,
  GitBranch,
  ChevronRight,
  ExternalLink,
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

// ── Nav group definition ──────────────────────────────────────────────────────
interface NavItem { name: string; href: string; icon: React.ElementType; badge?: string }
interface NavGroup { label: string; items: NavItem[]; defaultOpen?: boolean }

function NavSection({ group, location }: { group: NavGroup; location: string }) {
  const hasActive = group.items.some(
    (i) => location === i.href || (i.href !== "/" && location.startsWith(i.href))
  );
  const [open, setOpen] = useState(group.defaultOpen ?? hasActive);

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-2 py-1 mb-0.5 rounded hover:bg-sidebar-accent/30 transition-colors group"
      >
        <span className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest group-hover:text-sidebar-foreground/60 transition-colors">
          {group.label}
        </span>
        <ChevronRight
          className={`h-3 w-3 text-sidebar-foreground/30 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-0.5">
          {group.items.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href}>
                <div
                  className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-md gap-2.5 cursor-pointer transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <item.icon
                    className={`h-3.5 w-3.5 flex-shrink-0 ${
                      isActive ? "text-primary" : "text-sidebar-foreground/50"
                    }`}
                  />
                  <span className="flex-1 truncate">{item.name}</span>
                  {item.badge && (
                    <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-primary/15 text-primary">
                      {item.badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────
export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { connected, lastSync, tickCount } = useTelemetry();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { isActive: crActive, toggle: toggleCR } = useControlRoom();
  const queryClient = useQueryClient();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  async function exitImpersonation() {
    await fetch(`${import.meta.env.BASE_URL}api/superadmin/impersonate`, {
      method: "DELETE",
      credentials: "include",
      headers: { "X-SCADA-Request": "1" },
    });
    await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    await queryClient.invalidateQueries();
  }

  /* "Xs ago" counter — updates every second */
  const [syncAgoLabel, setSyncAgoLabel] = useState<string>("--");
  useEffect(() => {
    function update() {
      if (!lastSync) { setSyncAgoLabel("--"); return; }
      const secs = Math.round((Date.now() - lastSync.getTime()) / 1000);
      setSyncAgoLabel(secs <= 1 ? "just now" : `${secs}s ago`);
    }
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [lastSync]);

  /* Flash the stream dot when a new tick arrives */
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (tickCount === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [tickCount]);

  function getInitials(name: string) {
    return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  }
  function getOrgInitials(name: string) {
    return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  }

  // ── Nav groups ──────────────────────────────────────────────────────────────
  const navGroups: NavGroup[] = [
    {
      label: "Operations",
      defaultOpen: true,
      items: [
        { name: "Portfolio",     href: "/",              icon: LayoutDashboard },
        { name: "AI Insights",   href: "/insights",      icon: Brain           },
        { name: "Alert Center",  href: "/alerts",        icon: AlertTriangle   },
        { name: "Work Orders",   href: "/maintenance",   icon: Wrench          },
        { name: "Reports",       href: "/reports",       icon: FileText        },
      ],
    },
    {
      label: "Devices & Data",
      defaultOpen: true,
      items: [
        { name: "Devices",         href: "/devices",              icon: Cpu        },
        { name: "Firmware",        href: "/devices/firmware",     icon: Cpu        },
        { name: "Dev Templates",   href: "/device-templates",     icon: BookOpen   },
        { name: "Driver Health",   href: "/driver-health",        icon: Activity   },
        { name: "Connect Source",  href: "/connect-data-source",  icon: Database   },
        { name: "FTP Sources",     href: "/ftp-sources",          icon: Server     },
        { name: "Auto-Provision",  href: "/autoprovision",        icon: FolderDown },
      ],
    },
    {
      label: "Administration",
      defaultOpen: true,
      items: [
        { name: "Organisation",     href: "/org",                icon: Building2 },
        { name: "Users",            href: "/admin/users",        icon: Users     },
        { name: "Roles",            href: "/admin/roles",        icon: Shield    },
        { name: "Notifications",    href: "/org/notifications",  icon: Bell      },
        { name: "Gateways",         href: "/org/gateways",       icon: Network   },
        { name: "Audit Log",        href: "/org/audit-log",      icon: Activity  },
        { name: "Settings",         href: "/settings",           icon: Settings  },
      ],
    },
    // Platform Admin section — only for superadmins
    ...(user?.isSuperAdmin
      ? [
          {
            label: "Platform",
            defaultOpen: true,
            items: [
              { name: "Platform Admin", href: "/superadmin", icon: ShieldAlert },
              { name: "Tenants",        href: "/superadmin/orgs",         icon: Building2   },
              { name: "All Users",      href: "/superadmin/users",        icon: Users       },
              { name: "Feature Flags",  href: "/superadmin/feature-flags",icon: GitBranch   },
              { name: "Audit Logs",     href: "/superadmin/audit-logs",   icon: Activity    },
              { name: "Login History",  href: "/superadmin/login-history",icon: Shield      },
              { name: "System Health",  href: "/superadmin/system-health",icon: Activity    },
              { name: "DB Monitor",     href: "/superadmin/db",           icon: Database    },
              { name: "Jobs Monitor",   href: "/superadmin/jobs",         icon: Activity    },
              { name: "Notifications",  href: "/superadmin/notifications",icon: Bell        },
              { name: "System Config",  href: "/superadmin/config",       icon: Settings    },
              { name: "Security",       href: "/superadmin/security",     icon: Shield      },
              { name: "Billing",        href: "/superadmin/billing",      icon: FileText    },
              { name: "Support",        href: "/superadmin/support",      icon: Users       },
            ],
          },
        ]
      : []),
  ];

  return (
    <>
      <ControlRoomOverlay />
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar — hidden on mobile, visible md+ */}
        <div className="hidden md:flex w-60 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex-col flex-shrink-0">

          {/* App header */}
          <div className="flex-shrink-0 border-b border-sidebar-border">
            <div className="h-10 flex items-center px-4 gap-2">
              <Zap className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="font-bold text-sm tracking-tight">Solar SCADA</span>
              <div className="ml-auto flex items-center gap-0.5">
                <NotificationBell />
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                >
                  {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={toggleCR}
                  title="Control Room Mode"
                  className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                    crActive
                      ? "text-primary bg-primary/20"
                      : "text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Org branding */}
            {user && (
              <Link href="/org">
                <div className={`mx-2 mb-2 flex items-center gap-2.5 px-2 py-2 rounded-md cursor-pointer transition-colors ${
                  location.startsWith("/org")
                    ? "bg-sidebar-accent"
                    : "hover:bg-sidebar-accent/50"
                }`}>
                  {user.orgLogoUrl ? (
                    <img
                      src={user.orgLogoUrl}
                      alt={user.orgName ?? "Org"}
                      className="w-7 h-7 rounded-md object-cover border border-sidebar-border flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-md bg-primary/20 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-primary">
                        {getOrgInitials(user.orgName ?? user.orgId)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-sidebar-foreground/90 truncate">
                      {user.orgName ?? "My Organisation"}
                    </p>
                    <p className="text-[10px] text-sidebar-foreground/40">Organisation settings</p>
                  </div>
                </div>
              </Link>
            )}
          </div>

          {/* Scrollable nav */}
          <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
            {navGroups.map((group) => (
              <NavSection key={group.label} group={group} location={location} />
            ))}

            {/* Platform Admin login shortcut — always visible for non-superadmins */}
            {!user?.isSuperAdmin && (
              <div className="pt-3 border-t border-sidebar-border/50 mt-3">
                <a
                  href={`${import.meta.env.BASE_URL}platform-admin`}
                  className="flex items-center gap-2.5 px-3 py-1.5 text-sm font-medium rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                >
                  <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="flex-1 truncate">Platform Admin</span>
                  <ExternalLink className="h-3 w-3 opacity-50" />
                </a>
              </div>
            )}
          </div>

          {/* Bottom: stream indicator + user menu */}
          <div className="p-3 border-t border-sidebar-border space-y-2 flex-shrink-0">
            {/* IoT stream indicator */}
            <div className={`rounded-lg px-3 py-2 border transition-colors ${
              connected
                ? "bg-status-normal/8 border-status-normal/20"
                : "bg-status-fault/8 border-status-fault/20"
            }`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {connected ? (
                    <Radio className={`h-3.5 w-3.5 text-status-normal ${flash ? "animate-ping-once" : "animate-pulse-subtle"}`} />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-status-fault" />
                  )}
                  <span className={`text-xs font-semibold ${connected ? "text-status-normal" : "text-status-fault"}`}>
                    {connected ? "IoT Stream Live" : "Stream Offline"}
                  </span>
                </div>
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                  connected ? "bg-status-normal/15 text-status-normal" : "bg-status-fault/15 text-status-fault"
                }`}>
                  {connected ? "SSE" : "ERR"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-sidebar-foreground/50">
                <span>Last sync</span>
                <span className={`font-mono ${flash ? "text-status-normal" : ""} transition-colors`}>
                  {syncAgoLabel}
                </span>
              </div>
              {connected && (
                <div className="mt-1.5 flex gap-0.5">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                        flash && i >= 8 - (tickCount % 8) - 1
                          ? "bg-status-normal"
                          : "bg-status-normal/20"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Frames counter */}
            <div className="flex items-center justify-between px-1 text-[10px] text-sidebar-foreground/40">
              <span>Frames received</span>
              <span className="font-mono">{tickCount.toLocaleString()}</span>
            </div>

            {/* User info + menu */}
            {user && (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-primary">{getInitials(user.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-sidebar-foreground truncate">{user.name}</p>
                    <p className="text-[10px] text-sidebar-foreground/40 truncate">{user.roleName}</p>
                  </div>
                  <ChevronDown className={`h-3 w-3 text-sidebar-foreground/40 flex-shrink-0 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {userMenuOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-xs font-medium text-foreground truncate">{user.email}</p>
                      <p className="text-[10px] text-muted-foreground">{user.roleName}</p>
                      {user.isSuperAdmin && (
                        <Badge className="mt-1 text-[9px] h-4 px-1.5 bg-purple-500/15 text-purple-400 border-purple-500/30">
                          SUPER ADMIN
                        </Badge>
                      )}
                    </div>

                    {/* Platform Admin login — always shown so it's discoverable */}
                    {!user.isSuperAdmin && (
                      <a
                        href={`${import.meta.env.BASE_URL}platform-admin`}
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors border-b border-border"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Platform Admin Login
                        <ExternalLink className="h-3 w-3 ml-auto opacity-60" />
                      </a>
                    )}

                    {user.isSuperAdmin && (
                      <Link href="/superadmin">
                        <div
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors border-b border-border cursor-pointer"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Platform Admin Portal
                        </div>
                      </Link>
                    )}

                    <button
                      onClick={async () => {
                        setUserMenuOpen(false);
                        await logout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
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

        {/* Main content */}
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
                size="sm"
                variant="ghost"
                className="h-6 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 gap-1 px-2"
                onClick={() => void exitImpersonation()}
              >
                <X className="h-3 w-3" />
                Exit
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
