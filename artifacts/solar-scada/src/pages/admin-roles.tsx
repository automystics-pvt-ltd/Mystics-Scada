import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  ChevronRight,
} from "lucide-react";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSION_CATEGORIES,
  type Permission,
} from "@workspace/permissions";

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

async function createRole(body: { name: string; description: string; permissions: string[] }): Promise<Role> {
  const r = await fetch(`${BASE}/roles`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Failed to create role");
  }
  return r.json();
}

async function updateRole(id: string, body: { name?: string; description?: string; permissions?: string[] }): Promise<Role> {
  const r = await fetch(`${BASE}/roles/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Failed to update role");
  }
  return r.json();
}

async function deleteRole(id: string): Promise<void> {
  const r = await fetch(`${BASE}/roles/${id}`, { method: "DELETE", credentials: "include" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Failed to delete role");
  }
}

// ── Permission matrix ────────────────────────────────────────────────────────

function PermissionMatrix({ role, editing, editPerms, onToggle }: {
  role: Role;
  editing: boolean;
  editPerms: Set<string>;
  onToggle: (p: Permission) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-card-border">
            <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs w-48">Permission</th>
            <th className="py-2 px-3 text-center text-xs text-muted-foreground w-24">
              {editing ? "Enabled" : "Granted"}
            </th>
          </tr>
        </thead>
        <tbody>
          {PERMISSION_CATEGORIES.map((cat) => (
            <>
              <tr key={cat.label} className="bg-muted/20">
                <td colSpan={2} className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  {cat.label}
                </td>
              </tr>
              {cat.permissions.map((p) => {
                const has = editing ? editPerms.has(p) : role.permissions.includes(p);
                return (
                  <tr key={p} className="border-b border-card-border/50 hover:bg-muted/10">
                    <td className="px-3 py-2 text-sm text-foreground/80">
                      {PERMISSION_LABELS[p]}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {editing ? (
                        <input
                          type="checkbox"
                          checked={has}
                          onChange={() => onToggle(p)}
                          className="h-4 w-4 accent-primary cursor-pointer"
                        />
                      ) : has ? (
                        <Check className="h-4 w-4 text-status-normal mx-auto" />
                      ) : (
                        <span className="text-muted-foreground/30 mx-auto block text-center">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Role dialog (create / edit) ──────────────────────────────────────────────

function RoleDialog({
  initial,
  onClose,
  onSave,
  saving,
  error,
}: {
  initial?: Role;
  onClose: () => void;
  onSave: (data: { name: string; description: string; permissions: string[] }) => void;
  saving: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [perms, setPerms] = useState<Set<string>>(
    new Set(initial?.permissions ?? []),
  );

  function toggle(p: Permission) {
    setPerms((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-card-border rounded-lg w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-card-border flex-shrink-0">
          <h2 className="font-semibold text-base">
            {initial ? "Edit Role" : "Create Role"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Role name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Plant Manager"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this role"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Permissions ({perms.size} selected)</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPerms(new Set(PERMISSIONS))}
                  className="text-[10px] text-primary hover:underline"
                >
                  All
                </button>
                <span className="text-muted-foreground/40 text-[10px]">·</span>
                <button
                  onClick={() => setPerms(new Set())}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  None
                </button>
              </div>
            </div>

            <div className="border border-card-border rounded-md overflow-hidden">
              {PERMISSION_CATEGORIES.map((cat) => (
                <div key={cat.label}>
                  <div className="bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {cat.label}
                  </div>
                  {cat.permissions.map((p) => (
                    <label
                      key={p}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/20 cursor-pointer border-b border-card-border/40 last:border-0"
                    >
                      <input
                        type="checkbox"
                        checked={perms.has(p)}
                        onChange={() => toggle(p)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-sm text-foreground/80">{PERMISSION_LABELS[p]}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-status-fault bg-status-fault/10 border border-status-fault/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-card-border flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ name: name.trim(), description: description.trim(), permissions: [...perms] })}
            disabled={saving || !name.trim() || perms.size === 0}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Create role"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AdminRoles() {
  const qc = useQueryClient();
  const { data: roles = [], isLoading } = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const selectedRole = roles.find((r) => r.id === selectedId) ?? roles[0] ?? null;

  const createMutation = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      setShowCreate(false);
      setDialogError(null);
    },
    onError: (e: Error) => setDialogError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateRole>[1] }) =>
      updateRole(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      setEditingId(null);
      setDialogError(null);
    },
    onError: (e: Error) => setDialogError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      if (selectedId === id) setSelectedId(null);
    },
    onError: (e: Error) => alert(e.message),
  });

  const editingRole = editingId ? roles.find((r) => r.id === editingId) : undefined;

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6 h-full">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <Shield className="w-6 h-6 mr-2 text-primary" />
              Role Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define what each role can do across the portfolio
            </p>
          </div>
          <button
            onClick={() => { setDialogError(null); setShowCreate(true); }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium flex items-center shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" /> Create Role
          </button>
        </div>

        {/* Two-panel layout */}
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Role list */}
          <div className="w-72 flex-shrink-0 bg-card border border-card-border rounded-lg overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-card-border bg-muted/30">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {roles.length} Roles
              </span>
            </div>
            <div className="overflow-y-auto flex-1">
              {isLoading ? (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm animate-pulse">
                  Loading…
                </div>
              ) : roles.map((role) => {
                const isActive = (selectedRole?.id ?? roles[0]?.id) === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedId(role.id)}
                    className={`w-full text-left px-4 py-3 border-b border-card-border/60 hover:bg-muted/30 transition-colors flex items-center justify-between group ${
                      isActive ? "bg-primary/8 border-l-2 border-l-primary" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? "text-primary" : ""}`}>
                        {role.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {role.permissions.length} permissions · {role.userCount} user{role.userCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <ChevronRight className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground"}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Role detail */}
          {selectedRole ? (
            <div className="flex-1 bg-card border border-card-border rounded-lg overflow-hidden flex flex-col min-h-0">
              {/* Detail header */}
              <div className="px-5 py-4 border-b border-card-border flex items-start justify-between flex-shrink-0">
                <div>
                  <h2 className="text-lg font-semibold">{selectedRole.name}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{selectedRole.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[11px] bg-muted border border-border px-2 py-0.5 rounded font-mono">
                      {selectedRole.permissions.length}/{PERMISSIONS.length} permissions
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {selectedRole.userCount} user{selectedRole.userCount !== 1 ? "s" : ""} assigned
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setDialogError(null); setEditingId(selectedRole.id); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  {selectedRole.userCount === 0 && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete role "${selectedRole.name}"?`)) {
                          deleteMutation.mutate(selectedRole.id);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-status-fault/30 text-status-fault rounded-md hover:bg-status-fault/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Permission matrix */}
              <div className="overflow-y-auto flex-1">
                <PermissionMatrix
                  role={selectedRole}
                  editing={false}
                  editPerms={new Set()}
                  onToggle={() => {}}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              {isLoading ? "Loading roles…" : "Select a role to view its permissions"}
            </div>
          )}
        </div>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <RoleDialog
          onClose={() => setShowCreate(false)}
          onSave={(data) => createMutation.mutate(data)}
          saving={createMutation.isPending}
          error={dialogError}
        />
      )}

      {/* Edit dialog */}
      {editingRole && (
        <RoleDialog
          initial={editingRole}
          onClose={() => setEditingId(null)}
          onSave={(data) => updateMutation.mutate({ id: editingRole.id, body: data })}
          saving={updateMutation.isPending}
          error={dialogError}
        />
      )}
    </AppLayout>
  );
}
