import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListUsers, getListUsersQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import {
  Users,
  UserPlus,
  Shield,
  CheckCircle2,
  XCircle,
  X,
  ChevronDown,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
}

// ── API helpers ──────────────────────────────────────────────────────────────

const BASE = `${import.meta.env.BASE_URL}api`;

async function fetchRoles(): Promise<Role[]> {
  const r = await fetch(`${BASE}/roles`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to load roles");
  return r.json();
}

async function patchUser(id: string, body: { roleId?: string; status?: string; plantIds?: string[] }) {
  const r = await fetch(`${BASE}/users/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Failed to update user");
  }
  return r.json();
}

async function inviteUser(body: { name: string; email: string; roleId: string; plantIds?: string[] }) {
  const r = await fetch(`${BASE}/users`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, role: "" }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Failed to invite user");
  }
  return r.json();
}

// ── Edit User Dialog ─────────────────────────────────────────────────────────

function EditUserDialog({
  user,
  roles,
  onClose,
  onSave,
  saving,
  error,
}: {
  user: { id: string; name: string; email: string; role: string; status: string };
  roles: Role[];
  onClose: () => void;
  onSave: (data: { roleId: string; status: string }) => void;
  saving: boolean;
  error: string | null;
}) {
  const currentRole = roles.find((r) => r.name === user.role);
  const [roleId, setRoleId] = useState(currentRole?.id ?? "");
  const [status, setStatus] = useState(user.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-card/95 border border-card-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-accent-brand" />
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/50">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Edit User</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1 font-mono">{user.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-muted/50"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="bg-muted/30 p-3 rounded-lg border border-border/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Email</p>
            <p className="text-sm font-mono font-bold text-foreground">{user.email}</p>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Role</label>
            <div className="relative">
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="w-full h-10 appearance-none bg-background/50 border border-border/50 rounded-lg px-4 text-sm font-medium focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all pr-10"
              >
                <option value="" disabled>Select a role…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Status</label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full h-10 appearance-none bg-background/50 border border-border/50 rounded-lg px-4 text-sm font-medium focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all pr-10"
              >
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="disabled">Disabled</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          {error && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-status-fault bg-status-fault/10 border border-status-fault/20 rounded-lg px-4 py-3">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-5 border-t border-border/50 bg-muted/10">
          <button onClick={onClose} className="px-5 py-2.5 rounded-lg border border-border/50 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all">Cancel</button>
          <button
            onClick={() => onSave({ roleId, status })}
            disabled={saving || !roleId}
            className="px-5 py-2.5 rounded-lg bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 disabled:opacity-50 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Invite User Dialog ───────────────────────────────────────────────────────

function InviteDialog({
  roles,
  onClose,
  onSave,
  saving,
  error,
}: {
  roles: Role[];
  onClose: () => void;
  onSave: (data: { name: string; email: string; roleId: string }) => void;
  saving: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-card/95 border border-card-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-accent-brand" />
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/50">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Invite User</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-muted/50"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ananya Rao"
              className="w-full h-10 bg-background/50 border border-border/50 rounded-lg px-4 text-sm focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Email address</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="ananya@example.com"
              className="w-full h-10 bg-background/50 border border-border/50 rounded-lg px-4 text-sm font-mono focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Role</label>
            <div className="relative">
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)}
                className="w-full h-10 appearance-none bg-background/50 border border-border/50 rounded-lg px-4 text-sm font-medium focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all pr-10">
                <option value="" disabled>Select a role…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          {error && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-status-fault bg-status-fault/10 border border-status-fault/20 rounded-lg px-4 py-3">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-5 border-t border-border/50 bg-muted/10">
          <button onClick={onClose} className="px-5 py-2.5 rounded-lg border border-border/50 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all">Cancel</button>
          <button
            onClick={() => onSave({ name: name.trim(), email: email.trim(), roleId })}
            disabled={saving || !name.trim() || !email.trim() || !roleId}
            className="px-5 py-2.5 rounded-lg bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 disabled:opacity-50 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]"
          >
            {saving ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AdminUsers() {
  const qc = useQueryClient();
  const { data: users, isLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const { data: roles = [] } = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });

  type UserRow = NonNullable<typeof users>[number];
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof patchUser>[1] }) =>
      patchUser(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setEditingUser(null);
      setDialogError(null);
    },
    onError: (e: Error) => setDialogError(e.message),
  });

  const inviteMutation = useMutation({
    mutationFn: inviteUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setShowInvite(false);
      setDialogError(null);
    },
    onError: (e: Error) => setDialogError(e.message),
  });

  function roleColor(role: string) {
    if (role.toLowerCase().includes("admin")) return "text-status-fault border-status-fault/30 bg-status-fault/10 shadow-[0_0_10px_hsl(var(--status-fault)/0.15)]";
    if (role.toLowerCase().includes("operator")) return "text-accent-brand border-accent-brand/40 bg-accent-brand/10 shadow-[0_0_10px_hsl(var(--accent-brand)/0.15)]";
    if (role.toLowerCase().includes("technician") || role.toLowerCase().includes("engineer")) return "text-status-warning border-status-warning/30 bg-status-warning/10 shadow-[0_0_10px_hsl(var(--status-warning)/0.15)]";
    return "text-muted-foreground border-border bg-muted/30";
  }

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6 h-full max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-up">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Users className="w-7 h-7 text-accent-brand" />
              User Access Management
            </h1>
            <p className="text-sm text-muted-foreground mt-2">Role-based access control across the portfolio</p>
          </div>
          <button
            onClick={() => { setDialogError(null); setShowInvite(true); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-accent-brand/50 bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)] shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" /> Invite User
          </button>
        </div>

        <div className="bg-card/40 backdrop-blur-md border border-card-border rounded-xl shadow-sm flex-1 min-h-0 flex flex-col animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/10 border-b border-border/50 sticky top-0 backdrop-blur-md z-10">
                <tr>
                  <th className="px-6 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">User</th>
                  <th className="px-6 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Role</th>
                  <th className="px-6 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Plant Access</th>
                  <th className="px-6 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Last Login</th>
                  <th className="px-6 py-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="bg-card/20"><td colSpan={6} className="px-6 py-5"><div className="h-5 bg-muted/30 rounded animate-shimmer" /></td></tr>
                  ))
                ) : users?.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors bg-card/20 group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-foreground group-hover:text-accent-brand transition-colors">{user.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{user.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded border flex w-fit items-center gap-1.5 ${roleColor(user.role)}`}>
                        <Shield className="w-3 h-3" />
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.status === "active" ? (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-status-normal flex items-center gap-1.5 bg-status-normal/10 px-2 py-0.5 rounded w-max border border-status-normal/20"><CheckCircle2 className="w-3 h-3" /> Active</span>
                      ) : user.status === "disabled" ? (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-status-fault flex items-center gap-1.5 bg-status-fault/10 px-2 py-0.5 rounded w-max border border-status-fault/20"><XCircle className="w-3 h-3" /> Disabled</span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-accent-brand flex items-center gap-1.5 bg-accent-brand/10 px-2 py-0.5 rounded w-max border border-accent-brand/20">Invited</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest font-mono bg-muted/50 border border-border/50 px-2.5 py-1 rounded text-muted-foreground">
                        {user.plantIds.length > 0 ? `${user.plantIds.length} Plants` : "All Plants"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-[10px] font-bold font-mono uppercase tracking-widest">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "NEVER"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => { setDialogError(null); setEditingUser(user); }}
                        className="px-4 py-2 rounded-lg border border-border/50 bg-card text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-accent-brand hover:border-accent-brand/50 hover:bg-accent-brand/10 transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          roles={roles}
          onClose={() => setEditingUser(null)}
          onSave={({ roleId, status }) =>
            patchMutation.mutate({ id: editingUser.id, body: { roleId, status } })
          }
          saving={patchMutation.isPending}
          error={dialogError}
        />
      )}

      {showInvite && (
        <InviteDialog
          roles={roles}
          onClose={() => setShowInvite(false)}
          onSave={(data) => inviteMutation.mutate(data)}
          saving={inviteMutation.isPending}
          error={dialogError}
        />
      )}
    </AppLayout>
  );
}
