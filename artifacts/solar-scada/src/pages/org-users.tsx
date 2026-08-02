import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  UserPlus,
  Edit2,
  Ban,
  CheckCircle2,
  Clock,
  RefreshCw,
  Copy,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { OrgNav } from "@/components/org-nav";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL;

interface OrgUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  plantIds: string[];
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  isSuperAdmin: boolean;
}

interface Role {
  id: string;
  name: string;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  active:   { label: "Active",   cls: "text-status-normal border-status-normal/40 bg-status-normal/10 shadow-[0_0_10px_hsl(var(--status-normal)/0.1)]" },
  invited:  { label: "Invited",  cls: "text-accent-brand border-accent-brand/40 bg-accent-brand/10 shadow-[0_0_10px_hsl(var(--accent-brand)/0.1)]" },
  disabled: { label: "Disabled", cls: "text-muted-foreground border-border/50 bg-muted/50" },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "NEVER";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "TODAY";
  if (days === 1) return "YESTERDAY";
  if (days < 30) return `${days}D AGO`;
  return new Date(iso).toLocaleDateString().toUpperCase();
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export default function OrgUsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("users.manage") ?? false;

  const [showInvite, setShowInvite] = useState(false);
  const [editUser, setEditUser] = useState<OrgUser | null>(null);
  const [disableUser, setDisableUser] = useState<OrgUser | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", roleId: "" });
  const [editForm, setEditForm] = useState({ name: "", roleId: "", status: "" });

