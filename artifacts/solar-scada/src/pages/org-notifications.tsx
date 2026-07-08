import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Save, Info, Webhook, Eye, EyeOff } from "lucide-react";
import { AppLayout } from "@/components/layout";
import { OrgNav } from "@/components/org-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL;

type NotificationEvent =
  | "alarm.critical"
  | "alarm.major"
  | "alarm.minor"
  | "report.daily"
  | "report.weekly";

interface EventConfig {
  enabled: boolean;
  email: string;
}

type NotificationRules = Record<NotificationEvent, EventConfig>;

interface NotificationConfig {
  channel: string;
  events: NotificationRules;
  updatedAt: string | null;
}

const EVENT_META: Record<NotificationEvent, { label: string; description: string; severity: string }> = {
  "alarm.critical": {
    label: "Critical Alarm",
    description: "Fires immediately when a critical fault or safety alarm is raised",
    severity: "bg-status-fault/15 text-status-fault",
  },
  "alarm.major": {
    label: "Major Alarm",
    description: "Fires when a major performance or availability issue is detected",
    severity: "bg-status-warning/15 text-status-warning",
  },
  "alarm.minor": {
    label: "Minor Alarm",
    description: "Informational — deviation within acceptable threshold",
    severity: "bg-blue-500/10 text-blue-400",
  },
  "report.daily": {
    label: "Daily Generation Summary",
    description: "Sent every morning with yesterday's generation and performance metrics",
    severity: "bg-muted/40 text-muted-foreground",
  },
  "report.weekly": {
    label: "Weekly Performance Report",
    description: "Comprehensive weekly rollup sent every Monday",
    severity: "bg-muted/40 text-muted-foreground",
  },
};

const EMPTY_RULES: NotificationRules = {
  "alarm.critical": { enabled: false, email: "" },
  "alarm.major":    { enabled: false, email: "" },
  "alarm.minor":    { enabled: false, email: "" },
  "report.daily":   { enabled: false, email: "" },
  "report.weekly":  { enabled: false, email: "" },
};

interface WebhookConfig {
  url: string;
  secret: string;
  hasSecret: boolean;
  enabledEvents: string[];
  updatedAt: string | null;
}

const WEBHOOK_EVENTS = [
  "alarm.critical", "alarm.major", "alarm.minor",
  "work_order.created", "work_order.status",
] as const;

