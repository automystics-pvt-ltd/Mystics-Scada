import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Edit2, Save, X } from "lucide-react";
import { AppLayout } from "@/components/layout";
import { OrgNav } from "@/components/org-nav";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL;

interface OrgProfile {
  id: string;
  name: string;
  slug: string;
  planTier: string;
  status: string;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const TIER_LABELS: Record<string, { label: string; cls: string }> = {
  starter:      { label: "Starter",      cls: "text-muted-foreground border-border/50" },
  professional: { label: "Professional", cls: "text-accent-brand border-accent-brand/40 shadow-[0_0_10px_hsl(var(--accent-brand)/0.1)]" },
  enterprise:   { label: "Enterprise",   cls: "text-status-warning border-status-warning/40 shadow-[0_0_10px_hsl(var(--status-warning)/0.1)]" },
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active:    { label: "Active",    cls: "text-status-normal border-status-normal/40 shadow-[0_0_10px_hsl(var(--status-normal)/0.1)]" },
  suspended: { label: "Suspended", cls: "text-status-fault border-status-fault/40 shadow-[0_0_10px_hsl(var(--status-fault)/0.1)]" },
};

function OrgInitials({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="w-16 h-16 rounded-xl object-cover border border-border/50 shadow-sm"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div className="w-16 h-16 rounded-xl bg-accent-brand/10 border border-accent-brand/20 flex items-center justify-center shadow-[0_0_15px_hsl(var(--accent-brand)/0.15)]">
      <span className="text-xl font-bold font-mono text-accent-brand">{initials}</span>
    </div>
  );
}

export default function OrgProfilePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("settings.manage") ?? false;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", logoUrl: "" });

  const { data: org, isLoading } = useQuery<OrgProfile>({
    queryKey: ["org-profile"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/org`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load org profile");
      return r.json() as Promise<OrgProfile>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (body: { name?: string; logoUrl?: string | null }) => {
      const r = await fetch(`${BASE}api/org`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Update failed");
      }
      return r.json() as Promise<OrgProfile>;
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["org-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setEditing(false);
      toast({ title: "Profile updated", description: `"${updated.name}" saved successfully.` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function startEdit() {
    if (!org) return;
    setForm({ name: org.name, logoUrl: org.logoUrl ?? "" });
    setEditing(true);
  }

  function save() {
    const body: { name?: string; logoUrl?: string | null } = {};
    if (form.name !== org?.name) body.name = form.name;
    body.logoUrl = form.logoUrl || null;
    saveMutation.mutate(body);
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col space-y-6 h-full">
        <div className="animate-fade-up">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Building2 className="h-7 w-7 text-accent-brand" />
            Organisation Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Manage your org profile, users, notifications, and activity log
          </p>
        </div>

        <OrgNav />

        {isLoading ? (
          <div className="h-32 bg-card/40 border border-card-border rounded-xl animate-shimmer" />
        ) : org ? (
          <div className="space-y-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
            {/* Header card */}
            <div className="rounded-xl border border-card-border bg-card/40 backdrop-blur-md p-8 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-accent-brand" />
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-5">
                  <OrgInitials name={org.name} logoUrl={org.logoUrl} />
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">{org.name}</h2>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1 font-mono">@{org.slug}</p>
                    <div className="flex gap-2 mt-3">
                      {TIER_LABELS[org.planTier] && (
                        <span className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest border bg-card ${TIER_LABELS[org.planTier]!.cls}`}>
                          {TIER_LABELS[org.planTier]!.label}
                        </span>
                      )}
                      {STATUS_LABELS[org.status] && (
                        <span className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest border bg-card ${STATUS_LABELS[org.status]!.cls}`}>
                          {STATUS_LABELS[org.status]!.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {canManage && !editing && (
                  <button onClick={startEdit} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/50 bg-card shadow-sm text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border transition-all">
                    <Edit2 className="h-3.5 w-3.5" /> Edit Profile
                  </button>
                )}
              </div>
            </div>

            {/* Edit form */}
            {editing && (
              <div className="rounded-xl border border-accent-brand/40 bg-accent-brand/5 p-8 space-y-6 shadow-[0_0_20px_hsl(var(--accent-brand)/0.05)]">
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Edit Profile</h3>
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Organisation Name</label>
                    <input
                      className="w-full max-w-md h-10 px-4 rounded-lg border border-border/50 bg-card text-sm text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all shadow-sm"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Your organisation name"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Logo URL</label>
                    <input
                      className="w-full max-w-md h-10 px-4 rounded-lg border border-border/50 bg-card text-sm text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all shadow-sm font-mono"
                      value={form.logoUrl}
                      onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                      placeholder="https://example.com/logo.png"
                    />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-2">
                      Enter a publicly accessible image URL. Leave blank to use initials.
                    </p>
                  </div>
                  {form.logoUrl && (
                    <div className="flex items-center gap-4 bg-card/50 p-4 rounded-lg border border-border/50 w-max">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Preview:</span>
                      <OrgInitials name={form.name || org.name} logoUrl={form.logoUrl} />
                    </div>
                  )}
                </div>
                <div className="flex gap-3 pt-4 border-t border-accent-brand/20">
                  <button onClick={save} disabled={!form.name || saveMutation.isPending} className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-accent-brand/50 bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 disabled:opacity-50 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]">
                    <Save className="h-3.5 w-3.5" />
                    {saveMutation.isPending ? "Saving…" : "Save Changes"}
                  </button>
                  <button onClick={() => setEditing(false)} className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border/50 bg-card text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all shadow-sm">
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Details table */}
            <div className="rounded-xl border border-card-border bg-card/40 backdrop-blur-md overflow-hidden shadow-sm">
              {[
                { label: "Organisation ID",  value: org.id, mono: true },
                { label: "Slug",             value: org.slug, mono: true },
                { label: "Plan",             value: TIER_LABELS[org.planTier]?.label ?? org.planTier },
                { label: "Status",           value: STATUS_LABELS[org.status]?.label ?? org.status },
                { label: "Member since",     value: new Date(org.createdAt).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" }).toUpperCase(), mono: true },
                { label: "Last updated",     value: new Date(org.updatedAt).toLocaleString().toUpperCase(), mono: true },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex items-center border-b border-border/50 last:border-0 px-6 py-4 hover:bg-card/40 transition-colors">
                  <span className="w-48 text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex-shrink-0">{label}</span>
                  <span className={`text-sm ${mono ? "font-mono font-bold tracking-tight text-foreground" : "font-medium text-foreground"}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
