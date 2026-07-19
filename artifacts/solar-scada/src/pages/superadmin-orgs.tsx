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
    enterprise:   "bg-purple-500/15 text-purple-300 border-purple-500/30",
    professional: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    starter:      "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };
  return map[tier] ?? map.starter;
}

function healthColor(h: string) {
  switch (h) {
    case "fault":   return "text-red-400";
    case "offline": return "text-zinc-400";
    case "warning": return "text-yellow-400";
    default:        return "text-green-400";
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
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link href="/superadmin">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                    Dashboard
                  </Button>
                </Link>
              </div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Building2 className="h-6 w-6 text-primary" />
                Organisations
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {orgs.length} total · {orgs.filter((o) => o.status === "active").length} active
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              New Organisation
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search name or slug…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="border-border">
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
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-8">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && filtered.map((org) => (
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
                            <Button variant="ghost" size="sm" className="h-7 px-2" title="View detail">
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
                  {!isLoading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-8">
                        No organisations match the current filter
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Create Org Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Organisation</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Organisation Name *</Label>
                <Input
                  placeholder="e.g. Sunergy Corp"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                    setForm((f) => ({ ...f, name, slug }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Slug *</Label>
                <Input
                  placeholder="e.g. sunergy-corp"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">URL-safe, lowercase, hyphens only</p>
              </div>
              <div className="space-y-1.5">
                <Label>Plan Tier</Label>
                <Select value={form.planTier} onValueChange={(v) => setForm((f) => ({ ...f, planTier: v }))}>
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
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-3">Initial admin user (optional)</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Admin Name</Label>
                    <Input
                      placeholder="e.g. Jane Smith"
                      value={form.adminName}
                      onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Admin Email</Label>
                    <Input
                      type="email"
                      placeholder="e.g. jane@sunergy.com"
                      value={form.adminEmail}
                      onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                      Admin Password
                      <span className="text-[10px] text-muted-foreground font-normal">(optional — enables immediate login)</span>
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Min 8 characters"
                        value={form.adminPassword}
                        onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                        className="pr-9"
                        disabled={!form.adminEmail}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {form.adminPassword && form.adminPassword.length < 8 && (
                      <p className="text-[11px] text-destructive">Minimum 8 characters</p>
                    )}
                    {form.adminPassword && form.adminPassword.length >= 8 && (
                      <p className="text-[11px] text-status-normal">✓ User will be created as Active and can login immediately</p>
                    )}
                    {!form.adminPassword && form.adminEmail && (
                      <p className="text-[11px] text-muted-foreground">Leave blank to create as Invited (OTP login only)</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={() => void createOrg()} disabled={!form.name || !form.slug || creating}>
                {creating ? "Creating…" : "Create Organisation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
