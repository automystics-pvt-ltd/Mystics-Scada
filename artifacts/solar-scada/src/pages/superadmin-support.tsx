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
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Headphones className="h-6 w-6 text-primary" />Support</h1>
            <p className="text-sm text-muted-foreground mt-1">Customer support tools — impersonate orgs, view usage, investigate issues</p>
          </div>

          {/* Impersonation search */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-status-warning" />Org Impersonation</h2>
            <p className="text-xs text-muted-foreground mb-3">Impersonate an org to view the SCADA app exactly as their users do. Session is tracked in audit logs.</p>

            <div className="relative mb-4">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or slug…" className="pl-8" />
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filtered.map(org => (
                <div key={org.id} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5 hover:bg-muted/20 transition-colors">
                  <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    {org.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{org.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{org.slug} · {org.userCount} users · {org.plantCount} plants</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {org.activeAlerts > 0 && (
                      <Badge variant="outline" className="text-[10px] border-status-fault/20 text-status-fault">{org.activeAlerts} alerts</Badge>
                    )}
                    <Link href={`/superadmin/orgs/${org.id}`}>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
                        <ExternalLink className="h-3 w-3" /> Detail
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-status-warning/30 text-status-warning hover:bg-status-warning/10"
                      onClick={() => void impersonate(org)}>
                      <ShieldAlert className="h-3 w-3" /> Act As
                    </Button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-center py-6 text-muted-foreground text-sm">No organisations match "{search}"</p>
              )}
            </div>
          </div>

          {/* Support links */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <h2 className="text-sm font-semibold mb-3">Support Resources</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {[
                { label: "Audit Logs",     desc: "Full activity trail",          href: "/superadmin/audit-logs" },
                { label: "Security Events",desc: "Login failures & anomalies",   href: "/superadmin/security" },
                { label: "System Health",  desc: "API & DB health check",        href: "/superadmin/system-health" },
                { label: "Feature Flags",  desc: "Toggle features per org",      href: "/superadmin/feature-flags" },
              ].map(({ label, desc, href }) => (
                <Link key={href} href={href}>
                  <div className="border border-border rounded-lg px-4 py-3 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer group">
                    <p className="font-medium group-hover:text-primary transition-colors">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
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
