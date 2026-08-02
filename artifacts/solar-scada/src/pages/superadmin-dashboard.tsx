/**
 * Super Admin Fleet Dashboard
 * Fleet-wide KPIs + org health overview table with quick actions.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Building2,
  Zap,
  AlertTriangle,
  Wrench,
  Users,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Eye,
  ShieldAlert,
  Pause,
  Play,
  Monitor,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { useToast } from "@/hooks/use-toast";

interface FleetStats {
  totalOrgs: number;
  activeOrgs: number;
  totalPlants: number;
  fleetPowerMw: number;
  alerts: { critical: number; major: number; minor: number; informational: number };
  activeWorkOrders: number;
  totalUsers: number;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  planTier: string;
  status: string;
  userCount: number;
  plantCount: number;
  powerMw: number;
  worstHealth: string;
  activeAlerts: number;
  createdAt: string;
}

const BASE = import.meta.env.BASE_URL;

function healthColor(h: string) {
  switch (h) {
    case "fault":   return "text-status-fault";
    case "offline": return "text-muted-foreground";
    case "warning": return "text-status-warning";
    default:        return "text-status-normal";
  }
}

function planBadge(tier: string) {
  const map: Record<string, string> = {
    enterprise:    "bg-accent-brand/10 text-accent-brand border-accent-brand/50",
    professional:  "bg-blue-500/10 text-blue-400 border-blue-500/50",
    starter:       "bg-white/5 text-muted-foreground border-border/50",
  };
  return map[tier] ?? map.starter;
}

export default function SuperAdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: stats } = useQuery<FleetStats>({
    queryKey: ["superadmin", "stats"],
    queryFn: () => fetch(`${BASE}api/superadmin/stats`, { credentials: "include" }).then((r) => r.json()) as Promise<FleetStats>,
    refetchInterval: 30_000,
  });

  const { data: orgs = [] } = useQuery<OrgRow[]>({
    queryKey: ["superadmin", "orgs"],
    queryFn: () => fetch(`${BASE}api/superadmin/orgs`, { credentials: "include" }).then((r) => r.json()) as Promise<OrgRow[]>,
    refetchInterval: 30_000,
  });

  async function toggleSuspend(org: OrgRow) {
    const next = org.status === "active" ? "suspended" : "active";
    const res = await fetch(`${BASE}api/superadmin/orgs/${org.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-SCADA-Request": "1" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      toast({ title: `Organisation ${next === "suspended" ? "suspended" : "reactivated"}`, description: org.name });
    }
  }

  async function impersonate(org: OrgRow) {
    const res = await fetch(`${BASE}api/superadmin/orgs/${org.id}/impersonate`, {
      method: "POST",
      credentials: "include",
      headers: { "X-SCADA-Request": "1" },
    });
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.invalidateQueries();
      toast({ title: "Now acting as org", description: org.name });
      navigate("/");
    }
  }

  const totalAlerts = stats
    ? stats.alerts.critical + stats.alerts.major + stats.alerts.minor + stats.alerts.informational
    : 0;

  const KPIs = [
    {
      label: "ORGANISATIONS",
      value: stats?.totalOrgs ?? "—",
      sub: `${stats?.activeOrgs ?? 0} ACTIVE`,
      icon: Building2,
      color: "text-accent-brand",
    },
    {
      label: "FLEET POWER",
      value: stats ? `${stats.fleetPowerMw.toFixed(2)} MW` : "—",
      sub: `${stats?.totalPlants ?? 0} PLANTS`,
      icon: Zap,
      color: "text-status-warning",
    },
    {
      label: "ACTIVE ALERTS",
      value: totalAlerts || "—",
      sub: stats ? `${stats.alerts.critical} CRITICAL` : "",
      icon: AlertTriangle,
      color: stats?.alerts.critical ? "text-status-fault" : "text-status-normal",
    },
    {
      label: "WORK ORDERS",
      value: stats?.activeWorkOrders ?? "—",
      sub: "ACTIVE / OPEN",
      icon: Wrench,
      color: "text-status-warning",
    },
    {
      label: "TOTAL USERS",
      value: stats?.totalUsers ?? "—",
      sub: "ACROSS ALL ORGS",
      icon: Users,
      color: "text-accent-brand",
    },
  ];

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div className="border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <h1 className="font-mono text-2xl font-bold text-foreground flex items-center gap-3 uppercase tracking-widest">
              <Monitor className="h-6 w-6 text-accent-brand" />
              PLATFORM DASHBOARD
            </h1>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">
              FLEET-WIDE HEALTH ACROSS ALL CUSTOMER ORGANISATIONS
            </p>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {KPIs.map((kpi) => (
              <div key={kpi.label} className="border border-border/50 bg-card/40 p-4 relative group hover:border-accent-brand/50 transition-colors">
                <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-accent-brand transition-colors" />
                <div className="flex items-start justify-between pl-2">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{kpi.label}</p>
                    <p className="font-mono text-2xl font-bold text-foreground mt-2">{kpi.value}</p>
                    <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mt-1">{kpi.sub}</p>
                  </div>
                  <kpi.icon className={`h-5 w-5 mt-1 opacity-80 ${kpi.color}`} />
                </div>
              </div>
            ))}
          </div>

          {/* Alert breakdown */}
          {stats && (
            <div className="border border-border/50 bg-card/40">
              <div className="px-4 py-3 border-b border-border/50 bg-card/60">
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-bold">ALERT SEVERITY BREAKDOWN</h3>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-4 gap-4">
                  {(["critical", "major", "minor", "informational"] as const).map((sev) => (
                    <div key={sev} className="text-center border border-border/30 bg-card/20 py-4">
                      <p className={`font-mono text-2xl font-bold ${
                        sev === "critical" ? "text-status-fault"
                        : sev === "major" ? "text-status-warning"
                        : sev === "minor" ? "text-accent-brand"
                        : "text-blue-400"
                      }`}>{stats.alerts[sev]}</p>
                      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1">{sev}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Org table */}
          <div className="border border-border/50 bg-card/40">
            <div className="px-4 py-3 border-b border-border/50 bg-card/60 flex items-center justify-between">
              <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground">ALL ORGANISATIONS</h3>
              <Link href="/superadmin/orgs">
                <Button variant="outline" size="sm" className="h-7 text-[10px] font-mono uppercase tracking-widest border-accent-brand/30 text-accent-brand hover:bg-accent-brand/10">
                  <TrendingUp className="h-3 w-3 mr-2" />
                  MANAGE
                </Button>
              </Link>
            </div>
            <div className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-card/60 border-b border-border/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">ORGANISATION</TableHead>
                    <TableHead className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">PLAN</TableHead>
                    <TableHead className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">STATUS</TableHead>
                    <TableHead className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">HEALTH</TableHead>
                    <TableHead className="text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground">USERS</TableHead>
                    <TableHead className="text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground">PLANTS</TableHead>
                    <TableHead className="text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground">POWER MW</TableHead>
                    <TableHead className="text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground">ALERTS</TableHead>
                    <TableHead className="pr-4 text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => (
                    <TableRow key={org.id} className="border-b border-border/30 hover:bg-white/5 transition-colors">
                      <TableCell className="pl-4 py-3">
                        <div>
                          <p className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">{org.name}</p>
                          <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5">{org.slug}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-mono text-[9px] uppercase tracking-widest ${planBadge(org.planTier)} rounded-none`}>
                          {org.planTier}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {org.status === "active" ? (
                          <span className="flex items-center gap-1.5 font-mono text-[10px] text-status-normal font-bold">
                            <CheckCircle2 className="h-3 w-3" /> ACTIVE
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 font-mono text-[10px] text-status-fault font-bold">
                            <XCircle className="h-3 w-3" /> SUSPENDED
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono text-[10px] uppercase tracking-widest font-bold ${healthColor(org.worstHealth)}`}>
                          {org.worstHealth}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{org.userCount}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{org.plantCount}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{org.powerMw.toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-mono text-xs ${org.activeAlerts > 0 ? "text-status-fault font-bold" : "text-muted-foreground"}`}>
                        {org.activeAlerts}
                      </TableCell>
                      <TableCell className="pr-4 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/superadmin/orgs/${org.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 border border-transparent hover:border-accent-brand/50 hover:text-accent-brand">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-status-warning hover:text-status-warning border border-transparent hover:border-status-warning/50 hover:bg-status-warning/10"
                            onClick={() => void impersonate(org)}
                            title="ACT AS ORG"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 w-7 p-0 border border-transparent ${org.status === "active" ? "text-status-fault hover:text-status-fault hover:border-status-fault/50 hover:bg-status-fault/10" : "text-status-normal hover:text-status-normal hover:border-status-normal/50 hover:bg-status-normal/10"}`}
                            onClick={() => void toggleSuspend(org)}
                            title={org.status === "active" ? "SUSPEND" : "REACTIVATE"}
                          >
                            {org.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {orgs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground font-mono text-[10px] uppercase tracking-widest py-8">
                        NO ORGANISATIONS FOUND
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
