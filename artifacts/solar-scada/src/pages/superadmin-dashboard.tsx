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
    case "fault":   return "text-red-400";
    case "offline": return "text-zinc-400";
    case "warning": return "text-yellow-400";
    default:        return "text-green-400";
  }
}

function planBadge(tier: string) {
  const map: Record<string, string> = {
    enterprise:    "bg-purple-500/15 text-purple-300 border-purple-500/30",
    professional:  "bg-blue-500/15 text-blue-300 border-blue-500/30",
    starter:       "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
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
      label: "Organisations",
      value: stats?.totalOrgs ?? "—",
      sub: `${stats?.activeOrgs ?? 0} active`,
      icon: Building2,
      color: "text-blue-400",
    },
    {
      label: "Fleet Power",
      value: stats ? `${stats.fleetPowerMw.toFixed(2)} MW` : "—",
      sub: `${stats?.totalPlants ?? 0} plants`,
      icon: Zap,
      color: "text-yellow-400",
    },
    {
      label: "Active Alerts",
      value: totalAlerts || "—",
      sub: stats ? `${stats.alerts.critical} critical` : "",
      icon: AlertTriangle,
      color: stats?.alerts.critical ? "text-red-400" : "text-green-400",
    },
    {
      label: "Work Orders",
      value: stats?.activeWorkOrders ?? "—",
      sub: "active / open",
      icon: Wrench,
      color: "text-orange-400",
    },
    {
      label: "Total Users",
      value: stats?.totalUsers ?? "—",
      sub: "across all orgs",
      icon: Users,
      color: "text-purple-400",
    },
  ];

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" />
              Platform Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Fleet-wide health across all customer organisations
            </p>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {KPIs.map((kpi) => (
              <Card key={kpi.label} className="border-border">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.sub}</p>
                    </div>
                    <kpi.icon className={`h-5 w-5 mt-1 ${kpi.color}`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Alert breakdown */}
          {stats && (
            <Card className="border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Alert Severity Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-4 gap-4">
                  {(["critical", "major", "minor", "informational"] as const).map((sev) => (
                    <div key={sev} className="text-center">
                      <p className={`text-xl font-bold ${
                        sev === "critical" ? "text-red-400"
                        : sev === "major" ? "text-orange-400"
                        : sev === "minor" ? "text-yellow-400"
                        : "text-blue-400"
                      }`}>{stats.alerts[sev]}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{sev}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Org table */}
          <Card className="border-border">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">All Organisations</CardTitle>
              <Link href="/superadmin/orgs">
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  <TrendingUp className="h-3.5 w-3.5 mr-1" />
                  Manage
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Organisation</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead className="text-right">Plants</TableHead>
                    <TableHead className="text-right">Power MW</TableHead>
                    <TableHead className="text-right">Alerts</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell className="pl-4 font-medium">
                        <div>
                          <p className="text-sm">{org.name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">{org.slug}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] capitalize ${planBadge(org.planTier)}`}>
                          {org.planTier}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {org.status === "active" ? (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-400">
                            <XCircle className="h-3 w-3" /> Suspended
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium capitalize ${healthColor(org.worstHealth)}`}>
                          {org.worstHealth}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">{org.userCount}</TableCell>
                      <TableCell className="text-right text-sm">{org.plantCount}</TableCell>
                      <TableCell className="text-right text-sm">{org.powerMw.toFixed(2)}</TableCell>
                      <TableCell className={`text-right text-sm ${org.activeAlerts > 0 ? "text-red-400 font-medium" : ""}`}>
                        {org.activeAlerts}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/superadmin/orgs/${org.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 px-2">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-amber-400 hover:text-amber-300"
                            onClick={() => void impersonate(org)}
                            title="Act as org"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 px-2 ${org.status === "active" ? "text-red-400 hover:text-red-300" : "text-green-400 hover:text-green-300"}`}
                            onClick={() => void toggleSuspend(org)}
                            title={org.status === "active" ? "Suspend" : "Reactivate"}
                          >
                            {org.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {orgs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-8">
                        No organisations found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
