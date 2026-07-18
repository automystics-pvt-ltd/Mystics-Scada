/**
 * SuperAdminLayout — full sidebar shell for the /superadmin/** portal.
 * Matches the Mystics Platform Admin design with grouped sidebar navigation.
 */
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Building2, Users, CreditCard, Flag,
  ClipboardList, Activity, Database, Shield, Settings2,
  Headphones, MessageSquare, Wrench, ArrowLeft, ShieldAlert,
  X, ChevronRight, LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL as string;

const NAV_SECTIONS = [
  {
    items: [
      { label: "Dashboard", href: "/superadmin", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "TENANTS & USERS",
    items: [
      { label: "Tenants",      href: "/superadmin/orgs",          icon: Building2 },
      { label: "Users",        href: "/superadmin/users",          icon: Users },
      { label: "Billing",      href: "/superadmin/billing",        icon: CreditCard },
      { label: "Feature Flags",href: "/superadmin/feature-flags",  icon: Flag },
    ],
  },
  {
    label: "MONITORING",
    items: [
      { label: "Audit Logs",   href: "/superadmin/audit-logs",    icon: ClipboardList },
      { label: "System Health",href: "/superadmin/system-health", icon: Activity },
      { label: "DB Monitor",   href: "/superadmin/db",            icon: Database },
    ],
  },
  {
    label: "ADMINISTRATION",
    items: [
      { label: "Security",      href: "/superadmin/security",       icon: Shield },
      { label: "Operations",    href: "/superadmin/operations",     icon: Settings2 },
      { label: "Support",       href: "/superadmin/support",        icon: Headphones },
      { label: "Communications",href: "/superadmin/communications", icon: MessageSquare },
      { label: "Maintenance",   href: "/superadmin/maintenance",    icon: Wrench },
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
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="flex flex-col w-64 bg-sidebar border-r border-sidebar-border flex-shrink-0">

        {/* Brand header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary">
            <ShieldAlert className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-sidebar-foreground leading-tight">Automystics</div>
            <div className="text-[10px] text-sidebar-foreground/50 font-mono">Platform Admin</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si} className={si > 0 ? "pt-3" : ""}>
              {section.label && (
                <p className="px-2 mb-1 text-[10px] font-semibold tracking-widest text-sidebar-foreground/40 uppercase">
                  {section.label}
                </p>
              )}
              {section.items.map((item) => {
                const active = isActive(item.href, (item as { exact?: boolean }).exact);
                return (
                  <Link key={item.href} href={item.href}>
                    <div className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors ${
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                    }`}>
                      <item.icon className={`h-4 w-4 flex-shrink-0 ${active ? "text-primary" : ""}`} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {active && <ChevronRight className="h-3 w-3 text-primary" />}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-xs font-bold flex-shrink-0">
              {user?.email?.slice(0, 2).toUpperCase() ?? "SA"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-sidebar-foreground truncate">Super Admin</div>
              <div className="text-[10px] text-sidebar-foreground/50 truncate">{user?.email}</div>
            </div>
            <Link href="/">
              <div title="Back to SCADA" className="ml-auto p-1.5 rounded hover:bg-sidebar-accent/50 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors cursor-pointer">
                <ArrowLeft className="h-3.5 w-3.5" />
              </div>
            </Link>
          </div>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Impersonation banner */}
        {user?.orgOverride && (
          <div className="flex items-center justify-between px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-400 text-xs font-medium flex-shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Viewing as org: <span className="font-bold text-amber-300">{user.orgOverrideName ?? user.orgOverride}</span></span>
              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 py-0">IMPERSONATION ACTIVE</Badge>
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

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto py-8 px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
