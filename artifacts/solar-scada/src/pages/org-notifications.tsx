import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Save, Info, Webhook, Eye, EyeOff } from "lucide-react";
import { AppLayout } from "@/components/layout";
import { OrgNav } from "@/components/org-nav";
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
    severity: "bg-status-fault/15 text-status-fault border border-status-fault/30 shadow-[0_0_10px_hsl(var(--status-fault)/0.1)]",
  },
  "alarm.major": {
    label: "Major Alarm",
    description: "Fires when a major performance or availability issue is detected",
    severity: "bg-status-warning/15 text-status-warning border border-status-warning/30 shadow-[0_0_10px_hsl(var(--status-warning)/0.1)]",
  },
  "alarm.minor": {
    label: "Minor Alarm",
    description: "Informational — deviation within acceptable threshold",
    severity: "bg-accent-brand/10 text-accent-brand border border-accent-brand/30 shadow-[0_0_10px_hsl(var(--accent-brand)/0.1)]",
  },
  "report.daily": {
    label: "Daily Generation Summary",
    description: "Sent every morning with yesterday's generation and performance metrics",
    severity: "bg-muted/40 text-muted-foreground border border-border/50",
  },
  "report.weekly": {
    label: "Weekly Performance Report",
    description: "Comprehensive weekly rollup sent every Monday",
    severity: "bg-muted/40 text-muted-foreground border border-border/50",
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
      <div className="max-w-5xl mx-auto flex flex-col space-y-6 h-full">
        <div className="animate-fade-up">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Bell className="h-7 w-7 text-accent-brand" />
            Organisation Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Manage your org profile, users, notifications, and activity log
          </p>
        </div>

        <OrgNav />

        {isLoading ? (
          <div className="h-64 bg-card/40 border border-card-border rounded-xl animate-shimmer" />
        ) : (
          <div className="space-y-6 animate-fade-up" style={{ animationDelay: '50ms' }}>
            {/* Status bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-card/40 border border-border/50 px-4 py-2 rounded-lg shadow-sm">
                <Info className="h-3.5 w-3.5" />
                {enabledCount === 0
                  ? "No notifications enabled — alerts will not be sent by email"
                  : `${enabledCount} notification channel${enabledCount !== 1 ? "s" : ""} active`}
                {config?.updatedAt && (
                  <span className="opacity-70 ml-2">· Last saved {new Date(config.updatedAt).toLocaleDateString()}</span>
                )}
              </div>
              {canManage && (
                <button
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-accent-brand/50 bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 disabled:opacity-50 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]"
                  onClick={() => saveMutation.mutate()}
                  disabled={!dirty || saveMutation.isPending}
                >
                  <Save className="h-3.5 w-3.5" />
                  {saveMutation.isPending ? "Saving…" : dirty ? "Save Changes" : "Saved"}
                </button>
              )}
            </div>

            {/* Notification matrix */}
            <div className="rounded-xl border border-card-border bg-card/40 backdrop-blur-md overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/10">
                    <th className="text-left px-5 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap w-64">
                      Event
                    </th>
                    <th className="text-left px-5 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap w-24">
                      Enabled
                    </th>
                    <th className="text-left px-5 py-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                      Email Recipients
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(EVENT_META) as NotificationEvent[]).map((event) => {
                    const meta = EVENT_META[event];
                    const cfg = rules[event];
                    return (
                      <tr key={event} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors bg-card/20">
                        <td className="px-5 py-4">
                          <div>
                            <div className="flex items-center gap-3">
                              <span
                                className={`inline-block text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${meta.severity}`}
                              >
                                {event.startsWith("alarm") ? "ALARM" : "REPORT"}
                              </span>
                              <span className="font-bold text-foreground">{meta.label}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-widest">{meta.description}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <Switch
                            checked={cfg?.enabled ?? false}
                            onCheckedChange={(v) => update(event, "enabled", v)}
                            disabled={!canManage}
                            className="data-[state=checked]:bg-accent-brand"
                          />
                        </td>
                        <td className="px-5 py-4">
                          <input
                            className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm font-mono text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all placeholder:font-sans placeholder:text-[10px] placeholder:uppercase placeholder:tracking-widest"
                            placeholder="ops@company.com, noc@company.com"
                            value={cfg?.email ?? ""}
                            onChange={(e) => update(event, "email", e.target.value)}
                            disabled={!canManage || !cfg?.enabled}
                          />
                          {cfg?.enabled && !cfg.email && (
                            <p className="text-[9px] font-bold uppercase tracking-widest text-status-warning mt-2">Enter at least one recipient email</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canManage && dirty && (
              <div className="flex justify-end pt-2">
                <button
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-accent-brand/50 bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 disabled:opacity-50 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-3.5 w-3.5" />
                  {saveMutation.isPending ? "Saving…" : "Save All Changes"}
                </button>
              </div>
            )}

            {/* ── Webhook delivery ─────────────────────────────────────── */}
            <div className="mt-8 pt-8 border-t border-border/50">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-accent-brand/10 border border-accent-brand/20 flex items-center justify-center shadow-[0_0_15px_hsl(var(--accent-brand)/0.15)]">
                  <Webhook className="h-5 w-5 text-accent-brand" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground tracking-tight">Webhook Delivery</h2>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
                    Push event JSON to your external endpoints
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-card-border bg-card/40 backdrop-blur-md p-6 space-y-6 mt-6 shadow-sm">
                <div className="flex items-start gap-3 bg-muted/30 border border-border/50 p-4 rounded-lg">
                  <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    POST a signed JSON payload to your endpoint whenever selected events fire.
                    The <code className="bg-card border border-border/50 px-1.5 py-0.5 rounded text-foreground font-mono">X-SCADA-Signature</code> header contains an HMAC-SHA256 signature to verify authenticity.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* URL */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Endpoint URL</label>
                    <input
                      className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm font-mono text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all placeholder:font-sans placeholder:text-[10px] placeholder:uppercase placeholder:tracking-widest"
                      placeholder="https://hooks.example.com/scada"
                      value={webhookUrl}
                      onChange={(e) => { setWebhookUrl(e.target.value); setWebhookDirty(true); }}
                      disabled={!canManage}
                    />
                  </div>
                  {/* Secret */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Signing Secret</label>
                    <div className="flex gap-2">
                      <input
                        className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm font-mono text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all placeholder:font-sans placeholder:text-[10px] placeholder:uppercase placeholder:tracking-widest flex-1"
                        type={showSecret ? "text" : "password"}
                        placeholder="Leave blank to keep existing secret"
                        value={webhookSecret}
                        onChange={(e) => { setWebhookSecret(e.target.value); setWebhookDirty(true); }}
                        disabled={!canManage}
                      />
                      <button
                        className="h-10 px-4 flex items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all shadow-sm"
                        onClick={() => setShowSecret((v) => !v)}
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {webhookConfig?.hasSecret && webhookSecret === "••••••••" && (
                      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mt-2 text-status-warning">Secret already set — enter a new value to rotate</p>
                    )}
                  </div>
                </div>
                {/* Events */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 block">Forward these events</label>
                  <div className="flex flex-wrap gap-3">
                    {WEBHOOK_EVENTS.map((ev) => (
                      <button
                        key={ev}
                        onClick={() => { if (canManage) toggleWebhookEvent(ev); }}
                        className={`text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg border transition-all ${
                          webhookEvents.includes(ev)
                            ? "bg-accent-brand/10 border-accent-brand/40 text-accent-brand shadow-[0_0_10px_hsl(var(--accent-brand)/0.15)]"
                            : "bg-card/50 border-border/50 text-muted-foreground hover:border-border hover:bg-card shadow-sm"
                        } ${!canManage ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        {ev}
                      </button>
                    ))}
                  </div>
                </div>
                {canManage && webhookDirty && (
                  <div className="flex justify-end pt-4 border-t border-border/50">
                    <button
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-accent-brand/50 bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 disabled:opacity-50 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]"
                      onClick={() => saveWebhookMutation.mutate()}
                      disabled={saveWebhookMutation.isPending}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saveWebhookMutation.isPending ? "Saving…" : "Save Webhook"}
                    </button>
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
