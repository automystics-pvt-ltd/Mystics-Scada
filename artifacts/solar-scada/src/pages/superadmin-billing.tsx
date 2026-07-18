/**
 * Billing & Subscriptions — /superadmin/billing
 */
import { useQuery } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { CreditCard, TrendingUp, Building2, Users, Zap, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL as string;

interface BillingOrg {
  id: string; name: string; slug: string; planTier: string;
  status: string; userCount: number; plantCount: number; mrr: number;
  createdAt: string;
}

interface BillingData {
  summary: { starter: number; professional: number; enterprise: number; suspended: number; totalMrr: number };
  orgs: BillingOrg[];
}

const PLAN_STYLE: Record<string, string> = {
  enterprise:   "bg-purple-500/15 text-purple-300 border-purple-500/30",
  professional: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  starter:      "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const MRR_LABEL: Record<string, string> = {
  enterprise: "$999/mo", professional: "$299/mo", starter: "$99/mo",
};

export default function SuperAdminBilling() {
  const { data, isLoading, refetch } = useQuery<BillingData>({
    queryKey: ["superadmin", "billing"],
    queryFn: () => fetch(`${BASE}api/superadmin/billing`, { credentials: "include" }).then(r => r.json()) as Promise<BillingData>,
    refetchInterval: 60_000,
  });

  const activeOrgs = (data?.orgs ?? []).filter(o => o.status === "active");
  const totalMrr   = data?.summary.totalMrr ?? 0;

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="h-6 w-6 text-primary" />Billing & Subscriptions</h1>
              <p className="text-sm text-muted-foreground mt-1">Plan distribution and MRR across all organisations</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          {/* MRR + plan summary */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 border border-primary/20 bg-primary/5 rounded-xl p-5">
              <p className="text-xs text-muted-foreground font-medium mb-1">Monthly Recurring Revenue</p>
              {isLoading ? <div className="h-10 bg-muted animate-pulse rounded w-32" /> : (
                <p className="text-4xl font-bold font-mono text-primary">
                  ${totalMrr.toLocaleString()}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{activeOrgs.length} active subscriptions</p>
            </div>
            {[
              { label: "Enterprise",    value: data?.summary.enterprise   ?? 0, color: "text-purple-400", price: "$999" },
              { label: "Professional",  value: data?.summary.professional ?? 0, color: "text-blue-400",   price: "$299" },
              { label: "Starter",       value: data?.summary.starter      ?? 0, color: "text-zinc-400",   price: "$99" },
              { label: "Suspended",     value: data?.summary.suspended    ?? 0, color: "text-status-fault", price: "$0" },
            ].map(({ label, value, color, price }) => (
              <div key={label} className="border border-border rounded-xl p-4 bg-card">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-3xl font-bold font-mono mt-1 ${color}`}>{isLoading ? "—" : value}</p>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">{price}/mo</p>
              </div>
            ))}
          </div>

          {/* MRR breakdown bar */}
          {data && totalMrr > 0 && (
            <div className="border border-border rounded-xl p-5 bg-card">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" />MRR Breakdown</h2>
              <div className="flex h-6 rounded-full overflow-hidden gap-px">
                {[
                  { plan: "enterprise",   pct: (data.summary.enterprise   * 999 / totalMrr) * 100, color: "bg-purple-500" },
                  { plan: "professional", pct: (data.summary.professional * 299 / totalMrr) * 100, color: "bg-blue-500" },
                  { plan: "starter",      pct: (data.summary.starter      * 99  / totalMrr) * 100, color: "bg-zinc-500" },
                ].filter(s => s.pct > 0).map(s => (
                  <div key={s.plan} className={`${s.color} h-full transition-all`} style={{ width: `${s.pct}%` }}
                    title={`${s.plan}: ${s.pct.toFixed(1)}%`} />
                ))}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                {[
                  { label: "Enterprise",   color: "bg-purple-500", mrr: data.summary.enterprise * 999 },
                  { label: "Professional", color: "bg-blue-500",   mrr: data.summary.professional * 299 },
                  { label: "Starter",      color: "bg-zinc-500",   mrr: data.summary.starter * 99 },
                ].map(s => (
                  <span key={s.label} className="flex items-center gap-1.5">
                    <span className={`inline-block w-2.5 h-2.5 rounded-sm ${s.color}`} />
                    {s.label} — ${s.mrr.toLocaleString()}/mo
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Org table */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/30 px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold">All Organisations</h2>
              <span className="text-xs text-muted-foreground">{data?.orgs.length ?? 0} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Organisation</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Plan</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Users</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Plants</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">MRR</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-t border-border/50">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-16" /></td>
                        ))}
                      </tr>
                    ))
                  ) : (data?.orgs ?? []).map(org => (
                    <tr key={org.id} className="border-t border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium">{org.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{org.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <Badge variant="outline" className={`text-[10px] capitalize ${PLAN_STYLE[org.planTier] ?? ""}`}>{org.planTier}</Badge>
                          <p className="text-[10px] text-muted-foreground">{MRR_LABEL[org.planTier] ?? "—"}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {org.status === "active"
                          ? <span className="flex items-center gap-1 text-xs text-status-normal"><CheckCircle2 className="h-3 w-3" />Active</span>
                          : <span className="flex items-center gap-1 text-xs text-status-fault"><XCircle className="h-3 w-3" />Suspended</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono">{org.userCount}</td>
                      <td className="px-4 py-3 text-right text-sm font-mono">{org.plantCount}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-mono font-semibold ${org.status === "active" ? "text-status-normal" : "text-muted-foreground"}`}>
                          {org.status === "active" ? `$${org.mrr}/mo` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {new Date(org.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
