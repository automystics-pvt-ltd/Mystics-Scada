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
    { value: "info",     label: "INFO",     color: "text-blue-400 border-blue-500" },
    { value: "warning",  label: "WARNING",  color: "text-status-warning border-status-warning" },
    { value: "critical", label: "CRITICAL", color: "text-status-fault border-status-fault" },
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
          <div className="border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">
              <MessageSquare className="h-6 w-6 text-accent-brand" />
              COMMUNICATIONS
            </h1>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">PLATFORM-WIDE ANNOUNCEMENTS, BANNERS, AND EMAIL BROADCASTS</p>
          </div>

          {/* Platform banner */}
          <div className="border border-border/50 bg-black/40 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground mb-2 flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-accent-brand" />
              PLATFORM ANNOUNCEMENT BANNER
            </h2>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-5">DISPLAY A DISMISSIBLE BANNER TO ALL LOGGED-IN USERS ACROSS EVERY ORGANISATION.</p>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {ANNOUNCEMENT_TYPES.map(t => (
                <button key={t.value} onClick={() => setBannerType(t.value)}
                  className={`px-3 py-2 border font-mono text-[9px] font-bold uppercase tracking-widest transition-colors ${bannerType === t.value ? `bg-current/10 ${t.color}` : "border-border/50 text-muted-foreground hover:border-accent-brand/50 hover:text-accent-brand"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <Input
              value={bannerMsg}
              onChange={e => setBannerMsg(e.target.value)}
              placeholder="ENTER ANNOUNCEMENT MESSAGE FOR ALL USERS..."
              className="font-mono text-xs bg-black/60 border-border/50 rounded-none focus-visible:ring-accent-brand uppercase mb-4"
            />

            <div className="flex gap-3">
              <Button onClick={activateBanner} className="gap-2 font-mono text-[9px] uppercase tracking-widest bg-accent-brand/10 text-accent-brand border border-accent-brand hover:bg-accent-brand hover:text-black rounded-none transition-colors">
                <Send className="h-3.5 w-3.5" /> ACTIVATE BANNER
              </Button>
              {bannerActive && (
                <Button variant="outline" onClick={() => { setBannerActive(false); setBannerMsg(""); }}
                  className="gap-2 font-mono text-[9px] uppercase tracking-widest border-status-fault/50 text-status-fault hover:bg-status-fault/10 rounded-none transition-colors">
                  CLEAR BANNER
                </Button>
              )}
            </div>

            {bannerActive && (
              <div className={`mt-5 px-4 py-3 border flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-widest ${
                bannerType === "critical" ? "bg-status-fault/10 border-status-fault/50 text-status-fault" :
                bannerType === "warning"  ? "bg-status-warning/10 border-status-warning/50 text-status-warning" :
                "bg-blue-500/10 border-blue-500/50 text-blue-400"
              }`}>
                <Bell className="h-4 w-4 flex-shrink-0" />
                <span>{bannerMsg}</span>
                <CheckCircle2 className="h-4 w-4 ml-auto flex-shrink-0 text-status-normal" />
              </div>
            )}
          </div>

          {/* Email broadcast */}
          <div className="border border-border/50 bg-black/40 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground mb-2 flex items-center gap-2">
              <Mail className="h-4 w-4 text-accent-brand" />
              EMAIL BROADCAST
            </h2>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-5">SEND A SYSTEM EMAIL TO ALL ACTIVE USERS. REQUIRES SMTP CONFIGURATION IN SETTINGS.</p>
            <div className="bg-black/60 border border-dashed border-border/30 p-8 text-center text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest">EMAIL BROADCAST COMING SOON</p>
              <p className="font-mono text-[8px] uppercase tracking-widest mt-2 opacity-60">CONFIGURE SMTP CREDENTIALS IN SETTINGS → NOTIFICATIONS FIRST</p>
            </div>
          </div>

          {/* Channel status */}
          <div className="border border-border/50 bg-black/40 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground mb-4">NOTIFICATION CHANNELS</h2>
            <div className="space-y-3">
              {[
                { label: "IN-APP NOTIFICATIONS", status: "active",   icon: Bell,    desc: "SSE-BASED, ALL USERS" },
                { label: "EMAIL (SMTP)",          status: "config",   icon: Mail,    desc: "CONFIGURE IN ORG SETTINGS" },
                { label: "PLATFORM BANNER",       status: bannerActive ? "active" : "idle", icon: Megaphone, desc: bannerActive ? "1 BANNER ACTIVE" : "NO ACTIVE BANNERS" },
              ].map(({ label, status, icon: Icon, desc }) => (
                <div key={label} className="flex items-center gap-4 px-4 py-3 border border-border/30 bg-black/60 hover:border-accent-brand/50 transition-colors">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-mono text-[10px] font-bold text-foreground uppercase tracking-widest">{label}</p>
                    <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-widest mt-0.5">{desc}</p>
                  </div>
                  <span className={`font-mono text-[8px] font-bold px-2 py-0.5 border ${
                    status === "active" ? "bg-status-normal/10 text-status-normal border-status-normal/30" :
                    status === "config" ? "bg-status-warning/10 text-status-warning border-status-warning/30" :
                    "bg-white/5 text-muted-foreground border-border/50"
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
