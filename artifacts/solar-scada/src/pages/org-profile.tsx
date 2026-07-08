import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Edit2, Save, X } from "lucide-react";
import { AppLayout } from "@/components/layout";
import { OrgNav } from "@/components/org-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  starter:      { label: "Starter",      cls: "text-muted-foreground border-border" },
  professional: { label: "Professional", cls: "text-blue-400 border-blue-500/40" },
  enterprise:   { label: "Enterprise",   cls: "text-primary border-primary/40" },
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active:    { label: "Active",    cls: "text-status-normal border-status-normal/40" },
  suspended: { label: "Suspended", cls: "text-status-fault border-status-fault/40" },
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
        className="w-16 h-16 rounded-xl object-cover border border-border"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div className="w-16 h-16 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
      <span className="text-2xl font-bold text-primary">{initials}</span>
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
      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Organisation Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your org profile, users, notifications, and activity log
          </p>
        </div>

        <OrgNav />

        {isLoading ? (
          <div className="text-muted-foreground text-sm py-8">Loading profile…</div>
        ) : org ? (
          <div className="space-y-6">
            {/* Header card */}
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <OrgInitials name={org.name} logoUrl={org.logoUrl} />
                  <div>
                    <h2 className="text-xl font-semibold">{org.name}</h2>
                    <p className="text-sm text-muted-foreground font-mono">@{org.slug}</p>
                    <div className="flex gap-2 mt-1.5">
                      {TIER_LABELS[org.planTier] && (
                        <Badge variant="outline" className={`text-xs ${TIER_LABELS[org.planTier]!.cls}`}>
                          {TIER_LABELS[org.planTier]!.label}
                        </Badge>
                      )}
                      {STATUS_LABELS[org.status] && (
                        <Badge variant="outline" className={`text-xs ${STATUS_LABELS[org.status]!.cls}`}>
                          {STATUS_LABELS[org.status]!.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {canManage && !editing && (
                  <Button size="sm" variant="outline" onClick={startEdit} className="gap-2">
                    <Edit2 className="h-3.5 w-3.5" /> Edit Profile
                  </Button>
                )}
              </div>
            </div>

            {/* Edit form */}
            {editing && (
              <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                <h3 className="text-sm font-semibold">Edit Profile</h3>
                <div className="space-y-4">
                  <div>
                    <Label>Organisation Name</Label>
                    <Input
                      className="mt-1"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Your organisation name"
                    />
                  </div>
                  <div>
                    <Label>Logo URL</Label>
                    <Input
                      className="mt-1"
                      value={form.logoUrl}
                      onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                      placeholder="https://example.com/logo.png"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter a publicly accessible image URL. Leave blank to use the initials fallback.
                    </p>
                  </div>
                  {form.logoUrl && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">Preview:</span>
                      <OrgInitials name={form.name || org.name} logoUrl={form.logoUrl} />
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={save} disabled={!form.name || saveMutation.isPending} className="gap-2">
                    <Save className="h-3.5 w-3.5" />
                    {saveMutation.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="gap-2">
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Details table */}
            <div className="rounded-lg border border-border overflow-hidden">
              {[
                { label: "Organisation ID",  value: org.id, mono: true },
                { label: "Slug",             value: org.slug, mono: true },
                { label: "Plan",             value: TIER_LABELS[org.planTier]?.label ?? org.planTier },
                { label: "Status",           value: STATUS_LABELS[org.status]?.label ?? org.status },
                { label: "Member since",     value: new Date(org.createdAt).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" }) },
                { label: "Last updated",     value: new Date(org.updatedAt).toLocaleString() },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex items-center border-b border-border last:border-0 px-4 py-3">
                  <span className="w-40 text-xs text-muted-foreground flex-shrink-0">{label}</span>
                  <span className={`text-sm ${mono ? "font-mono text-muted-foreground" : ""}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
