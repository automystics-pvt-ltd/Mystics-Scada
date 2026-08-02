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
  enterprise:   "bg-purple-500/10 text-purple-400 border-purple-500",
  professional: "bg-blue-500/10 text-blue-400 border-blue-500",
  starter:      "bg-zinc-500/10 text-zinc-400 border-zinc-500",
};

const MRR_LABEL: Record<string, string> = {
  enterprise: "$999/MO", professional: "$299/MO", starter: "$99/MO",
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
          <div className="flex items-center justify-between border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <div>
              <h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">
                <CreditCard className="h-6 w-6 text-accent-brand" />
                BILLING & SUBSCRIPTIONS
              </h1>
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">PLAN DISTRIBUTION AND MRR ACROSS ALL ORGANISATIONS</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="font-mono text-[9px] uppercase tracking-widest border-accent-brand/30 text-accent-brand hover:bg-accent-brand/10 rounded-none gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> REFRESH
            </Button>
          </div>

          {/* MRR + plan summary */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 border border-accent-brand/50 bg-black/40 p-5 relative group transition-colors hover:border-accent-brand">
              <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-accent-brand transition-colors" />
              <p className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2 pl-2">MONTHLY RECURRING REVENUE</p>
              {isLoading ? <div className="h-10 bg-white/5 animate-pulse w-32 ml-2" /> : (
                <p className="text-4xl font-bold font-mono text-accent-brand pl-2 drop-shadow-[0_0_8px_rgba(0,195,255,0.4)]">
                  ${totalMrr.toLocaleString()}
                </p>
              )}
              <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-widest mt-2 pl-2">{activeOrgs.length} ACTIVE SUBSCRIPTIONS</p>
            </div>
            {[
              { label: "ENTERPRISE",    value: data?.summary.enterprise   ?? 0, color: "text-purple-400", price: "$999" },
              { label: "PROFESSIONAL",  value: data?.summary.professional ?? 0, color: "text-blue-400",   price: "$299" },
              { label: "STARTER",       value: data?.summary.starter      ?? 0, color: "text-zinc-400",   price: "$99" },
              { label: "SUSPENDED",     value: data?.summary.suspended    ?? 0, color: "text-status-fault", price: "$0" },
            ].map(({ label, value, color, price }) => (
              <div key={label} className="border border-border/50 bg-black/40 p-4 relative group hover:border-border transition-colors">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-border/30 group-hover:bg-border/60 transition-colors" />
                <p className="font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
                <p className={`text-3xl font-bold font-mono mt-2 ${color}`}>{isLoading ? "—" : value}</p>
                <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-widest mt-1">{price}/MO</p>
              </div>
            ))}
          </div>

          {/* MRR breakdown bar */}
          {data && totalMrr > 0 && (
            <div className="border border-border/50 bg-black/40 p-5">
              <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent-brand" />
                MRR BREAKDOWN
              </h2>
              <div className="flex h-2 bg-border/50 w-full">
                {[
                  { plan: "enterprise",   pct: (data.summary.enterprise   * 999 / totalMrr) * 100, color: "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)]" },
                  { plan: "professional", pct: (data.summary.professional * 299 / totalMrr) * 100, color: "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]" },
                  { plan: "starter",      pct: (data.summary.starter      * 99  / totalMrr) * 100, color: "bg-zinc-500 shadow-[0_0_10px_rgba(113,113,122,0.8)]" },
                ].filter(s => s.pct > 0).map(s => (
                  <div key={s.plan} className={`${s.color} h-full transition-all`} style={{ width: `${s.pct}%` }}
                    title={`${s.plan.toUpperCase()}: ${s.pct.toFixed(1)}%`} />
                ))}
              </div>
              <div className="flex gap-6 mt-4 font-mono text-[9px] uppercase tracking-widest font-bold text-muted-foreground">
                {[
                  { label: "ENTERPRISE",   color: "bg-purple-500 shadow-[0_0_5px_rgba(168,85,247,0.8)]", mrr: data.summary.enterprise * 999 },
                  { label: "PROFESSIONAL", color: "bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]",   mrr: data.summary.professional * 299 },
                  { label: "STARTER",      color: "bg-zinc-500 shadow-[0_0_5px_rgba(113,113,122,0.8)]",   mrr: data.summary.starter * 99 },
                ].map(s => (
                  <span key={s.label} className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 ${s.color}`} />
                    {s.label} — ${s.mrr.toLocaleString()}/MO
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Org table */}
          <div className="border border-border/50 bg-black/40">
            <div className="px-4 py-3 border-b border-border/50 bg-black/60 flex items-center justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground">ALL ORGANISATIONS</h2>
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{data?.orgs.length ?? 0} TOTAL</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-black/60 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">ORGANISATION</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">PLAN</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">STATUS</th>
                    <th className="px-4 py-2 text-right font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">USERS</th>
                    <th className="px-4 py-2 text-right font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">PLANTS</th>
                    <th className="px-4 py-2 text-right font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">MRR</th>
                    <th className="px-4 py-2 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-widest">JOINED</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="hover:bg-transparent">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-white/5 animate-pulse w-16" /></td>
                        ))}
                      </tr>
                    ))
                  ) : (data?.orgs ?? []).map(org => (
                    <tr key={org.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono text-[10px] font-bold text-foreground uppercase tracking-widest">{org.name}</p>
                        <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-widest mt-0.5">{org.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <Badge variant="outline" className={`font-mono text-[8px] font-bold uppercase tracking-widest rounded-none border px-1.5 py-0.5 ${PLAN_STYLE[org.planTier] ?? ""}`}>{org.planTier}</Badge>
                          <p className="font-mono text-[8px] text-muted-foreground uppercase tracking-widest">{MRR_LABEL[org.planTier] ?? "—"}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {org.status === "active"
                          ? <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold text-status-normal uppercase tracking-widest"><CheckCircle2 className="h-3 w-3" />ACTIVE</span>
                          : <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold text-status-fault uppercase tracking-widest"><XCircle className="h-3 w-3" />SUSPENDED</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[10px] font-bold text-muted-foreground">{org.userCount}</td>
                      <td className="px-4 py-3 text-right font-mono text-[10px] font-bold text-muted-foreground">{org.plantCount}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${org.status === "active" ? "text-status-normal drop-shadow-[0_0_5px_rgba(34,197,94,0.4)]" : "text-muted-foreground"}`}>
                          {org.status === "active" ? `$${org.mrr}/MO` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[9px] text-muted-foreground uppercase tracking-widest">
                        {new Date(org.createdAt).toISOString().slice(0,10)}
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
