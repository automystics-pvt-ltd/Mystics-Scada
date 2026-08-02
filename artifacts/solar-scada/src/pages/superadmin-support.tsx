/**
 * Support — /superadmin/support
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { Headphones, Building2, ShieldAlert, Search, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL as string;

interface OrgRow {
  id: string; name: string; slug: string; planTier: string;
  status: string; userCount: number; plantCount: number;
  worstHealth: string; activeAlerts: number;
}

export default function SuperAdminSupport() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: orgs = [] } = useQuery<OrgRow[]>({
    queryKey: ["superadmin", "orgs"],
    queryFn: () => fetch(`${BASE}api/superadmin/orgs`, { credentials: "include" }).then(r => r.json()) as Promise<OrgRow[]>,
  });

  const filtered = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.slug.toLowerCase().includes(search.toLowerCase())
  );

  async function impersonate(org: OrgRow) {
    const res = await fetch(`${BASE}api/superadmin/orgs/${org.id}/impersonate`, {
      method: "POST", credentials: "include", headers: { "X-SCADA-Request": "1" },
    });
    if (res.ok) {
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      await qc.invalidateQueries();
      toast({ title: "Now acting as org", description: org.name });
      window.location.href = `${BASE}`;
    }
  }

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div className="border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">
              <Headphones className="h-6 w-6 text-accent-brand" />
              SUPPORT CONSOLE
            </h1>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">CUSTOMER SUPPORT TOOLS // IMPERSONATE ORGS // INVESTIGATE ISSUES</p>
          </div>

          {/* Impersonation search */}
          <div className="border border-border/50 bg-card/40 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground mb-2 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-status-warning drop-shadow-[0_0_5px_rgba(245,158,11,0.6)]" />
              ORG IMPERSONATION
            </h2>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-4">IMPERSONATE AN ORG TO VIEW THE SCADA APP EXACTLY AS THEIR USERS DO. SESSION IS TRACKED IN AUDIT LOGS.</p>

            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-accent-brand" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="SEARCH BY NAME OR SLUG..." className="pl-9 font-mono text-xs bg-card/60 border-border/50 rounded-none focus-visible:ring-accent-brand uppercase" />
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {filtered.map(org => (
                <div key={org.id} className="flex items-center gap-4 border border-border/50 bg-card/60 px-4 py-3 hover:border-accent-brand/50 transition-colors group relative">
                  <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-accent-brand transition-colors" />
                  <div className="w-8 h-8 bg-accent-brand/10 text-accent-brand border border-accent-brand/30 flex items-center justify-center font-mono text-[10px] font-bold flex-shrink-0 shadow-[inset_0_0_10px_rgba(0,195,255,0.2)] ml-1">
                    {org.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-bold uppercase tracking-widest truncate">{org.name}</p>
                    <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-widest mt-0.5">{org.slug} // {org.userCount} USERS // {org.plantCount} PLANTS</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {org.activeAlerts > 0 && (
                      <Badge variant="outline" className="font-mono text-[8px] uppercase tracking-widest rounded-none border border-status-fault/50 text-status-fault bg-status-fault/10 px-1.5 py-0.5">{org.activeAlerts} ALERTS</Badge>
                    )}
                    <Link href={`/superadmin/orgs/${org.id}`}>
                      <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-[8px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-white/10 gap-1 rounded-none">
                        <ExternalLink className="h-3 w-3" /> DETAIL
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline" className="h-7 px-2 font-mono text-[8px] font-bold uppercase tracking-widest border border-status-warning/50 text-status-warning hover:bg-status-warning hover:text-black gap-1 rounded-none transition-colors"
                      onClick={() => void impersonate(org)}>
                      <ShieldAlert className="h-3 w-3" /> ACT AS
                    </Button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-center py-8 font-mono text-[10px] uppercase tracking-widest text-muted-foreground border border-dashed border-border/30">NO ORGANISATIONS MATCH "{search}"</p>
              )}
            </div>
          </div>

          {/* Support links */}
          <div className="border border-border/50 bg-card/40 p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground mb-4">SUPPORT RESOURCES</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: "AUDIT LOGS",     desc: "FULL ACTIVITY TRAIL",          href: "/superadmin/audit-logs" },
                { label: "SECURITY EVENTS",desc: "LOGIN FAILURES & ANOMALIES",   href: "/superadmin/security" },
                { label: "SYSTEM HEALTH",  desc: "API & DB HEALTH CHECK",        href: "/superadmin/system-health" },
                { label: "FEATURE FLAGS",  desc: "TOGGLE FEATURES PER ORG",      href: "/superadmin/feature-flags" },
              ].map(({ label, desc, href }) => (
                <Link key={href} href={href}>
                  <div className="border border-border/50 bg-card/60 px-5 py-4 hover:border-accent-brand hover:bg-accent-brand/5 transition-colors cursor-pointer group relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-accent-brand transition-colors" />
                    <p className="font-mono text-[10px] font-bold group-hover:text-accent-brand transition-colors uppercase tracking-widest pl-2">{label}</p>
                    <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-widest mt-1 pl-2">{desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
