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
    enterprise:   "bg-accent-brand/10 text-accent-brand border-accent-brand/50",
    professional: "bg-blue-500/10 text-blue-400 border-blue-500/50",
    starter:      "bg-white/5 text-muted-foreground border-border/50",
  };
  return map[tier] ?? map.starter;
}

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "JUST NOW";
  if (m < 60) return `T-${m}M`;
  const h = Math.floor(m / 60);
  if (h < 24) return `T-${h}H`;
  const d = Math.floor(h / 24);
  return `T-${d}D`;
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
          <div className="flex flex-col items-center justify-center h-48 space-y-4">
            <div className="w-8 h-8 border border-accent-brand border-t-transparent rounded-full animate-spin" />
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent-brand">FETCHING ORG TELEMETRY...</p>
          </div>
        </SuperAdminLayout>
      </SuperAdminGuard>
    );
  }

  if (!data) {
    return (
      <SuperAdminGuard>
        <SuperAdminLayout>
          <div className="text-center py-16 border border-status-fault/50 bg-status-fault/5">
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold text-status-fault">ORGANISATION NOT FOUND.</p>
          </div>
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
          <div className="flex items-start justify-between border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <div>
              <Link href="/superadmin/orgs">
                <Button variant="ghost" size="sm" className="h-6 px-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-accent-brand mb-2">
                  <ChevronLeft className="h-3 w-3 mr-1" />
                  ORGANISATIONS
                </Button>
              </Link>
              <h1 className="font-mono text-2xl font-bold text-foreground uppercase tracking-widest">{org.name}</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest bg-white/5 border border-border/50 px-2 py-0.5">{org.slug}</span>
                <Badge variant="outline" className={`font-mono text-[9px] uppercase tracking-widest rounded-none ${planBadge(org.planTier)}`}>
                  {org.planTier}
                </Badge>
                {org.status === "active" ? (
                  <span className="flex items-center gap-1.5 font-mono text-[10px] text-status-normal font-bold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> ACTIVE
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-mono text-[10px] text-status-fault font-bold">
                    <XCircle className="h-3.5 w-3.5" /> SUSPENDED
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="font-mono text-[9px] uppercase tracking-widest rounded-none text-status-warning border-status-warning/50 hover:bg-status-warning/10" onClick={() => void impersonate()}>
                <ShieldAlert className="h-3.5 w-3.5 mr-2" />
                ACT AS ORG
              </Button>
              <Button variant="outline" size="sm" className="font-mono text-[9px] uppercase tracking-widest rounded-none border-border/50 hover:bg-white/5 text-foreground" onClick={() => { setNewPlan(org.planTier); setShowPlanDialog(true); }}>
                <ExternalLink className="h-3.5 w-3.5 mr-2" />
                CHANGE PLAN
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={`font-mono text-[9px] uppercase tracking-widest rounded-none ${org.status === "active" ? "text-status-fault border-status-fault/50 hover:bg-status-fault/10" : "text-status-normal border-status-normal/50 hover:bg-status-normal/10"}`}
                onClick={() => void toggleSuspend()}
              >
                {org.status === "active" ? <><Pause className="h-3.5 w-3.5 mr-2" /> SUSPEND</> : <><Play className="h-3.5 w-3.5 mr-2" /> REACTIVATE</>}
              </Button>
            </div>
          </div>

          {/* Alert summary */}
          <div className="grid grid-cols-4 gap-4">
            {(["critical", "major", "minor", "informational"] as const).map((sev) => (
              <div key={sev} className="border border-border/50 bg-card/40 text-center py-4 relative group hover:border-accent-brand/50 transition-colors">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-border/30 group-hover:bg-accent-brand/50 transition-colors" />
                <p className={`font-mono text-3xl font-bold ${
                  sev === "critical" ? "text-status-fault"
                  : sev === "major" ? "text-status-warning"
                  : sev === "minor" ? "text-accent-brand"
                  : "text-blue-400"
                }`}>{alertSummary[sev]}</p>
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-2">{sev} ALERTS</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Plants */}
            <div className="border border-border/50 bg-card/40 flex flex-col">
              <div className="px-4 py-3 border-b border-border/50 bg-card/60 flex items-center justify-between">
                <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-accent-brand" />
                  PLANTS ({plants.length})
                </h3>
              </div>
              <div className="p-0 flex-1 overflow-y-auto max-h-64 custom-scrollbar">
                {plants.length === 0 ? (
                  <p className="p-4 text-center font-mono text-[9px] uppercase tracking-widest text-muted-foreground">NO PLANTS ASSIGNED</p>
                ) : (
                  <div className="divide-y divide-border/30">
                    {plants.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-3 hover:bg-white/5 transition-colors">
                        <div>
                          <p className="font-mono text-[11px] font-bold text-foreground uppercase tracking-widest">{p.name}</p>
                          <p className="font-mono text-[9px] text-muted-foreground mt-1 uppercase tracking-widest">{p.inverterCount} INVERTERS</p>
                        </div>
                        <p className="font-mono text-xs text-accent-brand font-bold">{p.capacityMw} MW</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Audit log */}
            <div className="border border-border/50 bg-card/40 flex flex-col">
              <div className="px-4 py-3 border-b border-border/50 bg-card/60 flex items-center justify-between">
                <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-accent-brand" />
                  RECENT AUDIT LOG
                </h3>
              </div>
              <div className="p-0 flex-1 overflow-y-auto max-h-64 custom-scrollbar">
                {auditLog.length === 0 ? (
                  <p className="p-4 text-center font-mono text-[9px] uppercase tracking-widest text-muted-foreground">NO AUDIT EVENTS RECORDED</p>
                ) : (
                  <div className="divide-y divide-border/30">
                    {auditLog.map((entry) => (
                      <div key={entry.id} className="flex items-start justify-between p-3 hover:bg-white/5 transition-colors gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] font-bold text-foreground truncate">{entry.action}</p>
                          <p className="font-mono text-[8px] text-muted-foreground mt-1 uppercase tracking-widest">{entry.resourceType} // {entry.resourceId.slice(0, 16)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/60">
                          <Clock className="h-3 w-3" />
                          {relTime(entry.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Users table */}
          <div className="border border-border/50 bg-card/40">
            <div className="px-4 py-3 border-b border-border/50 bg-card/60 flex items-center justify-between">
              <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-accent-brand" />
                USERS ({users.length})
              </h3>
            </div>
            <div className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-card/60 border-b border-border/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">NAME</TableHead>
                    <TableHead className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">EMAIL</TableHead>
                    <TableHead className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">ROLE</TableHead>
                    <TableHead className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">STATUS</TableHead>
                    <TableHead className="pr-4 text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground">LAST LOGIN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} className="border-b border-border/30 hover:bg-white/5 transition-colors">
                      <TableCell className="pl-4 font-mono text-xs font-bold text-foreground uppercase tracking-widest">{u.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground uppercase">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[8px] uppercase tracking-widest rounded-none border-border/50 bg-white/5 text-muted-foreground">
                          {u.roleName ?? u.roleId}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono text-[9px] font-bold uppercase tracking-widest ${
                          u.status === "active" ? "text-status-normal"
                          : u.status === "invited" ? "text-status-warning"
                          : "text-muted-foreground"
                        }`}>{u.status}</span>
                      </TableCell>
                      <TableCell className="pr-4 text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
                        {u.lastLoginAt ? relTime(u.lastLoginAt) : "NEVER"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center font-mono text-[9px] uppercase tracking-widest text-muted-foreground py-8">
                        NO USERS IN THIS ORGANISATION
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Change Plan Dialog */}
        <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
          <DialogContent className="max-w-xs bg-card/95 border border-accent-brand/50 rounded-none shadow-[0_0_30px_rgba(0,195,255,0.15)] backdrop-blur-xl">
            <DialogHeader className="border-b border-border/50 pb-4">
              <DialogTitle className="font-mono text-sm uppercase tracking-widest text-accent-brand">CHANGE PLAN</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">PLAN TIER</Label>
              <Select value={newPlan} onValueChange={setNewPlan}>
                <SelectTrigger className="font-mono text-xs uppercase tracking-widest bg-card/50 border-border/50 rounded-none focus:ring-accent-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest">
                  <SelectItem value="starter">STARTER</SelectItem>
                  <SelectItem value="professional">PROFESSIONAL</SelectItem>
                  <SelectItem value="enterprise">ENTERPRISE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="border-t border-border/50 pt-4">
              <Button variant="outline" onClick={() => setShowPlanDialog(false)} className="font-mono text-[10px] uppercase tracking-widest rounded-none border-border/50 hover:bg-white/5">ABORT</Button>
              <Button onClick={() => void changePlan()} disabled={!newPlan || newPlan === org.planTier} className="font-mono text-[10px] uppercase tracking-widest bg-accent-brand/10 text-accent-brand border border-accent-brand hover:bg-accent-brand hover:text-black transition-colors rounded-none">
                EXECUTE
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
