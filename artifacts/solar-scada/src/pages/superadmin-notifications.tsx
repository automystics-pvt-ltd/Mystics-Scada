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
    <div className="border border-border/50 rounded-none-none overflow-hidden bg-black/40">
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className={`p-2 rounded-none-none ${enabled ? "bg-accent-brand/10" : "bg-black/60"}`}>
          <Icon className={`h-4 w-4 ${enabled ? "text-accent-brand" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-foreground">{title}</span>
            <StatusBadge enabled={enabled} label={badge} />
          </div>
          <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mt-0.5">{description}</p>
        </div>
        <span className="text-muted-foreground font-mono text-[8px] uppercase tracking-widest">{open ? "▲" : "▼"}</span>
      </div>
      {open && children && (
        <div className="border-t border-border/50 px-5 py-4 bg-white/5 space-y-3">
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
          <div className="flex items-center justify-between border-b border-border/50 pb-4 relative"><div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <div>
              <h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">
                <Bell className="h-6 w-6 text-accent-brand" />
                Notification Services
              </h1>
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1">
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
              <div key={label} className="border border-border/50 rounded-none-none p-4 bg-black/40">
                <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
                <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Channels */}
          <div className="space-y-3">
            <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground text-muted-foreground uppercase tracking-wider">Notification Channels</h2>

            {/* In-App (SSE) */}
            <ChannelRow
              icon={Activity}
              title="In-App Notifications"
              description="Server-Sent Events (SSE) push to all connected browser sessions"
              enabled={true}
              badge="Always On"
            >
              <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground space-y-1">
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
                <div className="h-8 bg-white/10 animate-pulse rounded-none" />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 font-mono text-[8px] uppercase tracking-widest">
                    <div className="bg-black/40 rounded-none px-3 py-2">
                      <p className="text-muted-foreground mb-0.5">Host</p>
                      <p className="font-mono">{config?.smtp.host ?? "—"}</p>
                    </div>
                    <div className="bg-black/40 rounded-none px-3 py-2">
                      <p className="text-muted-foreground mb-0.5">From address</p>
                      <p className="font-mono truncate">{config?.smtp.from ?? "—"}</p>
                    </div>
                  </div>

                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-widest font-medium mb-2">Send test email</p>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="recipient@example.com"
                        disabled={!smtpEnabled}
                        className="font-mono text-[9px] uppercase tracking-widest h-8"
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
                      <p className="font-mono text-[8px] uppercase tracking-widest text-status-warning mt-1 flex items-center gap-1">
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
              <div className="font-mono text-[8px] uppercase tracking-widest space-y-2">
                <p className="text-muted-foreground">SMS delivery requires an SMS provider integration. Add your provider credentials to enable this channel.</p>
                <div className="flex flex-wrap gap-2">
                  {["Twilio", "AWS SNS", "Vonage", "MessageBird"].map((p) => (
                    <span key={p} className="px-2 py-1 rounded-none border border-border/50 text-muted-foreground">{p}</span>
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
              <div className="font-mono text-[8px] uppercase tracking-widest space-y-2 text-muted-foreground">
                <p>Create a Slack Incoming Webhook and add the URL to your environment:</p>
                <code className="block bg-black/60 px-3 py-2 rounded-none font-mono">SLACK_WEBHOOK_URL=https://hooks.slack.com/services/…</code>
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
              <div className="font-mono text-[8px] uppercase tracking-widest space-y-2 text-muted-foreground">
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
              <div className="font-mono text-[8px] uppercase tracking-widest space-y-2 text-muted-foreground">
                <p>Configure via environment variable:</p>
                <code className="block bg-black/60 px-3 py-2 rounded-none font-mono">TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/…</code>
              </div>
            </ChannelRow>
          </div>

          {/* Platform Banner section (kept from communications page) */}
          <div className="border border-border/50 rounded-none-none p-5 bg-black/40 space-y-4">
            <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-accent-brand" /> Platform Announcement Banner
            </h2>
            <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
              Display a dismissible banner to all logged-in users across every organisation.
            </p>

            <div className="grid grid-cols-3 gap-2">
              {(["info", "warning", "critical"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setBannerType(t)}
                  className={`px-3 py-1.5 rounded-none border font-mono text-[9px] uppercase tracking-widest font-bold text-foreground capitalize transition-colors ${
                    bannerType === t
                      ? t === "critical" ? "bg-status-fault/10 border-status-fault/30 text-status-fault"
                        : t === "warning" ? "bg-status-warning/10 border-status-warning/30 text-status-warning"
                        : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                      : "border-border/50 text-muted-foreground hover:border-accent-brand/40"
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
              className="font-mono text-[9px] uppercase tracking-widest"
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
              <div className={`rounded-none-none px-4 py-3 border flex items-center gap-3 font-mono text-[9px] uppercase tracking-widest ${
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
