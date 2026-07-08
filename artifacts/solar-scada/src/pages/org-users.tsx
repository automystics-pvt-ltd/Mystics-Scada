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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  active:   { label: "Active",   cls: "text-status-normal border-status-normal/40" },
  invited:  { label: "Invited",  cls: "text-blue-400 border-blue-500/40" },
  disabled: { label: "Disabled", cls: "text-muted-foreground border-border" },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
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
      <div className="max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Organisation Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your org profile, users, notifications, and activity log
          </p>
        </div>

        <OrgNav />

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Active",   count: counts.active,   cls: "text-status-normal" },
            { label: "Invited",  count: counts.invited,  cls: "text-blue-400" },
            { label: "Disabled", count: counts.disabled, cls: "text-muted-foreground" },
          ].map(({ label, count, cls }) => (
            <div key={label} className="rounded-lg border border-border px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className={`text-2xl font-bold ${cls}`}>{count}</span>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="invited">Invited</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-9 gap-1.5"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["org-users"] })}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            {canManage && (
              <Button size="sm" className="h-9 gap-2" onClick={() => setShowInvite(true)}>
                <UserPlus className="h-4 w-4" /> Invite User
              </Button>
            )}
          </div>
        </div>

        {/* User table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Login</th>
                {canManage && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading users…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No users found.</td></tr>
              ) : (
                filtered.map((u) => {
                  const statusCfg = STATUS_CONFIG[u.status];
                  return (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-muted-foreground">{getInitials(u.name)}</span>
                          </div>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {u.name}
                              {u.isSuperAdmin && (
                                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 py-0">SA</Badge>
                              )}
                              {u.id === user?.id && (
                                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary py-0">You</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{u.roleName}</td>
                      <td className="px-4 py-3">
                        {statusCfg && (
                          <Badge variant="outline" className={`text-xs ${statusCfg.cls}`}>
                            {statusCfg.label}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {timeAgo(u.lastLoginAt)}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          {!u.isSuperAdmin && u.id !== user?.id && (
                            <div className="flex gap-1 justify-end">
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2"
                                onClick={() => {
                                  setEditUser(u);
                                  setEditForm({ name: u.name, roleId: u.roleId, status: u.status });
                                }}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              {u.status !== "disabled" && (
                                <Button
                                  size="sm" variant="ghost" className="h-7 px-2 text-status-fault hover:text-status-fault"
                                  onClick={() => setDisableUser(u)}
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {u.status === "disabled" && (
                                <Button
                                  size="sm" variant="ghost" className="h-7 px-2 text-status-normal hover:text-status-normal"
                                  onClick={() => updateMutation.mutate({ userId: u.id, body: { status: "active" } })}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Invite New User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full Name</Label>
              <Input className="mt-1" placeholder="Jane Doe" value={inviteForm.name}
                onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Email Address</Label>
              <Input className="mt-1" type="email" placeholder="jane@company.com" value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={inviteForm.roleId} onValueChange={(v) => setInviteForm((f) => ({ ...f, roleId: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select a role…" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button
              onClick={() => inviteMutation.mutate(inviteForm)}
              disabled={!inviteForm.name || !inviteForm.email || !inviteForm.roleId || inviteMutation.isPending}
            >
              {inviteMutation.isPending ? "Inviting…" : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Temp password reveal */}
      <Dialog open={!!tempPassword} onOpenChange={() => setTempPassword(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Invitation Created</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Share these temporary credentials with the new user. They should change their password on first login.
            </p>
            <div className="rounded-lg bg-muted p-3 font-mono text-sm flex items-center justify-between">
              <span>{tempPassword}</span>
              <Button size="sm" variant="ghost" className="h-7 px-2 ml-2"
                onClick={() => { void navigator.clipboard.writeText(tempPassword ?? ""); toast({ title: "Copied" }); }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">This password is only shown once.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setTempPassword(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user modal */}
      {editUser && (
        <Dialog open onOpenChange={() => setEditUser(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit {editUser.name}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Full Name</Label>
                <Input className="mt-1" value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={editForm.roleId} onValueChange={(v) => setEditForm((f) => ({ ...f, roleId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="invited">Invited</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button
                onClick={() => updateMutation.mutate({
                  userId: editUser.id,
                  body: { name: editForm.name, roleId: editForm.roleId, status: editForm.status },
                })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Disable confirm */}
      <AlertDialog open={!!disableUser} onOpenChange={() => setDisableUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {disableUser?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent <strong>{disableUser?.email}</strong> from signing in. You can re-enable them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disableUser && disableMutation.mutate(disableUser.id)}
              className="bg-status-fault hover:bg-status-fault/90"
            >
              Disable Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
