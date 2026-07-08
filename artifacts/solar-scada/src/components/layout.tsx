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
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useTelemetry } from "@/context/TelemetryStreamContext";
import { useAuth } from "@/context/AuthContext";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { connected, lastSync, tickCount } = useTelemetry();
  const { user, logout } = useAuth();
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

  const navigation = [
    { name: "Portfolio",    href: "/",            icon: LayoutDashboard },
    { name: "Alert Center", href: "/alerts",      icon: AlertTriangle   },
    { name: "Work Orders",  href: "/maintenance", icon: Wrench          },
    { name: "Devices",      href: "/devices",     icon: Cpu             },
    { name: "Reports",      href: "/reports",     icon: FileText        },
  ];

  const orgNav = [
    { name: "Organisation", href: "/org", icon: Building2 },
  ];

  const adminNav = [
    { name: "Users",    href: "/admin/users",  icon: Users   },
    { name: "Roles",    href: "/admin/roles",  icon: Shield  },
    { name: "Settings", href: "/settings",     icon: Settings },
  ];

  const platformNav = user?.isSuperAdmin
    ? [{ name: "Platform Admin", href: "/superadmin", icon: ShieldAlert }]
    : [];

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  function getOrgInitials(name: string) {
    return name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">

        {/* App header */}
        <div className="flex-shrink-0 border-b border-sidebar-border">
          {/* Platform brand */}
          <div className="h-10 flex items-center px-4 gap-2">
            <Zap className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="font-bold text-sm tracking-tight">Solar SCADA</span>
          </div>

          {/* Org branding — clickable, navigates to /org */}
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

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-0.5 px-2">
            <div className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest mb-2 px-2 pt-1">
              Operations
            </div>
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link key={item.name} href={item.href}>
                  <div className={`flex items-center px-3 py-2 text-sm font-medium rounded-md gap-3 cursor-pointer transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}>
                    <item.icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-primary" : "text-sidebar-foreground/50"}`} />
                    {item.name}
                  </div>
                </Link>
              );
            })}
          </nav>

          <nav className="space-y-0.5 px-2 mt-6">
            <div className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest mb-2 px-2">
              Administration
            </div>
            {adminNav.map((item) => {
              const isActive = location.startsWith(item.href);
              return (
                <Link key={item.name} href={item.href}>
                  <div className={`flex items-center px-3 py-2 text-sm font-medium rounded-md gap-3 cursor-pointer transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}>
                    <item.icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-primary" : "text-sidebar-foreground/50"}`} />
                    {item.name}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Platform admin section — super admins only */}
          {platformNav.length > 0 && (
            <nav className="space-y-0.5 px-2 mt-6">
              <div className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest mb-2 px-2">
                Platform
              </div>
              {platformNav.map((item) => {
                const isActive = location.startsWith(item.href);
                return (
                  <Link key={item.name} href={item.href}>
                    <div className={`flex items-center px-3 py-2 text-sm font-medium rounded-md gap-3 cursor-pointer transition-colors ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    }`}>
                      <item.icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-primary" : "text-sidebar-foreground/50"}`} />
                      {item.name}
                    </div>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {/* Live IoT Stream indicator */}
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className={`rounded-lg px-3 py-2.5 border transition-colors ${
            connected
              ? "bg-status-normal/8 border-status-normal/20"
              : "bg-status-fault/8 border-status-fault/20"
          }`}>
            <div className="flex items-center justify-between mb-1.5">
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

            {/* Mini sync activity bar */}
            {connected && (
              <div className="mt-2 flex gap-0.5">
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

          {/* Tick counter */}
          <div className="flex items-center justify-between px-1 text-[10px] text-sidebar-foreground/40">
            <span>Frames received</span>
            <span className="font-mono">{tickCount.toLocaleString()}</span>
          </div>

          {/* User info + logout */}
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
                  </div>
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

      {/* Main content — with optional impersonation banner */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Impersonation banner — shown when super admin is acting as an org */}
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
          <div className="py-6 px-8 h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
