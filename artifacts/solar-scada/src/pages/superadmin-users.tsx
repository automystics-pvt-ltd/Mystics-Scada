/**
 * Fleet-wide Users — /superadmin/users
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { Users, Search, Building2, UserCheck, UserX, Mail, RefreshCw, ChevronLeft, ChevronRight, KeyRound, Eye, EyeOff, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL as string;

interface UserRow {
  id: string; name: string; email: string; status: string;
  roleId: string | null; roleName: string | null;
  orgId: string; orgName: string | null;
  lastLoginAt: string | null; createdAt: string;
  hasPassword: boolean;
}

function SetPasswordModal({ user, onClose, onDone }: {
  user: UserRow; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [saving, setSaving]     = useState(false);

  async function save() {
    if (password.length < 8) { toast({ title: "Password too short", description: "Minimum 8 characters", variant: "destructive" }); return; }
    if (password !== confirm) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${BASE}api/superadmin/users/${user.id}/password`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json", "X-SCADA-Request": "1" },
        body: JSON.stringify({ password }),
      });
      const j = await r.json() as { ok?: boolean; message?: string; error?: string };
      if (r.ok) { toast({ title: "Password set", description: j.message }); onDone(); }
      else       { toast({ title: "Failed", description: j.message ?? j.error, variant: "destructive" }); }
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Set Password
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1 py-1">
          <p className="text-sm text-muted-foreground">
            Setting a password for <span className="font-medium text-foreground">{user.name}</span>
            <span className="block text-xs font-mono">{user.email}</span>
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                placeholder="Min 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="pr-9"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Confirm Password</Label>
            <Input
              type={showPw ? "text" : "password"}
              placeholder="Re-enter password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && void save()}
            />
            {confirm && password !== confirm && (
              <p className="text-[11px] text-destructive">Passwords do not match</p>
            )}
          </div>
          {user.hasPassword && (
            <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" /> This user already has a password — it will be replaced.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !password || !confirm}>
            {saving ? "Saving…" : "Set Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_COLOR: Record<string, string> = {
  active:    "bg-status-normal/15 text-status-normal border-status-normal/20",
  invited:   "bg-blue-500/15 text-blue-400 border-blue-500/20",
  suspended: "bg-status-fault/15 text-status-fault border-status-fault/20",
};

const PAGE_SIZE = 50;

export default function SuperAdminUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch]   = useState("");
  const [orgId, setOrgId]     = useState("");
  const [status, setStatus]   = useState("");
  const [page, setPage]       = useState(0);
  const [q, setQ]             = useState({ search: "", orgId: "", status: "" });
  const [setPasswordFor, setSetPasswordFor] = useState<UserRow | null>(null);
  const [removingId, setRemovingId]         = useState<string | null>(null);

  async function removePassword(user: UserRow) {
    if (!confirm(`Remove password login for ${user.name}? They will only be able to use OTP.`)) return;
    setRemovingId(user.id);
    try {
      const r = await fetch(`${BASE}api/superadmin/users/${user.id}/password`, {
        method: "DELETE", credentials: "include",
        headers: { "X-SCADA-Request": "1" },
      });
      const j = await r.json() as { ok?: boolean; message?: string };
      if (r.ok) { toast({ title: "Password removed", description: j.message }); void queryClient.invalidateQueries({ queryKey: ["superadmin", "users"] }); }
      else       { toast({ title: "Failed to remove password", variant: "destructive" }); }
    } finally { setRemovingId(null); }
  }

  const { data, isLoading, refetch } = useQuery<{ users: UserRow[]; total: number }>({
    queryKey: ["superadmin", "users", q, page],
    queryFn: () => {
      const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (q.search) p.set("search", q.search);
      if (q.orgId)  p.set("orgId",  q.orgId);
      if (q.status) p.set("status", q.status);
      return fetch(`${BASE}api/superadmin/users?${p}`, { credentials: "include" }).then(r => r.json()) as Promise<{ users: UserRow[]; total: number }>;
    },
    refetchInterval: 60_000,
  });

  function applySearch() { setQ({ search, orgId, status }); setPage(0); }

  const users = data?.users ?? [];
  const total = data?.total ?? 0;

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-primary" />Fleet Users</h1>
              <p className="text-sm text-muted-foreground mt-1">All users across every organisation — {total.toLocaleString()} total</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…"
                className="pl-8" onKeyDown={e => e.key === "Enter" && applySearch()} />
            </div>
            <Input value={orgId} onChange={e => setOrgId(e.target.value)} placeholder="Filter by org ID…" className="w-48"
              onKeyDown={e => e.key === "Enter" && applySearch()} />
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="border border-border rounded-md bg-background text-sm px-3 py-2">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="suspended">Suspended</option>
            </select>
            <Button onClick={applySearch}>Search</Button>
          </div>

          {/* Users table */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">User</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Organisation</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Role</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Last Login</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Joined</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Password</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-t border-border/50">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-24" /></td>
                        ))}
                      </tr>
                    ))
                  ) : users.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No users found</td></tr>
                  ) : users.map(user => (
                    <tr key={user.id} className="border-t border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {user.name?.slice(0, 2).toUpperCase() ?? "??"}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{user.name}</p>
                            <p className="text-[11px] text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                          <div>
                            <p className="text-foreground text-xs">{user.orgName ?? "—"}</p>
                            <p className="text-[10px] font-mono text-muted-foreground/60">{user.orgId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{user.roleName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_COLOR[user.status] ?? ""}`}>
                          {user.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-xs gap-1 text-primary hover:bg-primary/10"
                            onClick={() => setSetPasswordFor(user)}
                          >
                            <KeyRound className="h-3 w-3" />
                            {user.hasPassword ? "Change" : "Set"}
                          </Button>
                          {user.hasPassword && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              disabled={removingId === user.id}
                              onClick={() => void removePassword(user)}
                            >
                              <ShieldOff className="h-3 w-3" />
                              {removingId === user.id ? "…" : "Remove"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="border-t border-border px-4 py-2.5 flex items-center justify-between bg-muted/20">
              <p className="text-xs text-muted-foreground">
                {total > 0 ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total.toLocaleString()}` : "0 results"}
              </p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Active",    value: users.filter(u => u.status === "active").length,    color: "text-status-normal",  icon: UserCheck },
              { label: "Invited",   value: users.filter(u => u.status === "invited").length,   color: "text-blue-400",       icon: Mail },
              { label: "Suspended", value: users.filter(u => u.status === "suspended").length, color: "text-status-fault",   icon: UserX },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="border border-border rounded-xl p-4 bg-card flex items-center gap-3">
                <Icon className={`h-5 w-5 ${color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{label} (this page)</p>
                  <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SuperAdminLayout>

      {setPasswordFor && (
        <SetPasswordModal
          user={setPasswordFor}
          onClose={() => setSetPasswordFor(null)}
          onDone={() => {
            setSetPasswordFor(null);
            void queryClient.invalidateQueries({ queryKey: ["superadmin", "users"] });
          }}
        />
      )}
    </SuperAdminGuard>
  );
}
