/**
 * Operations — /superadmin/operations
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { Settings2, Zap, Building2, Users, AlertTriangle, Wrench, RefreshCw, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL as string;

interface FleetStats {
  totalOrgs: number; activeOrgs: number; totalPlants: number; fleetPowerMw: number;
  alerts: { critical: number; major: number; minor: number; informational: number };
  activeWorkOrders: number; totalUsers: number;
}

export default function SuperAdminOperations() {
  const { data: stats, isLoading, refetch } = useQuery<FleetStats>({
    queryKey: ["superadmin", "stats"],
    queryFn: () => fetch(`${BASE}api/superadmin/stats`, { credentials: "include" }).then(r => r.json()) as Promise<FleetStats>,
    refetchInterval: 30_000,
  });

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Settings2 className="h-6 w-6 text-primary" />Operations</h1>
              <p className="text-sm text-muted-foreground mt-1">Fleet-wide operational overview and quick actions</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          {/* Fleet KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Active Orgs",    value: stats ? `${stats.activeOrgs}/${stats.totalOrgs}` : "—",        icon: Building2,      color: "text-blue-400" },
              { label: "Fleet Power",    value: stats ? `${stats.fleetPowerMw.toFixed(2)} MW` : "—",           icon: Zap,            color: "text-status-normal" },
              { label: "Open Alerts",    value: stats ? stats.alerts.critical + stats.alerts.major : "—",      icon: AlertTriangle,  color: stats?.alerts.critical ? "text-status-fault" : "text-status-warning" },
              { label: "Work Orders",    value: stats?.activeWorkOrders ?? "—",                                 icon: Wrench,         color: "text-orange-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="border border-border rounded-xl p-4 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                {isLoading ? <div className="h-8 bg-muted animate-pulse rounded w-20" /> : (
                  <p className={`text-3xl font-bold font-mono ${color}`}>{value}</p>
                )}
              </div>
            ))}
          </div>

          {/* Alert breakdown */}
          {stats && (
            <div className="border border-border rounded-xl p-5 bg-card">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Active Alert Distribution</h2>
              <div className="grid grid-cols-4 gap-4">
                {(["critical", "major", "minor", "informational"] as const).map(sev => (
                  <div key={sev} className="text-center bg-muted/30 rounded-lg p-3 border border-border/50">
                    <p className={`text-3xl font-bold font-mono ${
                      sev === "critical" ? "text-status-fault"
                      : sev === "major"  ? "text-orange-400"
                      : sev === "minor"  ? "text-status-warning"
                      : "text-blue-400"
                    }`}>{stats.alerts[sev]}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-1">{sev}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick ops */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <h2 className="text-sm font-semibold mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: "View All Organisations",  href: "/superadmin/orgs",          icon: Building2  },
                { label: "Fleet User Directory",    href: "/superadmin/users",          icon: Users      },
                { label: "System Health Monitor",   href: "/superadmin/system-health",  icon: Activity   },
                { label: "Database Admin Console",  href: "/superadmin/db",             icon: Settings2  },
              ].map(({ label, href, icon: Icon }) => (
                <a key={href} href={href}
                  className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-colors group">
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-sm font-medium group-hover:text-primary transition-colors">{label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
