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
          <div className="flex items-center justify-between border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <div>
              <h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">
                <Settings2 className="h-6 w-6 text-accent-brand" />
                OPERATIONS OVERVIEW
              </h1>
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">FLEET-WIDE OPERATIONAL STATUS AND QUICK ACTIONS</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="font-mono text-[9px] uppercase tracking-widest border-accent-brand/30 text-accent-brand hover:bg-accent-brand/10 rounded-none gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> REFRESH
            </Button>
          </div>

          {/* Fleet KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "ACTIVE ORGS",    value: stats ? `${stats.activeOrgs}/${stats.totalOrgs}` : "—",        icon: Building2,      color: "text-blue-400" },
              { label: "FLEET POWER",    value: stats ? `${stats.fleetPowerMw.toFixed(2)} MW` : "—",           icon: Zap,            color: "text-status-normal" },
              { label: "OPEN ALERTS",    value: stats ? stats.alerts.critical + stats.alerts.major : "—",      icon: AlertTriangle,  color: stats?.alerts.critical ? "text-status-fault" : "text-status-warning" },
              { label: "WORK ORDERS",    value: stats?.activeWorkOrders ?? "—",                                 icon: Wrench,         color: "text-orange-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="border border-border/50 bg-card/40 p-4 relative group transition-colors hover:border-border">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-border/30 group-hover:bg-border/60 transition-colors" />
                <div className="flex items-center justify-between mb-3">
                  <p className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                {isLoading ? <div className="h-8 bg-white/5 animate-pulse w-20" /> : (
                  <p className={`text-3xl font-bold font-mono ${color}`}>{value}</p>
                )}
              </div>
            ))}
          </div>

          {/* Alert breakdown */}
          {stats && (
            <div className="border border-border/50 bg-card/40">
              <div className="px-4 py-3 border-b border-border/50 bg-card/60 flex items-center justify-between">
                <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-accent-brand" />
                  ACTIVE ALERT DISTRIBUTION
                </h2>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-4 gap-4">
                  {(["critical", "major", "minor", "informational"] as const).map(sev => (
                    <div key={sev} className="text-center bg-card/60 p-4 border border-border/30">
                      <p className={`text-4xl font-bold font-mono ${
                        sev === "critical" ? "text-status-fault drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                        : sev === "major"  ? "text-orange-400 drop-shadow-[0_0_8px_rgba(249,115,22,0.6)]"
                        : sev === "minor"  ? "text-status-warning drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                        : "text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.6)]"
                      }`}>{stats.alerts[sev]}</p>
                      <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest mt-2">{sev}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Quick ops */}
          <div className="border border-border/50 bg-card/40">
            <div className="px-4 py-3 border-b border-border/50 bg-card/60 flex items-center justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground">QUICK ACTIONS</h2>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "VIEW ALL ORGANISATIONS",  href: "/superadmin/orgs",          icon: Building2  },
                  { label: "FLEET USER DIRECTORY",    href: "/superadmin/users",          icon: Users      },
                  { label: "SYSTEM HEALTH MONITOR",   href: "/superadmin/system-health",  icon: Activity   },
                  { label: "DATABASE ADMIN CONSOLE",  href: "/superadmin/db",             icon: Settings2  },
                ].map(({ label, href, icon: Icon }) => (
                  <a key={href} href={href}
                    className="flex items-center gap-3 px-4 py-4 border border-border/50 bg-card/60 hover:border-accent-brand hover:bg-accent-brand/5 transition-all group relative overflow-hidden">
                    <div className="absolute left-0 top-0 w-1 h-full bg-border/50 group-hover:bg-accent-brand transition-colors" />
                    <Icon className="h-4 w-4 text-muted-foreground group-hover:text-accent-brand transition-colors ml-1" />
                    <span className="font-mono text-[10px] font-bold group-hover:text-accent-brand transition-colors uppercase tracking-widest">{label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
