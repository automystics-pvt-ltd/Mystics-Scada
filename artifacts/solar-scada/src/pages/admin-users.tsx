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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-card-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
          <h2 className="font-semibold">Edit User — {user.name}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Email</p>
            <p className="text-sm text-foreground/70">{user.email}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
            <div className="relative">
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="w-full appearance-none bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary pr-8"
              >
                <option value="" disabled>Select a role…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full appearance-none bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary pr-8"
              >
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="disabled">Disabled</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          {error && (
            <p className="text-xs text-status-fault bg-status-fault/10 border border-status-fault/20 rounded-md px-3 py-2">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-card-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md">Cancel</button>
          <button
            onClick={() => onSave({ roleId, status })}
            disabled={saving || !roleId}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-card-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
          <h2 className="font-semibold">Invite User</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ananya Rao"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email address</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="ananya@example.com"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
            <div className="relative">
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)}
                className="w-full appearance-none bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary pr-8">
                <option value="" disabled>Select a role…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          {error && (
            <p className="text-xs text-status-fault bg-status-fault/10 border border-status-fault/20 rounded-md px-3 py-2">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-card-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md">Cancel</button>
          <button
            onClick={() => onSave({ name: name.trim(), email: email.trim(), roleId })}
            disabled={saving || !name.trim() || !email.trim() || !roleId}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
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
    if (role.toLowerCase().includes("admin")) return "text-status-fault border-status-fault/30 bg-status-fault/10";
    if (role.toLowerCase().includes("operator")) return "text-primary border-primary/30 bg-primary/10";
    if (role.toLowerCase().includes("technician") || role.toLowerCase().includes("engineer")) return "text-status-warning border-status-warning/30 bg-status-warning/10";
    return "text-muted-foreground border-border";
  }

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6 h-full">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <Users className="w-6 h-6 mr-2 text-primary" />
              User Access Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Role-based access control across the portfolio</p>
          </div>
          <button
            onClick={() => { setDialogError(null); setShowInvite(true); }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium flex items-center shadow-sm transition-colors"
          >
            <UserPlus className="w-4 h-4 mr-2" /> Invite User
          </button>
        </div>

        <div className="bg-card border border-card-border rounded-lg overflow-hidden flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-card-border">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Plant Access</th>
                <th className="px-4 py-3 font-medium">Last Login</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading users…</td></tr>
              ) : users?.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded border flex w-fit items-center gap-1 ${roleColor(user.role)}`}>
                      <Shield className="w-3 h-3" />
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.status === "active" ? (
                      <span className="text-xs text-status-normal font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Active</span>
                    ) : user.status === "disabled" ? (
                      <span className="text-xs text-status-fault font-medium flex items-center gap-1"><XCircle className="w-3 h-3" /> Disabled</span>
                    ) : (
                      <span className="text-xs text-status-warning font-medium">Invited</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono bg-background border border-border px-1.5 py-0.5 rounded">
                      {user.plantIds.length > 0 ? `${user.plantIds.length} Plants` : "All Plants"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setDialogError(null); setEditingUser(user); }}
                      className="text-xs font-medium text-primary hover:underline"
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
