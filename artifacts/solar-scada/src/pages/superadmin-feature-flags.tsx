/**
 * Feature Flags — /superadmin/feature-flags
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { Flag, ToggleLeft, ToggleRight, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL as string;
const H = { "Content-Type": "application/json", "X-SCADA-Request": "1" } as const;

interface FeatureFlag {
  key: string; description: string; enabled: boolean;
  category: string; orgOverrides: Record<string, boolean>;
}

const CATEGORY_COLOR: Record<string, string> = {
  features: "bg-primary/10 text-primary border-primary/20",
  beta:     "bg-status-warning/10 text-status-warning border-status-warning/20",
  drivers:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

export default function SuperAdminFeatureFlags() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: flags = [], isLoading, refetch } = useQuery<FeatureFlag[]>({
    queryKey: ["superadmin", "feature-flags"],
    queryFn: () => fetch(`${BASE}api/superadmin/feature-flags`, { credentials: "include" }).then(r => r.json()) as Promise<FeatureFlag[]>,
  });

  const toggleMut = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      fetch(`${BASE}api/superadmin/feature-flags/${key}`, {
        method: "PATCH", credentials: "include", headers: H,
        body: JSON.stringify({ enabled }),
      }).then(r => r.json()),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["superadmin", "feature-flags"] }); },
    onError: () => toast({ title: "Failed to toggle flag", variant: "destructive" }),
  });

  const categories = [...new Set(flags.map(f => f.category))];

  return (
    <SuperAdminGuard>
      <SuperAdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Flag className="h-6 w-6 text-primary" />Feature Flags</h1>
              <p className="text-sm text-muted-foreground mt-1">Toggle platform features globally or per-organisation</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
            <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              Flags are stored in-memory and reset on API restart. Use org overrides for per-tenant control without changing the global default.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : (
            categories.map(cat => (
              <div key={cat}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] capitalize ${CATEGORY_COLOR[cat] ?? ""}`}>{cat}</Badge>
                  <span>{flags.filter(f => f.category === cat).length} flag{flags.filter(f => f.category === cat).length !== 1 ? "s" : ""}</span>
                </h2>
                <div className="space-y-2">
                  {flags.filter(f => f.category === cat).map(flag => (
                    <div key={flag.key} className={`border rounded-xl p-4 flex items-center gap-4 transition-colors ${flag.enabled ? "border-border bg-card" : "border-border/50 bg-muted/20"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <code className="text-sm font-mono font-semibold text-foreground">{flag.key}</code>
                          {Object.keys(flag.orgOverrides).length > 0 && (
                            <Badge variant="outline" className="text-[10px] border-status-warning/30 text-status-warning">
                              {Object.keys(flag.orgOverrides).length} org override{Object.keys(flag.orgOverrides).length !== 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{flag.description}</p>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-xs font-semibold ${flag.enabled ? "text-status-normal" : "text-muted-foreground"}`}>
                          {flag.enabled ? "Enabled" : "Disabled"}
                        </span>
                        <button
                          onClick={() => toggleMut.mutate({ key: flag.key, enabled: !flag.enabled })}
                          disabled={toggleMut.isPending}
                          className="transition-colors"
                        >
                          {flag.enabled
                            ? <ToggleRight className="h-7 w-7 text-status-normal" />
                            : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-4 pt-2">
            {[
              { label: "Total Flags",    value: flags.length,                              color: "text-foreground" },
              { label: "Enabled",        value: flags.filter(f => f.enabled).length,       color: "text-status-normal" },
              { label: "Disabled / Beta",value: flags.filter(f => !f.enabled).length,      color: "text-status-warning" },
            ].map(({ label, value, color }) => (
              <div key={label} className="border border-border rounded-xl p-4 bg-card text-center">
                <p className={`text-3xl font-bold font-mono ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
