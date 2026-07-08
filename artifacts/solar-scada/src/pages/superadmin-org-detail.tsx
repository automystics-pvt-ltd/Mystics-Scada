/**
 * Super Admin — Organisation Detail Page
 * Shows org metadata, users, plants, alert summary, and recent audit log.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import {
  ChevronLeft,
  Users,
  Zap,
  AlertTriangle,
  FileText,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Pause,
  Play,
  ExternalLink,
  Clock,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { useToast } from "@/hooks/use-toast";

interface OrgUser {
  id: string;
  name: string;
  email: string;
  status: string;
  roleId: string;
  roleName: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

interface OrgPlant {
  id: string;
  name: string;
  capacityMw: number;
  inverterCount: number;
}

interface AlertSummary {
  critical: number;
  major: number;
  minor: number;
  informational: number;
  total: number;
}

interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
}

interface OrgDetailData {
  org: {
    id: string;
    name: string;
    slug: string;
    planTier: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  users: OrgUser[];
  plants: OrgPlant[];
  alertSummary: AlertSummary;
  auditLog: AuditEntry[];
}

const BASE = import.meta.env.BASE_URL;

function planBadge(tier: string) {
  const map: Record<string, string> = {
    enterprise:   "bg-purple-500/15 text-purple-300 border-purple-500/30",
    professional: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    starter:      "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };
  return map[tier] ?? map.starter;
}

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function SuperAdminOrgDetail() {
  const { orgId } = useParams<{ orgId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [newPlan, setNewPlan] = useState("");

  const { data, isLoading } = useQuery<OrgDetailData>({
    queryKey: ["superadmin", "org", orgId],
    queryFn: () =>
      fetch(`${BASE}api/superadmin/orgs/${orgId}`, { credentials: "include" }).then((r) => r.json()) as Promise<OrgDetailData>,
    enabled: !!orgId,
  });

  async function toggleSuspend() {
    if (!data) return;
    const next = data.org.status === "active" ? "suspended" : "active";
    const res = await fetch(`${BASE}api/superadmin/orgs/${orgId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-SCADA-Request": "1" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      toast({ title: `Organisation ${next === "suspended" ? "suspended" : "reactivated"}` });
    }
  }

  async function changePlan() {
    if (!newPlan) return;
    const res = await fetch(`${BASE}api/superadmin/orgs/${orgId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-SCADA-Request": "1" },
      body: JSON.stringify({ planTier: newPlan }),
    });
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      toast({ title: "Plan updated", description: newPlan });
      setShowPlanDialog(false);
    }
  }

  async function impersonate() {
    const res = await fetch(`${BASE}api/superadmin/orgs/${orgId}/impersonate`, {
      method: "POST",
      credentials: "include",
      headers: { "X-SCADA-Request": "1" },
    });
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.invalidateQueries();
      toast({ title: "Now acting as org", description: data?.org.name });
      // Navigate to SCADA view
      window.location.href = `${BASE}`;
    }
  }

  if (isLoading) {
    return (
      <SuperAdminGuard>
        <SuperAdminLayout>
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Loading…</div>
        </SuperAdminLayout>
      </SuperAdminGuard>
    );
  }

  if (!data) {
    return (
      <SuperAdminGuard>
        <SuperAdminLayout>
          <div className="text-center py-12 text-muted-foreground">Organisation not found.</div>
        </SuperAdminLayout>
      </SuperAdminGuard>
    );
  }

  const { org, users, plants, alertSummary, auditLog } = data;

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <Link href="/superadmin/orgs">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground mb-2">
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Organisations
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-foreground">{org.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-muted-foreground font-mono text-xs">{org.slug}</span>
                <Badge variant="outline" className={`text-[10px] capitalize ${planBadge(org.planTier)}`}>
                  {org.planTier}
                </Badge>
                {org.status === "active" ? (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle2 className="h-3 w-3" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-red-400">
                    <XCircle className="h-3 w-3" /> Suspended
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-amber-400 border-amber-400/30 hover:border-amber-400/60" onClick={() => void impersonate()}>
                <ShieldAlert className="h-3.5 w-3.5" />
                Act as Org
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setNewPlan(org.planTier); setShowPlanDialog(true); }}>
                <ExternalLink className="h-3.5 w-3.5" />
                Change Plan
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={`gap-1.5 ${org.status === "active" ? "text-red-400 border-red-400/30 hover:border-red-400/60" : "text-green-400 border-green-400/30 hover:border-green-400/60"}`}
                onClick={() => void toggleSuspend()}
              >
                {org.status === "active" ? <><Pause className="h-3.5 w-3.5" /> Suspend</> : <><Play className="h-3.5 w-3.5" /> Reactivate</>}
              </Button>
            </div>
          </div>

          {/* Alert summary */}
          <div className="grid grid-cols-4 gap-4">
            {(["critical", "major", "minor", "informational"] as const).map((sev) => (
              <Card key={sev} className="border-border">
                <CardContent className="pt-4 pb-4 text-center">
                  <p className={`text-2xl font-bold ${
                    sev === "critical" ? "text-red-400"
                    : sev === "major" ? "text-orange-400"
                    : sev === "minor" ? "text-yellow-400"
                    : "text-blue-400"
                  }`}>{alertSummary[sev]}</p>
                  <p className="text-xs text-muted-foreground capitalize mt-1">{sev}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Plants */}
            <Card className="border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  Plants ({plants.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {plants.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No plants assigned</p>
                ) : (
                  <div className="space-y-2">
                    {plants.map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">{p.inverterCount} inverters</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{p.capacityMw} MW</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Audit log */}
            <Card className="border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Recent Audit Log
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {auditLog.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No audit events recorded</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {auditLog.map((entry) => (
                      <div key={entry.id} className="flex items-start justify-between py-1.5 border-b border-border/50 last:border-0 gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-foreground truncate">{entry.action}</p>
                          <p className="text-[10px] text-muted-foreground">{entry.resourceType} · {entry.resourceId.slice(0, 16)}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {relTime(entry.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Users table */}
          <Card className="border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-primary" />
                Users ({users.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Last Login</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="pl-4 font-medium text-sm">{u.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {u.roleName ?? u.roleId}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs capitalize ${
                          u.status === "active" ? "text-green-400"
                          : u.status === "invited" ? "text-yellow-400"
                          : "text-muted-foreground"
                        }`}>{u.status}</span>
                      </TableCell>
                      <TableCell className="pr-4 text-right text-xs text-muted-foreground">
                        {u.lastLoginAt ? relTime(u.lastLoginAt) : "Never"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">
                        No users in this organisation
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Change Plan Dialog */}
        <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Change Plan</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label>Plan Tier</Label>
              <Select value={newPlan} onValueChange={setNewPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPlanDialog(false)}>Cancel</Button>
              <Button onClick={() => void changePlan()} disabled={!newPlan || newPlan === org.planTier}>
                Update Plan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