  const { data: users = [], isLoading } = useQuery<OrgUser[]>({
    queryKey: ["org-users"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/org/users`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load users");
      return r.json() as Promise<OrgUser[]>;
    },
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/roles`, { credentials: "include" });
      if (!r.ok) return [];
      const d = await r.json() as { roles?: Role[] } | Role[];
      return Array.isArray(d) ? d : (d.roles ?? []);
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (body: typeof inviteForm) => {
      const r = await fetch(`${BASE}api/org/users/invite`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Invite failed");
      }
      return r.json() as Promise<OrgUser & { tempPassword: string }>;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["org-users"] });
      setShowInvite(false);
      setInviteForm({ name: "", email: "", roleId: "" });
      setTempPassword(data.tempPassword);
      toast({ title: "User invited", description: `${data.email} has been added.` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ userId, body }: { userId: string; body: Record<string, unknown> }) => {
      const r = await fetch(`${BASE}api/org/users/${userId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Update failed");
      }
      return r.json() as Promise<OrgUser>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["org-users"] });
      setEditUser(null);
      toast({ title: "User updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const disableMutation = useMutation({
    mutationFn: async (userId: string) => {
      const r = await fetch(`${BASE}api/org/users/${userId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Disable failed");
      }
      return r.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["org-users"] });
      setDisableUser(null);
      toast({ title: "Account disabled" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = filterStatus === "all" ? users : users.filter((u) => u.status === filterStatus);

  const counts = {
    active: users.filter((u) => u.status === "active").length,
    invited: users.filter((u) => u.status === "invited").length,
    disabled: users.filter((u) => u.status === "disabled").length,
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto flex flex-col space-y-6 h-full">
        <div className="animate-fade-up">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Users className="h-7 w-7 text-accent-brand" />
            Organisation Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Manage your org profile, users, notifications, and activity log
          </p>
        </div>

        <OrgNav />

        {/* KPI strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2 animate-fade-up" style={{ animationDelay: '50ms' }}>
          {[
            { label: "Active Users",   count: counts.active,   cls: "text-status-normal shadow-[0_0_15px_hsl(var(--status-normal)/0.15)] bg-status-normal/5 border-status-normal/20" },
            { label: "Pending Invites",  count: counts.invited,  cls: "text-accent-brand shadow-[0_0_15px_hsl(var(--accent-brand)/0.15)] bg-accent-brand/5 border-accent-brand/20" },
            { label: "Disabled Accounts", count: counts.disabled, cls: "text-muted-foreground bg-card/40 border-card-border" },
          ].map(({ label, count, cls }) => (
            <div key={label} className={`rounded-xl border p-5 flex flex-col justify-center backdrop-blur-md ${cls}`}>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">{label}</span>
              <span className="text-3xl font-mono font-bold tracking-tighter">{count}</span>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between animate-fade-up" style={{ animationDelay: '100ms' }}>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-10 px-4 rounded-lg border border-border/50 bg-card text-[10px] font-bold uppercase tracking-widest text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 hover:border-border transition-colors shadow-sm"
          >
            <option value="all">ALL USERS</option>
            <option value="active">ACTIVE ONLY</option>
            <option value="invited">INVITED ONLY</option>
            <option value="disabled">DISABLED ONLY</option>
          </select>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/50 bg-card shadow-sm text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["org-users"] })}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            {canManage && (
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-accent-brand/50 bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]" onClick={() => setShowInvite(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Invite User
              </button>
            )}
          </div>
        </div>

        {/* User table */}
        <div className="rounded-xl border border-card-border bg-card/40 backdrop-blur-md overflow-hidden shadow-sm animate-fade-up" style={{ animationDelay: '150ms' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/10">
                <th className="text-left px-5 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">User</th>
                <th className="text-left px-5 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Role</th>
                <th className="text-left px-5 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Status</th>
                <th className="text-left px-5 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Last Login</th>
                {canManage && <th className="px-5 py-4" />}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/30 bg-card/20"><td colSpan={5} className="px-5 py-6"><div className="h-6 w-full bg-muted/30 rounded animate-shimmer" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-16 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-card/20 border-dashed">No users found.</td></tr>
              ) : (
                filtered.map((u) => {
                  const statusCfg = STATUS_CONFIG[u.status];
                  return (
                    <tr key={u.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors bg-card/20 group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center flex-shrink-0 shadow-inner group-hover:border-accent-brand/30 transition-colors">
                            <span className="text-xs font-bold font-mono text-muted-foreground group-hover:text-accent-brand transition-colors">{getInitials(u.name)}</span>
                          </div>
                          <div>
                            <div className="font-bold text-foreground flex items-center gap-2 mb-1 group-hover:text-accent-brand transition-colors">
                              {u.name}
                              {u.isSuperAdmin && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-widest shadow-[0_0_5px_rgba(251,191,36,0.2)]">SA</span>
                              )}
                              {u.id === user?.id && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-status-normal/10 text-status-normal border border-status-normal/30 uppercase tracking-widest shadow-[0_0_5px_rgba(16,185,129,0.2)]">You</span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{u.roleName}</td>
                      <td className="px-5 py-4">
                        {statusCfg && (
                          <span className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest border ${statusCfg.cls}`}>
                            {statusCfg.label}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest font-mono text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {timeAgo(u.lastLoginAt)}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-5 py-4">
                          {!u.isSuperAdmin && u.id !== user?.id && (
                            <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                className="p-2 rounded-lg border border-border/50 bg-card text-muted-foreground hover:text-accent-brand hover:border-accent-brand/40 hover:bg-accent-brand/10 transition-all shadow-sm"
                                onClick={() => {
                                  setEditUser(u);
                                  setEditForm({ name: u.name, roleId: u.roleId, status: u.status });
                                }}
                                title="Edit User"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              {u.status !== "disabled" && (
                                <button
                                  className="p-2 rounded-lg border border-border/50 bg-card text-muted-foreground hover:text-status-fault hover:border-status-fault/40 hover:bg-status-fault/10 transition-all shadow-sm"
                                  onClick={() => setDisableUser(u)}
                                  title="Disable Account"
                                >
                                  <Ban className="h-4 w-4" />
                                </button>
                              )}
                              {u.status === "disabled" && (
                                <button
                                  className="p-2 rounded-lg border border-border/50 bg-card text-muted-foreground hover:text-status-normal hover:border-status-normal/40 hover:bg-status-normal/10 transition-all shadow-sm"
                                  onClick={() => updateMutation.mutate({ userId: u.id, body: { status: "active" } })}
                                  title="Re-enable Account"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite modal */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-card-border shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl font-bold tracking-tight">Invite New User</DialogTitle></DialogHeader>
          <div className="space-y-5 py-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Full Name</label>
              <input className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all" placeholder="Jane Doe" value={inviteForm.name}
                onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Email Address</label>
              <input className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all font-mono" type="email" placeholder="jane@company.com" value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Role</label>
              <select className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm font-medium text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all" value={inviteForm.roleId} onChange={(e) => setInviteForm((f) => ({ ...f, roleId: e.target.value }))}>
                <option value="" disabled>Select a role…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <button className="px-5 py-2.5 rounded-lg border border-border/50 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all" onClick={() => setShowInvite(false)}>Cancel</button>
            <button
              className="px-5 py-2.5 rounded-lg bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 disabled:opacity-50 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]"
              onClick={() => inviteMutation.mutate(inviteForm)}
              disabled={!inviteForm.name || !inviteForm.email || !inviteForm.roleId || inviteMutation.isPending}
            >
              {inviteMutation.isPending ? "Inviting…" : "Send Invite"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Temp password reveal */}
      <Dialog open={!!tempPassword} onOpenChange={() => setTempPassword(null)}>
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-card-border shadow-2xl border-accent-brand/20">
          <DialogHeader><DialogTitle className="text-xl font-bold tracking-tight text-accent-brand flex items-center gap-2"><CheckCircle2 className="w-6 h-6" /> Invitation Created</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Share these temporary credentials with the new user. They will be required to change their password on first login.
            </p>
            <div className="rounded-xl bg-background/80 border border-accent-brand/30 p-4 flex items-center justify-between shadow-inner">
              <span className="font-mono text-lg font-bold tracking-widest text-foreground">{tempPassword}</span>
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card hover:bg-muted/50 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-all"
                onClick={() => { void navigator.clipboard.writeText(tempPassword ?? ""); toast({ title: "Copied to clipboard" }); }}>
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-status-warning bg-status-warning/10 p-3 rounded-lg border border-status-warning/20">
              <Clock className="w-3.5 h-3.5" /> This password is only shown once.
            </div>
          </div>
          <DialogFooter>
            <button className="px-5 py-2.5 rounded-lg bg-foreground text-background text-[10px] font-bold uppercase tracking-widest hover:bg-foreground/90 transition-all" onClick={() => setTempPassword(null)}>Done</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user modal */}
      {editUser && (
        <Dialog open onOpenChange={() => setEditUser(null)}>
          <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-card-border shadow-2xl">
            <DialogHeader><DialogTitle className="text-xl font-bold tracking-tight">Edit {editUser.name}</DialogTitle></DialogHeader>
            <div className="space-y-5 py-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Full Name</label>
                <input className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all" value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Role</label>
                <select className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm font-medium text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all" value={editForm.roleId} onChange={(e) => setEditForm((f) => ({ ...f, roleId: e.target.value }))}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Status</label>
                <select className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm font-medium text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all" value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="invited">Invited</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <button className="px-5 py-2.5 rounded-lg border border-border/50 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all" onClick={() => setEditUser(null)}>Cancel</button>
              <button
                className="px-5 py-2.5 rounded-lg bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 disabled:opacity-50 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]"
                onClick={() => updateMutation.mutate({
                  userId: editUser.id,
                  body: { name: editForm.name, roleId: editForm.roleId, status: editForm.status },
                })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving…" : "Save Changes"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Disable confirm */}
      <AlertDialog open={!!disableUser} onOpenChange={() => setDisableUser(null)}>
        <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-status-fault/20 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold tracking-tight text-status-fault flex items-center gap-2"><Ban className="w-6 h-6" /> Disable Account?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed mt-2">
              This will immediately revoke access and prevent <strong className="text-foreground font-mono">{disableUser?.email}</strong> from signing in. You can re-enable the account later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded-lg border-border/50 text-[10px] font-bold uppercase tracking-widest hover:bg-muted/30">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disableUser && disableMutation.mutate(disableUser.id)}
              className="rounded-lg bg-status-fault text-white hover:bg-status-fault/90 text-[10px] font-bold uppercase tracking-widest shadow-[0_0_15px_hsl(var(--status-fault)/0.3)]"
            >
              Disable Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