export default function OrgNotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("notifications.manage") ?? false;

  const [rules, setRules] = useState<NotificationRules>(EMPTY_RULES);
  const [dirty, setDirty] = useState(false);

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["alarm.critical", "alarm.major"]);
  const [webhookDirty, setWebhookDirty] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const { data: config, isLoading } = useQuery<NotificationConfig>({
    queryKey: ["org-notifications"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/org/notifications`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load notification config");
      return r.json() as Promise<NotificationConfig>;
    },
  });

  useEffect(() => {
    if (config?.events) {
      setRules({ ...EMPTY_RULES, ...config.events });
      setDirty(false);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/org/notifications`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: rules }),
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Save failed");
      }
      return r.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["org-notifications"] });
      setDirty(false);
      toast({ title: "Notification settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Webhook config query
  const { data: webhookConfig } = useQuery<WebhookConfig>({
    queryKey: ["org-notifications-webhook"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/org/notifications/webhook`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load webhook config");
      return r.json() as Promise<WebhookConfig>;
    },
  });

  useEffect(() => {
    if (webhookConfig) {
      setWebhookUrl(webhookConfig.url ?? "");
      setWebhookSecret(webhookConfig.hasSecret ? "••••••••" : "");
      setWebhookEvents(webhookConfig.enabledEvents ?? ["alarm.critical", "alarm.major"]);
      setWebhookDirty(false);
    }
  }, [webhookConfig]);

  const saveWebhookMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/org/notifications/webhook`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          secret: webhookSecret === "••••••••" ? undefined : webhookSecret,
          enabledEvents: webhookEvents,
        }),
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Save failed");
      }
      return r.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["org-notifications-webhook"] });
      setWebhookDirty(false);
      toast({ title: "Webhook configuration saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function toggleWebhookEvent(event: string) {
    setWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
    setWebhookDirty(true);
  }

  function update(event: NotificationEvent, field: keyof EventConfig, value: boolean | string) {
    setRules((prev) => ({
      ...prev,
      [event]: { ...prev[event], [field]: value },
    }));
    setDirty(true);
  }

  const enabledCount = Object.values(rules).filter((r) => r.enabled).length;

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Organisation Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your org profile, users, notifications, and activity log
          </p>
        </div>

        <OrgNav />

        {isLoading ? (
          <div className="text-muted-foreground text-sm py-8">Loading notification settings…</div>
        ) : (
          <div className="space-y-4">
            {/* Status bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                {enabledCount === 0
                  ? "No notifications enabled — alerts will not be sent by email"
                  : `${enabledCount} notification channel${enabledCount !== 1 ? "s" : ""} active`}
                {config?.updatedAt && (
                  <span className="text-xs">· Last saved {new Date(config.updatedAt).toLocaleDateString()}</span>
                )}
              </div>
              {canManage && (
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => saveMutation.mutate()}
                  disabled={!dirty || saveMutation.isPending}
                >
                  <Save className="h-3.5 w-3.5" />
                  {saveMutation.isPending ? "Saving…" : dirty ? "Save Changes" : "Saved"}
                </Button>
              )}
            </div>

            {/* Notification matrix */}
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-56">
                      Event
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-24">
                      Enabled
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Email Recipients
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(EVENT_META) as NotificationEvent[]).map((event) => {
                    const meta = EVENT_META[event];
                    const cfg = rules[event];
                    return (
                      <tr key={event} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${meta.severity}`}
                              >
                                {event.startsWith("alarm") ? "Alarm" : "Report"}
                              </span>
                              <span className="font-medium text-sm">{meta.label}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Switch
                            checked={cfg?.enabled ?? false}
                            onCheckedChange={(v) => update(event, "enabled", v)}
                            disabled={!canManage}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            className="h-8 text-sm"
                            placeholder="ops@company.com, noc@company.com"
                            value={cfg?.email ?? ""}
                            onChange={(e) => update(event, "email", e.target.value)}
                            disabled={!canManage || !cfg?.enabled}
                          />
                          {cfg?.enabled && !cfg.email && (
                            <p className="text-xs text-status-warning mt-1">Enter at least one recipient email</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canManage && dirty && (
              <div className="flex justify-end">
                <Button
                  className="gap-2"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? "Saving…" : "Save All Changes"}
                </Button>
              </div>
            )}

            {/* ── Webhook delivery ─────────────────────────────────────── */}
            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex items-center gap-2 mb-1">
                <Webhook className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Webhook Delivery</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                POST a signed JSON payload to your endpoint whenever selected events fire.
                The <code className="bg-muted px-1 rounded">X-SCADA-Signature</code> header contains an HMAC-SHA256 signature.
              </p>
              <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                {/* URL */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Endpoint URL</label>
                  <Input
                    className="h-9 text-sm font-mono"
                    placeholder="https://hooks.example.com/scada"
                    value={webhookUrl}
                    onChange={(e) => { setWebhookUrl(e.target.value); setWebhookDirty(true); }}
                    disabled={!canManage}
                  />
                </div>
                {/* Secret */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Signing Secret</label>
                  <div className="flex gap-2">
                    <Input
                      className="h-9 text-sm font-mono flex-1"
                      type={showSecret ? "text" : "password"}
                      placeholder="Leave blank to keep existing secret"
                      value={webhookSecret}
                      onChange={(e) => { setWebhookSecret(e.target.value); setWebhookDirty(true); }}
                      disabled={!canManage}
                    />
                    <Button
                      size="sm" variant="outline" className="h-9 px-3"
                      onClick={() => setShowSecret((v) => !v)}
                    >
                      {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  {webhookConfig?.hasSecret && webhookSecret === "••••••••" && (
                    <p className="text-xs text-muted-foreground/60 mt-1">Secret already set — enter a new value to rotate</p>
                  )}
                </div>
                {/* Events */}
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Forward these events</label>
                  <div className="flex flex-wrap gap-2">
                    {WEBHOOK_EVENTS.map((ev) => (
                      <button
                        key={ev}
                        onClick={() => { if (canManage) toggleWebhookEvent(ev); }}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          webhookEvents.includes(ev)
                            ? "bg-primary/15 border-primary/40 text-primary"
                            : "bg-muted/30 border-border text-muted-foreground hover:border-border"
                        } ${!canManage ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        {ev}
                      </button>
                    ))}
                  </div>
                </div>
                {canManage && webhookDirty && (
                  <div className="flex justify-end">
                    <Button
                      size="sm" className="gap-2"
                      onClick={() => saveWebhookMutation.mutate()}
                      disabled={saveWebhookMutation.isPending}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saveWebhookMutation.isPending ? "Saving…" : "Save Webhook"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
