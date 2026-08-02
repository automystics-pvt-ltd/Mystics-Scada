import React, { useState } from "react";
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
    <div className="overflow-x-auto w-full h-full border-t border-border/50">
      <table className="w-full text-sm">
        <thead className="bg-muted/10 sticky top-0 backdrop-blur-md z-10">
          <tr className="border-b border-border/50">
            <th className="text-left py-4 px-6 text-[9px] font-bold uppercase tracking-widest text-muted-foreground w-48">Permission</th>
            <th className="py-4 px-6 text-center text-[9px] font-bold uppercase tracking-widest text-muted-foreground w-32">
              {editing ? "ENABLED" : "GRANTED"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {PERMISSION_CATEGORIES.map((cat) => (
            <React.Fragment key={cat.label}>
              <tr className="bg-muted/5">
                <td colSpan={2} className="px-6 py-3 text-[10px] font-bold text-accent-brand uppercase tracking-widest">
                  {cat.label}
                </td>
              </tr>
              {cat.permissions.map((p) => {
                const has = editing ? editPerms.has(p) : role.permissions.includes(p);
                return (
                  <tr key={p} className="hover:bg-muted/30 transition-colors bg-card/20">
                    <td className="px-6 py-3 text-xs font-medium text-foreground">
                      {PERMISSION_LABELS[p]}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {editing ? (
                        <div className="flex justify-center">
                          <label className="relative flex cursor-pointer items-center rounded-full p-1 border border-border/50 hover:bg-muted/50 transition-colors">
                            <input
                              type="checkbox"
                              checked={has}
                              onChange={() => onToggle(p)}
                              className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-border/50 bg-card checked:bg-accent-brand checked:border-accent-brand transition-all"
                            />
                            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-background opacity-0 peer-checked:opacity-100">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </div>
                          </label>
                        </div>
                      ) : has ? (
                        <Check className="h-4 w-4 text-status-normal mx-auto" />
                      ) : (
                        <span className="text-muted-foreground/30 mx-auto block text-center">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-card/95 border border-card-border rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-accent-brand" />
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/50 flex-shrink-0">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {initial ? "Edit Role" : "Create Role"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-muted/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Role name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Plant Manager"
                className="w-full h-10 px-4 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this role"
                className="w-full h-10 px-4 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all"
              />
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-foreground bg-accent-brand/10 text-accent-brand px-3 py-1.5 rounded-lg border border-accent-brand/20">Permissions ({perms.size} selected)</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPerms(new Set(PERMISSIONS))}
                  className="text-[10px] font-bold uppercase tracking-widest text-accent-brand hover:underline"
                >
                  Select All
                </button>
                <span className="text-muted-foreground/40 text-[10px]">|</span>
                <button
                  onClick={() => setPerms(new Set())}
                  className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="border border-border/50 rounded-xl overflow-hidden bg-card/50">
              {PERMISSION_CATEGORIES.map((cat) => (
                <div key={cat.label} className="border-b border-border/50 last:border-0">
                  <div className="bg-muted/30 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border/50">
                    {cat.label}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {cat.permissions.map((p) => (
                      <label
                        key={p}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 cursor-pointer border-r border-b border-border/20 transition-colors"
                      >
                        <div className="relative flex items-center rounded-full">
                          <input
                            type="checkbox"
                            checked={perms.has(p)}
                            onChange={() => toggle(p)}
                            className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-border/50 bg-card checked:bg-accent-brand checked:border-accent-brand transition-all"
                          />
                          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-background opacity-0 peer-checked:opacity-100">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </div>
                        </div>
                        <span className="text-xs font-medium text-foreground">{PERMISSION_LABELS[p]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-status-fault bg-status-fault/10 border border-status-fault/20 rounded-lg px-4 py-3">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-5 border-t border-border/50 bg-muted/10 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg border border-border/50 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all shadow-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ name: name.trim(), description: description.trim(), permissions: [...perms] })}
            disabled={saving || !name.trim() || perms.size === 0}
            className="px-5 py-2.5 rounded-lg bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 disabled:opacity-50 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]"
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
      <div className="flex flex-col space-y-6 h-full max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-up">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 text-foreground">
              <Shield className="w-7 h-7 text-accent-brand" />
              Role Management
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Define permissions and access boundaries across the portfolio
            </p>
          </div>
          <button
            onClick={() => { setDialogError(null); setShowCreate(true); }}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-accent-brand/50 bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)] shrink-0"
          >
            <Plus className="w-4 h-4" /> Create Role
          </button>
        </div>

        {/* Two-panel layout */}
        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-[600px] animate-fade-up" style={{ animationDelay: '100ms' }}>
          {/* Role list */}
          <div className="w-full lg:w-80 flex-shrink-0 bg-card/40 backdrop-blur-md border border-card-border rounded-xl shadow-sm flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-border/50 bg-muted/10">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                {roles.length} ROLES
              </span>
            </div>
            <div className="overflow-y-auto flex-1">
              {isLoading ? (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-muted/30 rounded animate-shimmer" />)}
                </div>
              ) : roles.map((role) => {
                const isActive = (selectedRole?.id ?? roles[0]?.id) === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedId(role.id)}
                    className={`w-full text-left px-6 py-4 border-b border-border/30 hover:bg-muted/30 transition-all flex items-center justify-between group relative overflow-hidden ${
                      isActive ? "bg-accent-brand/5" : ""
                    }`}
                  >
                    {isActive && <div className="absolute left-0 top-0 w-1 h-full bg-accent-brand" />}
                    <div className="min-w-0 pr-4">
                      <p className={`text-sm font-bold truncate transition-colors ${isActive ? "text-accent-brand" : "text-foreground group-hover:text-accent-brand"}`}>
                        {role.name}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1 font-mono">
                        {role.permissions.length} perms · {role.userCount} usr
                      </p>
                    </div>
                    <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform ${isActive ? "text-accent-brand translate-x-1" : "text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-1"}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Role detail */}
          {selectedRole ? (
            <div className="flex-1 bg-card/40 backdrop-blur-md border border-card-border rounded-xl shadow-sm flex flex-col min-h-0 overflow-hidden">
              {/* Detail header */}
              <div className="px-8 py-6 border-b border-border/50 flex flex-col sm:flex-row sm:items-start justify-between gap-4 flex-shrink-0 relative overflow-hidden bg-muted/5">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-brand/50 to-transparent" />
                <div>
                  <h2 className="text-2xl font-bold text-foreground">{selectedRole.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-xl">{selectedRole.description}</p>
                  <div className="flex items-center gap-3 mt-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-muted/50 border border-border/50 px-2.5 py-1 rounded text-muted-foreground">
                      <span className="text-foreground font-mono">{selectedRole.permissions.length}</span> / {PERMISSIONS.length} perms
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-muted/50 border border-border/50 px-2.5 py-1 rounded text-muted-foreground">
                      <span className="text-foreground font-mono">{selectedRole.userCount}</span> assigned
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => { setDialogError(null); setEditingId(selectedRole.id); }}
                    className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-border/50 rounded-lg bg-card text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all shadow-sm"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit Role
                  </button>
                  {selectedRole.userCount === 0 && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete role "${selectedRole.name}"?`)) {
                          deleteMutation.mutate(selectedRole.id);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-status-fault/30 bg-status-fault/10 text-status-fault rounded-lg hover:bg-status-fault/20 transition-all shadow-[0_0_10px_hsl(var(--status-fault)/0.15)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Permission matrix */}
              <div className="overflow-y-auto flex-1 bg-card/20">
                <PermissionMatrix
                  role={selectedRole}
                  editing={false}
                  editPerms={new Set()}
                  onToggle={() => {}}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 border border-dashed border-border/50 rounded-xl flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-card/20">
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
