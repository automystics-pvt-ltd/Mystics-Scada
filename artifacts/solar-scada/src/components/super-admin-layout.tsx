/**
 * SuperAdminLayout — standalone shell for the /superadmin/** portal.
 *
 * Features:
 * - Distinctive dark header bar with platform branding
 * - Navigation: Dashboard | Organizations
 * - "Acting as [OrgName]" impersonation banner with Exit button
 * - Link back to the normal SCADA operations view
 */
import { Link, useLocation } from "wouter";
import {
  Building2,
  LayoutDashboard,
  ArrowLeft,
  LogOut,
  ShieldAlert,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const NAV = [
  { label: "Dashboard",     href: "/superadmin",       icon: LayoutDashboard },
  { label: "Organizations", href: "/superadmin/orgs",  icon: Building2 },
];

export function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  async function exitImpersonation() {
    await fetch(`${import.meta.env.BASE_URL}api/superadmin/impersonate`, {
      method: "DELETE",
      credentials: "include",
      headers: { "X-SCADA-Request": "1" },
    });
    // Invalidate auth so the banner disappears and resolveOrgId resets
    await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    await queryClient.invalidateQueries();
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* ── Impersonation banner ───────────────────────────────────────── */}
      {user?.orgOverride && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-400 text-xs font-medium flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>
              Viewing as org:{" "}
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

      {/* ── Top header ────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-0 h-14 border-b border-border bg-sidebar flex-shrink-0">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <div>
            <span className="font-bold text-sm text-sidebar-foreground">Platform Admin</span>
            <span className="ml-2 text-[10px] text-muted-foreground font-mono">Automystics Technologies</span>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const isActive =
              item.href === "/superadmin"
                ? location === "/superadmin"
                : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{user?.email}</span>
          <Link href="/">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer">
              <ArrowLeft className="h-3.5 w-3.5" />
              SCADA View
            </div>
          </Link>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto py-8 px-6">
          {children}
        </div>
      </main>
    </div>
  );
}
