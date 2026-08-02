/**
 * Super Admin — Organization List
 * Searchable/filterable org list with create org dialog and quick actions.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  ShieldAlert,
  Pause,
  Play,
  ChevronLeft,
  KeyRound,
  EyeOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { useToast } from "@/hooks/use-toast";

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

function planBadge(tier: string) {
  const map: Record<string, string> = {
    enterprise:   "bg-accent-brand/10 text-accent-brand border-accent-brand/50",
    professional: "bg-blue-500/10 text-blue-400 border-blue-500/50",
    starter:      "bg-white/5 text-muted-foreground border-border/50",
  };
  return map[tier] ?? map.starter;
}

function healthColor(h: string) {
  switch (h) {
    case "fault":   return "text-status-fault";
    case "offline": return "text-muted-foreground";
    case "warning": return "text-status-warning";
    default:        return "text-status-normal";
  }
}

export default function SuperAdminOrgs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    planTier: "starter",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);

  const { data: orgs = [], isLoading } = useQuery<OrgRow[]>({
    queryKey: ["superadmin", "orgs"],
    queryFn: () => fetch(`${BASE}api/superadmin/orgs`, { credentials: "include" }).then((r) => r.json()) as Promise<OrgRow[]>,
    refetchInterval: 30_000,
  });

  const filtered = orgs.filter((org) => {
    const matchSearch =
      !search ||
      org.name.toLowerCase().includes(search.toLowerCase()) ||
      org.slug.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || org.status === statusFilter;
    return matchSearch && matchStatus;
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

  async function createOrg() {
    if (!form.name || !form.slug) return;
    setCreating(true);
    try {
      const res = await fetch(`${BASE}api/superadmin/orgs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-SCADA-Request": "1" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          planTier: form.planTier,
          adminName: form.adminName || undefined,
          adminEmail: form.adminEmail || undefined,
          adminPassword: form.adminPassword || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string; id?: string };
      if (!res.ok) {
        toast({ title: "Failed to create organisation", description: data.message ?? data.error, variant: "destructive" });
      } else {
        await queryClient.invalidateQueries({ queryKey: ["superadmin"] });
        toast({ title: "Organisation created", description: form.name });
        setShowCreate(false);
        setForm({ name: "", slug: "", planTier: "starter", adminName: "", adminEmail: "", adminPassword: "" });
        setShowPassword(false);
        if (data.id) navigate(`/superadmin/orgs/${data.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Link href="/superadmin">
                  <Button variant="ghost" size="sm" className="h-6 px-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-accent-brand">
                    <ChevronLeft className="h-3 w-3 mr-1" />
                    DASHBOARD
                  </Button>
                </Link>
              </div>
              <h1 className="font-mono text-2xl font-bold text-foreground flex items-center gap-3 uppercase tracking-widest">
                <Building2 className="h-6 w-6 text-accent-brand" />
                ORGANISATIONS
              </h1>
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">
                {orgs.length} TOTAL // {orgs.filter((o) => o.status === "active").length} ACTIVE
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)} size="sm" className="font-mono text-[10px] uppercase tracking-widest bg-accent-brand/10 text-accent-brand border border-accent-brand hover:bg-accent-brand hover:text-black transition-colors rounded-none">
              <Plus className="h-3.5 w-3.5 mr-2" />
              NEW ORGANISATION
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 bg-black/40 border border-border/50 p-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-accent-brand" />
              <Input
                placeholder="SEARCH NAME OR SLUG..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 font-mono text-[10px] uppercase tracking-widest bg-black/60 border-border/50 rounded-none focus-visible:ring-accent-brand"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-48 h-8 font-mono text-[10px] uppercase tracking-widest bg-black/60 border-border/50 rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest">
                <SelectItem value="all">ALL STATUSES</SelectItem>
                <SelectItem value="active">ACTIVE ONLY</SelectItem>
                <SelectItem value="suspended">SUSPENDED ONLY</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border border-border/50 bg-black/40">
            <div className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-black/60 border-b border-border/50">
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
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-accent-brand font-mono text-[10px] uppercase tracking-widest py-8">
                        FETCHING ORGANISATIONS...
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && filtered.map((org) => (
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
                  {!isLoading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground font-mono text-[10px] uppercase tracking-widest py-8">
                        NO ORGANISATIONS MATCH THE CURRENT FILTER
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Create Org Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md bg-black/95 border border-accent-brand/50 rounded-none shadow-[0_0_30px_rgba(0,195,255,0.15)] backdrop-blur-xl">
            <DialogHeader className="border-b border-border/50 pb-4">
              <DialogTitle className="font-mono text-sm uppercase tracking-widest text-accent-brand">INITIALIZE ORGANISATION</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">ORGANISATION NAME *</Label>
                <Input
                  placeholder="E.G. SUNERGY CORP"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                    setForm((f) => ({ ...f, name, slug }));
                  }}
                  className="font-mono text-xs bg-black/50 border-border/50 rounded-none focus-visible:ring-accent-brand uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">SLUG *</Label>
                <Input
                  placeholder="e.g. sunergy-corp"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  className="font-mono text-xs bg-black/50 border-border/50 rounded-none focus-visible:ring-accent-brand"
                />
                <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">URL-SAFE, LOWERCASE, HYPHENS ONLY</p>
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">PLAN TIER</Label>
                <Select value={form.planTier} onValueChange={(v) => setForm((f) => ({ ...f, planTier: v }))}>
                  <SelectTrigger className="font-mono text-xs uppercase tracking-widest bg-black/50 border-border/50 rounded-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest">
                    <SelectItem value="starter">STARTER</SelectItem>
                    <SelectItem value="professional">PROFESSIONAL</SelectItem>
                    <SelectItem value="enterprise">ENTERPRISE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="border-t border-border/50 pt-4 mt-2">
                <p className="font-mono text-[9px] uppercase tracking-widest text-accent-brand mb-4">INITIAL ADMIN USER (OPTIONAL)</p>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">ADMIN NAME</Label>
                    <Input
                      placeholder="E.G. JANE SMITH"
                      value={form.adminName}
                      onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                      className="font-mono text-xs bg-black/50 border-border/50 rounded-none focus-visible:ring-accent-brand uppercase"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">ADMIN EMAIL</Label>
                    <Input
                      type="email"
                      placeholder="E.G. JANE@SUNERGY.COM"
                      value={form.adminEmail}
                      onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                      className="font-mono text-xs bg-black/50 border-border/50 rounded-none focus-visible:ring-accent-brand uppercase"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <KeyRound className="h-3 w-3 text-accent-brand" />
                      ADMIN PASSWORD
                      <span className="text-[8px] text-muted-foreground/60">(OPTIONAL — ENABLES IMMEDIATE LOGIN)</span>
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="MIN 8 CHARACTERS"
                        value={form.adminPassword}
                        onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                        className="pr-9 font-mono text-xs bg-black/50 border-border/50 rounded-none focus-visible:ring-accent-brand"
                        disabled={!form.adminEmail}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-2.5 top-2 text-muted-foreground hover:text-accent-brand transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {form.adminPassword && form.adminPassword.length < 8 && (
                      <p className="font-mono text-[8px] uppercase tracking-widest text-status-fault">MINIMUM 8 CHARACTERS</p>
                    )}
                    {form.adminPassword && form.adminPassword.length >= 8 && (
                      <p className="font-mono text-[8px] uppercase tracking-widest text-status-normal">✓ USER WILL BE CREATED AS ACTIVE AND CAN LOGIN IMMEDIATELY</p>
                    )}
                    {!form.adminPassword && form.adminEmail && (
                      <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/60">LEAVE BLANK TO CREATE AS INVITED (OTP LOGIN ONLY)</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="border-t border-border/50 pt-4">
              <Button variant="outline" onClick={() => setShowCreate(false)} className="font-mono text-[10px] uppercase tracking-widest rounded-none border-border/50 hover:bg-white/5">ABORT</Button>
              <Button onClick={() => void createOrg()} disabled={!form.name || !form.slug || creating} className="font-mono text-[10px] uppercase tracking-widest bg-accent-brand/10 text-accent-brand border border-accent-brand hover:bg-accent-brand hover:text-black transition-colors rounded-none">
                {creating ? "INITIALIZING..." : "EXECUTE"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
