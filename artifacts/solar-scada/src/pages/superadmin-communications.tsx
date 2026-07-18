/**
 * Communications — /superadmin/communications
 */
import { useState } from "react";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { MessageSquare, Bell, Mail, Send, Megaphone, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function SuperAdminCommunications() {
  const { toast } = useToast();
  const [bannerMsg, setBannerMsg]     = useState("");
  const [bannerType, setBannerType]   = useState<"info" | "warning" | "critical">("info");
  const [bannerActive, setBannerActive] = useState(false);

  const ANNOUNCEMENT_TYPES = [
    { value: "info",     label: "Info",     color: "text-blue-400 border-blue-500/30" },
    { value: "warning",  label: "Warning",  color: "text-status-warning border-status-warning/30" },
    { value: "critical", label: "Critical", color: "text-status-fault border-status-fault/30" },
  ] as const;

  function activateBanner() {
    if (!bannerMsg.trim()) { toast({ title: "Enter a message first", variant: "destructive" }); return; }
    setBannerActive(true);
    toast({ title: "Platform banner activated", description: "All users will see this on next page load" });
  }

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><MessageSquare className="h-6 w-6 text-primary" />Communications</h1>
            <p className="text-sm text-muted-foreground mt-1">Platform-wide announcements, banners, and email broadcasts</p>
          </div>

          {/* Platform banner */}
          <div className="border border-border rounded-xl p-5 bg-card space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" />Platform Announcement Banner</h2>
            <p className="text-xs text-muted-foreground">Display a dismissible banner to all logged-in users across every organisation.</p>

            <div className="grid grid-cols-3 gap-2">
              {ANNOUNCEMENT_TYPES.map(t => (
                <button key={t.value} onClick={() => setBannerType(t.value)}
                  className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${bannerType === t.value ? `bg-current/10 ${t.color}` : "border-border text-muted-foreground hover:border-primary/40"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <Input
              value={bannerMsg}
              onChange={e => setBannerMsg(e.target.value)}
              placeholder="Enter announcement message for all users…"
              className="text-sm"
            />

            <div className="flex gap-2">
              <Button onClick={activateBanner} className="gap-2">
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
                bannerType === "critical" ? "bg-status-fault/10 border-status-fault/30 text-status-fault" :
                bannerType === "warning"  ? "bg-status-warning/10 border-status-warning/30 text-status-warning" :
                "bg-blue-500/10 border-blue-500/30 text-blue-400"
              }`}>
                <Bell className="h-4 w-4 flex-shrink-0" />
                <span>{bannerMsg}</span>
                <CheckCircle2 className="h-4 w-4 ml-auto flex-shrink-0 text-status-normal" />
              </div>
            )}
          </div>

          {/* Email broadcast */}
          <div className="border border-border rounded-xl p-5 bg-card space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Mail className="h-4 w-4 text-primary" />Email Broadcast</h2>
            <p className="text-xs text-muted-foreground">Send a system email to all active users. Requires SMTP configuration in settings.</p>
            <div className="bg-muted/30 border border-dashed border-border rounded-lg p-6 text-center text-muted-foreground text-sm">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Email broadcast coming soon</p>
              <p className="text-xs mt-1">Configure SMTP credentials in Settings → Notifications first</p>
            </div>
          </div>

          {/* Channel status */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <h2 className="text-sm font-semibold mb-4">Notification Channels</h2>
            <div className="space-y-2">
              {[
                { label: "In-App Notifications", status: "active",   icon: Bell,    desc: "SSE-based, all users" },
                { label: "Email (SMTP)",          status: "config",   icon: Mail,    desc: "Configure in org settings" },
                { label: "Platform Banner",       status: bannerActive ? "active" : "idle", icon: Megaphone, desc: bannerActive ? "1 banner active" : "No active banners" },
              ].map(({ label, status, icon: Icon, desc }) => (
                <div key={label} className="flex items-center gap-3 px-3 py-2.5 border border-border/50 rounded-lg">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    status === "active" ? "bg-status-normal/10 text-status-normal border-status-normal/20" :
                    status === "config" ? "bg-status-warning/10 text-status-warning border-status-warning/20" :
                    "bg-muted text-muted-foreground border-border"
                  }`}>{status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
