/**
 * System Configuration — /superadmin/config
 *
 * Platform-wide settings: security policy, SMTP, rate limits, IP whitelist.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import {
  Settings, Shield, Mail, Gauge, Network, Save, RefreshCw,
  CheckCircle2, XCircle, Lock, Clock, AlertTriangle, Plus, Trash2,
  Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL as string;

interface SystemConfig {
  security: {
    sessionTimeoutDays: number;
    maxFailedLogins: number;
    accountLockoutMinutes: number;
    mfaRequired: boolean;
    captchaEnabled: boolean;
  };
  rateLimits: {
    maxRequestsPerMinute: number;
    maxLoginAttemptsPerHour: number;
  };
  ipWhitelist: string[];
  smtp: {
    host: string | null;
    port: string | null;
    from: string | null;
    user: string | null;
    enabled: boolean;
  };
}

type Tab = "security" | "smtp" | "rate-limits" | "ip-whitelist";

const TABS: { id: Tab; label: string; icon: typeof Settings }[] = [
  { id: "security",    label: "Security Policy",  icon: Shield   },
  { id: "smtp",        label: "SMTP / Email",      icon: Mail     },
  { id: "rate-limits", label: "Rate Limits",       icon: Gauge    },
  { id: "ip-whitelist",label: "IP Whitelist",      icon: Network  },
];

function Spinner() {
  return <RefreshCw className="h-3.5 w-3.5 animate-spin" />;
}

export default function SuperAdminConfig() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("security");
  const [draft, setDraft] = useState<Partial<SystemConfig>>({});
  const [newIp, setNewIp] = useState("");
  const [showSmtpUser, setShowSmtpUser] = useState(false);

  const { data: config, isLoading } = useQuery<SystemConfig>({
    queryKey: ["superadmin", "system-config"],
    queryFn: () =>
      fetch(`${BASE}api/superadmin/system-config`, { credentials: "include" })
        .then((r) => r.json()) as Promise<SystemConfig>,
  });

  // Seed draft from server data once loaded (but don't clobber user edits mid-session)
  useEffect(() => {
    if (config && Object.keys(draft).length === 0) {
      setDraft(JSON.parse(JSON.stringify(config)) as SystemConfig);
    }
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMut = useMutation({
    mutationFn: (payload: Partial<SystemConfig>) =>
      fetch(`${BASE}api/superadmin/system-config`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-SCADA-Request": "1" },
        body: JSON.stringify(payload),
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Configuration saved" });
      void qc.invalidateQueries({ queryKey: ["superadmin", "system-config"] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const sec    = draft.security    ?? config?.security;
  const rl     = draft.rateLimits  ?? config?.rateLimits;
  const ipList = draft.ipWhitelist ?? config?.ipWhitelist ?? [];
  const smtp   = config?.smtp;

  function updateSecurity(key: keyof SystemConfig["security"], value: number | boolean) {
    setDraft((d) => ({ ...d, security: { ...(d.security ?? config?.security!), [key]: value } }));
  }
  function updateRl(key: keyof SystemConfig["rateLimits"], value: number) {
    setDraft((d) => ({ ...d, rateLimits: { ...(d.rateLimits ?? config?.rateLimits!), [key]: value } }));
  }
  function addIp() {
    if (!newIp.trim()) return;
    const next = [...ipList.filter((ip) => ip !== newIp.trim()), newIp.trim()];
    setDraft((d) => ({ ...d, ipWhitelist: next }));
    setNewIp("");
  }
  function removeIp(ip: string) {
    setDraft((d) => ({ ...d, ipWhitelist: (d.ipWhitelist ?? []).filter((i) => i !== ip) }));
  }
  function save() {
    saveMut.mutate(draft);
  }

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Settings className="h-6 w-6 text-primary" />
                System Configuration
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Platform-wide security, email, and operational settings
              </p>
            </div>
            <Button size="sm" onClick={save} disabled={saveMut.isPending} className="gap-1.5">
              {saveMut.isPending ? <Spinner /> : <Save className="h-3.5 w-3.5" />}
              Save Changes
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {/* ── Security Policy ── */}
              {tab === "security" && sec && (
                <div className="space-y-4">
                  <div className="border border-border rounded-xl p-5 bg-card space-y-5">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                      <Lock className="h-4 w-4 text-primary" /> Session &amp; Authentication
                    </h2>

                    {[
                      { label: "Session timeout (days)", key: "sessionTimeoutDays" as const, min: 1, max: 90,
                        desc: "How long a login session remains valid before requiring re-authentication." },
                      { label: "Max failed logins before lockout", key: "maxFailedLogins" as const, min: 1, max: 20,
                        desc: "Consecutive failed login attempts that trigger account lockout." },
                      { label: "Account lockout duration (minutes)", key: "accountLockoutMinutes" as const, min: 1, max: 1440,
                        desc: "How long a locked account remains inaccessible." },
                    ].map(({ label, key, min, max, desc }) => (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm font-medium">{label}</label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={min} max={max}
                              value={sec[key] as number}
                              onChange={(e) => updateSecurity(key, parseInt(e.target.value) || min)}
                              className="w-20 h-7 text-sm text-right font-mono"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    ))}
                  </div>

                  <div className="border border-border rounded-xl p-5 bg-card space-y-4">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" /> Advanced Security
                    </h2>

                    {[
                      { label: "Require MFA for all users", key: "mfaRequired" as const,
                        desc: "Force every user to verify with OTP on every login." },
                      { label: "Enable CAPTCHA on login", key: "captchaEnabled" as const,
                        desc: "Add CAPTCHA challenge after failed login attempts." },
                    ].map(({ label, key, desc }) => (
                      <div key={key} className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium">{label}</p>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                        <button
                          onClick={() => updateSecurity(key, !sec[key])}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                            sec[key] ? "bg-primary" : "bg-muted"
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            sec[key] ? "translate-x-4" : "translate-x-1"
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── SMTP ── */}
              {tab === "smtp" && (
                <div className="space-y-4">
                  {/* Status card */}
                  <div className="border border-border rounded-xl p-5 bg-card">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-semibold flex items-center gap-2">
                        <Mail className="h-4 w-4 text-primary" /> SMTP Configuration
                      </h2>
                      <Badge
                        variant="outline"
                        className={smtp?.enabled
                          ? "border-status-normal/30 text-status-normal bg-status-normal/5"
                          : "border-status-fault/30 text-status-fault bg-status-fault/5"}
                      >
                        {smtp?.enabled
                          ? <><CheckCircle2 className="h-3 w-3 mr-1 inline" />Connected</>
                          : <><XCircle className="h-3 w-3 mr-1 inline" />Disconnected</>}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Host",     value: smtp?.host },
                        { label: "Port",     value: smtp?.port },
                        { label: "From",     value: smtp?.from },
                        { label: "User",     value: showSmtpUser ? smtp?.user : smtp?.user ? "••••••••" : null },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-muted/30 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                          <p className="text-sm font-mono truncate">{value ?? <span className="text-muted-foreground italic">not set</span>}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 mt-4">
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs"
                        onClick={() => setShowSmtpUser((s) => !s)}>
                        {showSmtpUser ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {showSmtpUser ? "Hide" : "Show"} credentials
                      </Button>
                    </div>
                  </div>

                  <div className="border border-border rounded-xl p-5 bg-card space-y-3">
                    <h2 className="text-sm font-semibold">Send Test Email</h2>
                    <p className="text-xs text-muted-foreground">
                      Verifies end-to-end SMTP delivery. Sends a test message to the specified address.
                    </p>
                    <TestEmailSender smtpEnabled={smtp?.enabled ?? false} />
                  </div>

                  <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-400">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    SMTP credentials are set via environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM)
                    and cannot be edited through this UI. Update them in your server's .env file.
                  </div>
                </div>
              )}

              {/* ── Rate Limits ── */}
              {tab === "rate-limits" && rl && (
                <div className="border border-border rounded-xl p-5 bg-card space-y-5">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-primary" /> API Rate Limiting
                  </h2>

                  {[
                    { label: "Max API requests per minute (per IP)",
                      key: "maxRequestsPerMinute" as const, min: 10, max: 10_000,
                      desc: "Requests exceeding this limit receive a 429 response." },
                    { label: "Max login attempts per hour (per email)",
                      key: "maxLoginAttemptsPerHour" as const, min: 1, max: 100,
                      desc: "Prevents brute-force attacks on the authentication endpoint." },
                  ].map(({ label, key, min, max, desc }) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium">{label}</label>
                        <Input
                          type="number"
                          min={min} max={max}
                          value={rl[key]}
                          onChange={(e) => updateRl(key, parseInt(e.target.value) || min)}
                          className="w-24 h-7 text-sm text-right font-mono"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  ))}

                  <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-status-warning/5 border border-status-warning/20 text-xs text-status-warning">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    Rate limit enforcement requires a Redis-backed middleware. These values are stored as
                    platform configuration and will be applied when rate limiting middleware is activated.
                  </div>
                </div>
              )}

              {/* ── IP Whitelist ── */}
              {tab === "ip-whitelist" && (
                <div className="space-y-4">
                  <div className="border border-border rounded-xl p-5 bg-card space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold flex items-center gap-2">
                        <Network className="h-4 w-4 text-primary" /> IP Whitelist
                      </h2>
                      <Badge variant="outline" className="text-[10px]">
                        {ipList.length} {ipList.length === 1 ? "entry" : "entries"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When non-empty, only requests from whitelisted IPs can access the platform.
                      Leave empty to allow all IPs.
                    </p>

                    {/* Add IP */}
                    <div className="flex gap-2">
                      <Input
                        value={newIp}
                        onChange={(e) => setNewIp(e.target.value)}
                        placeholder="192.168.1.0/24 or 203.0.113.1"
                        className="text-sm font-mono"
                        onKeyDown={(e) => e.key === "Enter" && addIp()}
                      />
                      <Button size="sm" onClick={addIp} className="gap-1.5 flex-shrink-0">
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    </div>

                    {/* IP list */}
                    {ipList.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                        <Network className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        No IP restrictions — all addresses are allowed
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {ipList.map((ip) => (
                          <div key={ip} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-status-normal" />
                              <span className="text-sm font-mono">{ip}</span>
                            </div>
                            <Button
                              variant="ghost" size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-status-fault"
                              onClick={() => removeIp(ip)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {ipList.length > 0 && (
                    <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-status-warning/5 border border-status-warning/20 text-xs text-status-warning">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      Ensure your current IP is in the whitelist before saving to avoid locking yourself out.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}

// ── Test Email sub-component ──────────────────────────────────────────────────

function TestEmailSender({ smtpEnabled }: { smtpEnabled: boolean }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function sendTest() {
    if (!email.trim()) return;
    setSending(true);
    try {
      const r = await fetch(`${BASE}api/superadmin/notifications/test-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-SCADA-Request": "1" },
        body: JSON.stringify({ to: email.trim() }),
      });
      const d = await r.json() as { ok?: boolean; message?: string };
      if (d.ok) toast({ title: "Test email sent", description: `Delivered to ${email}` });
      else toast({ title: "Failed", description: d.message ?? "Unknown error", variant: "destructive" });
    } catch {
      toast({ title: "Request failed", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="recipient@example.com"
        disabled={!smtpEnabled}
        className="text-sm"
        onKeyDown={(e) => e.key === "Enter" && void sendTest()}
      />
      <Button
        size="sm"
        onClick={() => void sendTest()}
        disabled={!smtpEnabled || sending || !email.trim()}
        className="gap-1.5 flex-shrink-0"
      >
        {sending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        Send Test
      </Button>
    </div>
  );
}
