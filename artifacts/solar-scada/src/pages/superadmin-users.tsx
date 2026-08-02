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
      <DialogContent className="max-w-sm bg-card/95 border border-accent-brand/50 rounded-none shadow-[0_0_30px_rgba(0,195,255,0.15)] backdrop-blur-xl">
        <DialogHeader className="border-b border-border/50 pb-4">
          <DialogTitle className="font-mono text-sm uppercase tracking-widest text-accent-brand flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            SET CREDENTIALS
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1 py-4">
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            TARGET USER: <span className="font-bold text-foreground">{user.name}</span>
            <span className="block text-[8px] text-accent-brand mt-1">{user.email}</span>
          </p>
        </div>
        <div className="space-y-4 pb-4">
          <div className="space-y-1.5">
            <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">NEW PASSPHRASE</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                placeholder="MIN 8 CHARACTERS"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="pr-9 font-mono text-xs bg-card/50 border-border/50 rounded-none focus-visible:ring-accent-brand"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-2.5 top-2 text-muted-foreground hover:text-accent-brand transition-colors"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">CONFIRM PASSPHRASE</Label>
            <Input
              type={showPw ? "text" : "password"}
              placeholder="RE-ENTER PASSPHRASE"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && void save()}
              className="font-mono text-xs bg-card/50 border-border/50 rounded-none focus-visible:ring-accent-brand"
            />
            {confirm && password !== confirm && (
              <p className="font-mono text-[8px] uppercase tracking-widest text-status-fault mt-1">PASSPHRASES DO NOT MATCH</p>
            )}
          </div>
          {user.hasPassword && (
            <p className="font-mono text-[8px] uppercase tracking-widest text-status-warning flex items-center gap-1.5 mt-2 bg-status-warning/10 p-2 border border-status-warning/30">
              <KeyRound className="h-3 w-3" /> CREDENTIALS EXIST — WILL BE OVERWRITTEN.
            </p>
          )}
        </div>
        <DialogFooter className="border-t border-border/50 pt-4">
          <Button variant="outline" onClick={onClose} className="font-mono text-[10px] uppercase tracking-widest rounded-none border-border/50 hover:bg-white/5">ABORT</Button>
          <Button onClick={() => void save()} disabled={saving || !password || !confirm} className="font-mono text-[10px] uppercase tracking-widest bg-accent-brand/10 text-accent-brand border border-accent-brand hover:bg-accent-brand hover:text-black transition-colors rounded-none">
            {saving ? "EXECUTING..." : "COMMIT"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_COLOR: Record<string, string> = {
  active:    "bg-status-normal/10 text-status-normal border-status-normal",
  invited:   "bg-blue-500/10 text-blue-400 border-blue-500",
  suspended: "bg-status-fault/10 text-status-fault border-status-fault",
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
          <div className="flex items-center justify-between border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <div>
              <h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">
                <Users className="h-6 w-6 text-accent-brand" />
                FLEET USERS
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">ALL USERS ACROSS EVERY ORGANISATION // {total.toLocaleString()} TOTAL</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="font-mono text-[9px] uppercase tracking-widest border-accent-brand/30 text-accent-brand hover:bg-accent-brand/10 rounded-none gap-2">
              <RefreshCw className="h-3 w-3" /> REFRESH
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-3 bg-card/40 border border-border/50 p-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-accent-brand" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="SEARCH NAME OR EMAIL..."
                className="pl-9 h-8 font-mono text-[10px] uppercase tracking-widest bg-card/60 border-border/50 rounded-none focus-visible:ring-accent-brand" onKeyDown={e => e.key === "Enter" && applySearch()} />
            </div>
            <Input value={orgId} onChange={e => setOrgId(e.target.value)} placeholder="ORG ID..." className="w-48 h-8 font-mono text-[10px] uppercase tracking-widest bg-card/60 border-border/50 rounded-none focus-visible:ring-accent-brand"
              onKeyDown={e => e.key === "Enter" && applySearch()} />
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="border border-border/50 bg-card/60 font-mono text-[10px] uppercase tracking-widest rounded-none h-8 px-3 focus:outline-none focus:ring-1 focus:ring-accent-brand">
              <option value="">ALL STATUSES</option>
              <option value="active">ACTIVE</option>
              <option value="invited">INVITED</option>
              <option value="suspended">SUSPENDED</option>
            </select>
            <Button onClick={applySearch} className="h-8 font-mono text-[10px] uppercase tracking-widest bg-white/5 border border-border/50 hover:bg-white/10 rounded-none">EXECUTE</Button>
          </div>

          {/* Users table */}
          <div className="border border-border/50 bg-card/40">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-card/60 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">USER</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">ORGANISATION</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">ROLE</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">STATUS</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">LAST LOGIN</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">JOINED</th>
                    <th className="px-4 py-2 text-right font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">AUTH LOGIC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="hover:bg-transparent">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-white/5 animate-pulse w-24" /></td>
                        ))}
                      </tr>
                    ))
                  ) : users.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">NO USERS FOUND</td></tr>
                  ) : users.map(user => (
                    <tr key={user.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-accent-brand/10 text-accent-brand border border-accent-brand/30 flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0 shadow-[inset_0_0_10px_rgba(0,195,255,0.2)]">
                            {user.name?.slice(0, 2).toUpperCase() ?? "??"}
                          </div>
                          <div>
                            <p className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">{user.name}</p>
                            <p className="font-mono text-[9px] text-muted-foreground mt-0.5 uppercase tracking-widest">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="font-mono text-[10px] font-bold text-foreground uppercase tracking-widest">{user.orgName ?? "—"}</p>
                            <p className="font-mono text-[8px] text-muted-foreground/60 uppercase mt-0.5">{user.orgId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{user.roleName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`font-mono text-[9px] font-bold uppercase tracking-widest rounded-none px-2 py-0.5 ${STATUS_COLOR[user.status] ?? ""}`}>
                          {user.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/80">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toISOString().slice(0,10) : "NEVER"}
                      </td>
                      <td className="px-4 py-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/80">
                        {new Date(user.createdAt).toISOString().slice(0,10)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 font-mono text-[8px] font-bold uppercase tracking-widest text-accent-brand border border-transparent hover:border-accent-brand/50 hover:bg-accent-brand/10 gap-1 rounded-none"
                            onClick={() => setSetPasswordFor(user)}
                          >
                            <KeyRound className="h-3 w-3" />
                            {user.hasPassword ? "CHANGE" : "SET"}
                          </Button>
                          {user.hasPassword && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 px-2 font-mono text-[8px] font-bold uppercase tracking-widest text-muted-foreground border border-transparent hover:border-status-fault/50 hover:text-status-fault hover:bg-status-fault/10 gap-1 rounded-none"
                              disabled={removingId === user.id}
                              onClick={() => void removePassword(user)}
                            >
                              <ShieldOff className="h-3 w-3" />
                              {removingId === user.id ? "..." : "REMOVE"}
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
            <div className="border-t border-border/50 px-4 py-3 flex items-center justify-between bg-card">
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground font-bold">
                {total > 0 ? `${page * PAGE_SIZE + 1} TO ${Math.min((page + 1) * PAGE_SIZE, total)} OF ${total.toLocaleString()}` : "NO RESULTS"}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-none border-border/50 text-muted-foreground hover:text-accent-brand hover:border-accent-brand" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-none border-border/50 text-muted-foreground hover:text-accent-brand hover:border-accent-brand" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "ACTIVE",    value: users.filter(u => u.status === "active").length,    color: "text-status-normal" },
              { label: "INVITED",   value: users.filter(u => u.status === "invited").length,   color: "text-blue-400" },
              { label: "SUSPENDED", value: users.filter(u => u.status === "suspended").length, color: "text-status-fault" },
            ].map(({ label, value, color }) => (
              <div key={label} className="border border-border/50 bg-card/40 p-4 text-center group hover:border-border transition-colors relative">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-border/30 group-hover:bg-border/60 transition-colors" />
                <p className={`font-mono text-3xl font-bold ${color}`}>{value}</p>
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-2">{label} (BUFFER)</p>
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
