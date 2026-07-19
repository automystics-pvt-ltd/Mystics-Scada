/**
 * Notification Services — /superadmin/notifications
 *
 * Platform-level notification channel status, configuration, and test-send.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import {
  Bell, Mail, MessageSquare, Link2, Phone, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Send, Megaphone,
  Hash, Info, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL as string;

interface NotifConfig {
  smtp: { enabled: boolean; host: string | null; from: string | null };
}

function StatusBadge({ enabled, label }: { enabled: boolean; label?: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${
        enabled
          ? "border-status-normal/30 text-status-normal bg-status-normal/5"
          : "border-muted-foreground/30 text-muted-foreground"
      }`}
    >
      {enabled ? "● " : "○ "}{label ?? (enabled ? "Active" : "Not configured")}
    </Badge>
  );
}

function ChannelRow({
  icon: Icon,
  title,
  description,
  enabled,
  badge,
  children,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
  enabled: boolean;
  badge?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className={`p-2 rounded-lg ${enabled ? "bg-primary/10" : "bg-muted/40"}`}>
          <Icon className={`h-4 w-4 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{title}</span>
            <StatusBadge enabled={enabled} label={badge} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <span className="text-muted-foreground text-xs">{open ? "▲" : "▼"}</span>
      </div>
      {open && children && (
        <div className="border-t border-border px-5 py-4 bg-muted/10 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

export default function SuperAdminNotifications() {
  const { toast } = useToast();
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [bannerMsg, setBannerMsg] = useState("");
  const [bannerType, setBannerType] = useState<"info" | "warning" | "critical">("info");
  const [bannerActive, setBannerActive] = useState(false);

  const { data: config, isLoading, refetch } = useQuery<NotifConfig>({
    queryKey: ["superadmin", "notif-config"],
    queryFn: () =>
      fetch(`${BASE}api/superadmin/system-config`, { credentials: "include" })
        .then((r) => r.json())
        .then((d: { smtp: NotifConfig["smtp"] }) => ({ smtp: d.smtp })),
  });

  const smtpEnabled = config?.smtp.enabled ?? false;

  async function sendTestEmail() {
    if (!testEmail.trim()) return;
    setSendingTest(true);
    try {
      const r = await fetch(`${BASE}api/superadmin/notifications/test-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-SCADA-Request": "1" },
        body: JSON.stringify({ to: testEmail.trim() }),
      });
      const d = await r.json() as { ok?: boolean; message?: string };
      if (d.ok) toast({ title: "✅ Test email sent", description: `Delivered to ${testEmail}` });
      else toast({ title: "Send failed", description: d.message ?? "Unknown error", variant: "destructive" });
    } catch {
      toast({ title: "Request error", variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  }

  // Delivery stats (mock — replace with real DB query when delivery logs exist)
  const stats = [
    { label: "Emails sent (24h)",      value: "—",  color: "text-foreground" },
    { label: "Delivery failures (24h)",value: "—",  color: "text-muted-foreground" },
    { label: "In-app notifs (24h)",     value: "—",  color: "text-foreground" },
    { label: "Active webhooks",         value: "0",  color: "text-muted-foreground" },
  ];

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Bell className="h-6 w-6 text-primary" />
                Notification Services
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Platform notification channels, delivery status, and test tools
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          {/* Delivery stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map(({ label, value, color }) => (
              <div key={label} className="border border-border rounded-xl p-4 bg-card">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Channels */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Notification Channels</h2>

            {/* In-App (SSE) */}
            <ChannelRow
              icon={Activity}
              title="In-App Notifications"
              description="Server-Sent Events (SSE) push to all connected browser sessions"
              enabled={true}
              badge="Always On"
            >
              <div className="text-xs text-muted-foreground space-y-1">
                <p>SSE streams are maintained per organisation. Notifications are pushed instantly with no polling.</p>
                <p className="text-status-normal flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> No configuration required</p>
              </div>
            </ChannelRow>

            {/* Email */}
            <ChannelRow
              icon={Mail}
              title="Email (SMTP)"
              description={config?.smtp.host ? `Connected via ${config.smtp.host}` : "No SMTP server configured"}
              enabled={smtpEnabled}
            >
              {isLoading ? (
                <div className="h-8 bg-muted animate-pulse rounded" />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/30 rounded px-3 py-2">
                      <p className="text-muted-foreground mb-0.5">Host</p>
                      <p className="font-mono">{config?.smtp.host ?? "—"}</p>
                    </div>
                    <div className="bg-muted/30 rounded px-3 py-2">
                      <p className="text-muted-foreground mb-0.5">From address</p>
                      <p className="font-mono truncate">{config?.smtp.from ?? "—"}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium mb-2">Send test email</p>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="recipient@example.com"
                        disabled={!smtpEnabled}
                        className="text-sm h-8"
                        onKeyDown={(e) => e.key === "Enter" && void sendTestEmail()}
                      />
                      <Button
                        size="sm"
                        onClick={() => void sendTestEmail()}
                        disabled={!smtpEnabled || sendingTest || !testEmail.trim()}
                        className="gap-1.5 flex-shrink-0 h-8"
                      >
                        {sendingTest
                          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          : <Send className="h-3.5 w-3.5" />}
                        Send
                      </Button>
                    </div>
                    {!smtpEnabled && (
                      <p className="text-xs text-status-warning mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Set SMTP_HOST in server .env and restart the API to enable email delivery
                      </p>
                    )}
                  </div>
                </div>
              )}
            </ChannelRow>

            {/* SMS */}
            <ChannelRow
              icon={Phone}
              title="SMS Alerts"
              description="Text message delivery via Twilio, AWS SNS, or compatible provider"
              enabled={false}
            >
              <div className="text-xs space-y-2">
                <p className="text-muted-foreground">SMS delivery requires an SMS provider integration. Add your provider credentials to enable this channel.</p>
                <div className="flex flex-wrap gap-2">
                  {["Twilio", "AWS SNS", "Vonage", "MessageBird"].map((p) => (
                    <span key={p} className="px-2 py-1 rounded border border-border text-muted-foreground">{p}</span>
                  ))}
                </div>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" /> Configure via environment variables: SMS_PROVIDER, SMS_API_KEY, SMS_FROM
                </p>
              </div>
            </ChannelRow>

            {/* Slack */}
            <ChannelRow
              icon={Hash}
              title="Slack"
              description="Post alarm and event notifications to Slack channels via Incoming Webhooks"
              enabled={false}
            >
              <div className="text-xs space-y-2 text-muted-foreground">
                <p>Create a Slack Incoming Webhook and add the URL to your environment:</p>
                <code className="block bg-muted/50 px-3 py-2 rounded font-mono">SLACK_WEBHOOK_URL=https://hooks.slack.com/services/…</code>
                <p>Restart the API service after adding the variable.</p>
              </div>
            </ChannelRow>

            {/* Webhook */}
            <ChannelRow
              icon={Link2}
              title="Outbound Webhooks"
              description="HTTP POST to external endpoints on alarm and event triggers"
              enabled={false}
            >
              <div className="text-xs space-y-2 text-muted-foreground">
                <p>Webhook delivery is configured per-organisation under Org Settings → Notifications → Channels.</p>
                <p>Platform-wide webhook endpoints (for all orgs) are not yet supported — they are on the roadmap.</p>
              </div>
            </ChannelRow>

            {/* MS Teams */}
            <ChannelRow
              icon={MessageSquare}
              title="Microsoft Teams"
              description="Post to Teams channels via Power Automate or Incoming Webhooks"
              enabled={false}
            >
              <div className="text-xs space-y-2 text-muted-foreground">
                <p>Configure via environment variable:</p>
                <code className="block bg-muted/50 px-3 py-2 rounded font-mono">TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/…</code>
              </div>
            </ChannelRow>
          </div>

          {/* Platform Banner section (kept from communications page) */}
          <div className="border border-border rounded-xl p-5 bg-card space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" /> Platform Announcement Banner
            </h2>
            <p className="text-xs text-muted-foreground">
              Display a dismissible banner to all logged-in users across every organisation.
            </p>

            <div className="grid grid-cols-3 gap-2">
              {(["info", "warning", "critical"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setBannerType(t)}
                  className={`px-3 py-1.5 rounded border text-sm font-medium capitalize transition-colors ${
                    bannerType === t
                      ? t === "critical" ? "bg-status-fault/10 border-status-fault/30 text-status-fault"
                        : t === "warning" ? "bg-status-warning/10 border-status-warning/30 text-status-warning"
                        : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <Input
              value={bannerMsg}
              onChange={(e) => setBannerMsg(e.target.value)}
              placeholder="Enter announcement message for all users…"
              className="text-sm"
            />

            <div className="flex gap-2">
              <Button onClick={() => {
                if (!bannerMsg.trim()) { toast({ title: "Enter a message first", variant: "destructive" }); return; }
                setBannerActive(true);
                toast({ title: "Platform banner activated" });
              }} className="gap-2">
                <Send className="h-3.5 w-3.5" /> Activate Banner
              </Button>
              {bannerActive && (
                <Button variant="outline" onClick={() => { setBannerActive(false); setBannerMsg(""); }}
                  className="gap-2 border-status-fault/30 text-status-fault hover:bg-status-fault/5">
                  Clear Banner
                </Button>
              )}
            </div>

            {bannerActive && (
              <div className={`rounded-lg px-4 py-3 border flex items-center gap-3 text-sm ${
                bannerType === "critical" ? "bg-status-fault/10 border-status-fault/30 text-status-fault"
                : bannerType === "warning" ? "bg-status-warning/10 border-status-warning/30 text-status-warning"
                : "bg-blue-500/10 border-blue-500/30 text-blue-400"
              }`}>
                <Bell className="h-4 w-4 flex-shrink-0" />
                <span>{bannerMsg}</span>
                <CheckCircle2 className="h-4 w-4 ml-auto flex-shrink-0 text-status-normal" />
              </div>
            )}
          </div>

        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
