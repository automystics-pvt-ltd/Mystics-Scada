/**
 * SuperAdminLayout — full sidebar shell for the /superadmin/** portal.
 * Matches the Mystics Platform Admin design with grouped sidebar navigation.
 */
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Building2, Users, CreditCard, Flag,
  ClipboardList, Activity, Database, Shield, Settings2,
  Headphones, Bell, Wrench, ArrowLeft, ShieldAlert,
  X, ChevronRight, Timer, Settings, LogIn,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL as string;

const NAV_SECTIONS = [
  {
    items: [
      { label: "DASHBOARD", href: "/superadmin", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "TENANTS & USERS",
    items: [
      { label: "TENANTS",      href: "/superadmin/orgs",          icon: Building2 },
      { label: "USERS",        href: "/superadmin/users",          icon: Users },
      { label: "BILLING",      href: "/superadmin/billing",        icon: CreditCard },
      { label: "FEATURE FLAGS",href: "/superadmin/feature-flags",  icon: Flag },
    ],
  },
  {
    label: "MONITORING",
    items: [
      { label: "AUDIT LOGS",    href: "/superadmin/audit-logs",    icon: ClipboardList },
      { label: "LOGIN HISTORY", href: "/superadmin/login-history", icon: LogIn },
      { label: "SYSTEM HEALTH", href: "/superadmin/system-health", icon: Activity },
      { label: "DB MONITOR",    href: "/superadmin/db",            icon: Database },
    ],
  },
  {
    label: "ADMINISTRATION",
    items: [
      { label: "SECURITY",         href: "/superadmin/security",       icon: Shield },
      { label: "JOBS MONITOR",     href: "/superadmin/jobs",           icon: Timer },
      { label: "NOTIFICATIONS",    href: "/superadmin/notifications",  icon: Bell },
      { label: "SYSTEM CONFIG",    href: "/superadmin/config",         icon: Settings },
      { label: "SUPPORT",          href: "/superadmin/support",        icon: Headphones },
      { label: "MAINTENANCE",      href: "/superadmin/maintenance",    icon: Wrench },
    ],
  },
];

export function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  async function exitImpersonation() {
    await fetch(`${BASE}api/superadmin/impersonate`, {
      method: "DELETE",
      credentials: "include",
      headers: { "X-SCADA-Request": "1" },
    });
    await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    await queryClient.invalidateQueries();
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return location === href;
    return location.startsWith(href);
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background text-foreground">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="flex flex-col w-64 bg-card/90 border-r border-accent-brand/50 flex-shrink-0 relative">
        <div className="absolute top-0 right-0 w-[1px] h-full bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />

        {/* Brand header */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border/50 bg-card/60 relative">
          <div className="absolute bottom-0 left-0 w-1/2 h-[1px] bg-accent-brand shadow-[0_0_10px_rgba(0,195,255,0.6)]" />
          <div className="flex items-center justify-center w-8 h-8 bg-accent-brand/10 text-accent-brand border border-accent-brand/50 shadow-[inset_0_0_10px_rgba(0,195,255,0.2)] flex-shrink-0">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-bold text-foreground tracking-widest uppercase">AUTOMYSTICS</div>
            <div className="font-mono text-[8px] text-accent-brand tracking-widest uppercase mt-0.5">PLATFORM ADMIN</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-2 scrollbar-none">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si} className={si > 0 ? "pt-4 border-t border-border/30 mt-2" : ""}>
              {section.label && (
                <p className="px-3 mb-2 font-mono text-[8px] font-bold tracking-widest text-muted-foreground uppercase">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href, (item as { exact?: boolean }).exact);
                  return (
                    <Link key={item.href} href={item.href}>
                      <div className={`flex items-center gap-3 px-3 py-2.5 font-mono text-[9px] font-bold uppercase tracking-widest cursor-pointer transition-colors relative ${
                        active
                          ? "text-accent-brand bg-accent-brand/5"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                      }`}>
                        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-2/3 bg-accent-brand shadow-[0_0_8px_rgba(0,195,255,0.8)]" />}
                        <item.icon className={`h-3.5 w-3.5 flex-shrink-0 ${active ? "text-accent-brand" : "opacity-60"}`} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {active && <ChevronRight className="h-3 w-3 text-accent-brand opacity-80" />}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-border/50 p-4 bg-card/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-white/5 text-muted-foreground border border-border/50 text-[9px] font-mono font-bold flex-shrink-0">
              {user?.email?.slice(0, 2).toUpperCase() ?? "SA"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[9px] font-bold text-foreground truncate uppercase tracking-widest">SUPER ADMIN</div>
              <div className="font-mono text-[8px] text-muted-foreground truncate uppercase tracking-widest mt-0.5">{user?.email}</div>
            </div>
            <Link href="/">
              <div title="BACK TO SCADA" className="p-2 border border-border/50 bg-card/40 hover:border-accent-brand hover:text-accent-brand text-muted-foreground transition-colors cursor-pointer rounded-none">
                <ArrowLeft className="h-3 w-3" />
              </div>
            </Link>
          </div>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-card/95 relative">
        <div className="absolute inset-0 pointer-events-none opacity-[0.015] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

        {/* Impersonation banner */}
        {user?.orgOverride && (
          <div className="flex items-center justify-between px-5 py-3 bg-status-warning/10 border-b border-status-warning/50 text-status-warning flex-shrink-0 relative">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-status-warning shadow-[0_0_15px_rgba(245,158,11,0.8)]" />
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-4 w-4 drop-shadow-[0_0_5px_rgba(245,158,11,0.6)]" />
              <span className="font-mono text-[10px] uppercase tracking-widest font-bold">VIEWING AS ORG: <span className="text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.4)]">{user.orgOverrideName ?? user.orgOverride}</span></span>
              <Badge variant="outline" className="font-mono text-[8px] border-status-warning/50 text-status-warning bg-status-warning/20 rounded-none px-1.5 py-0.5 ml-2">IMPERSONATION ACTIVE</Badge>
            </div>
            <Button
              size="sm" variant="ghost"
              className="font-mono text-[9px] font-bold uppercase tracking-widest text-status-warning hover:text-black hover:bg-status-warning gap-1.5 px-3 rounded-none transition-colors border border-status-warning/50"
              onClick={() => void exitImpersonation()}
            >
              <X className="h-3 w-3" /> EXIT
            </Button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-7xl mx-auto py-8 px-6 pb-24">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
