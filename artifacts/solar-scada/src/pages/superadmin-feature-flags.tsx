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
  features: "bg-accent-brand/10 text-accent-brand border-accent-brand",
  beta:     "bg-status-warning/10 text-status-warning border-status-warning",
  drivers:  "bg-blue-500/10 text-blue-400 border-blue-500",
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
          <div className="flex items-center justify-between border-b border-border/50 pb-4 relative">
            <div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />
            <div>
              <h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">
                <Flag className="h-6 w-6 text-accent-brand" />
                FEATURE FLAGS
              </h1>
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">TOGGLE PLATFORM FEATURES GLOBALLY OR PER-ORGANISATION</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="font-mono text-[9px] uppercase tracking-widest border-accent-brand/30 text-accent-brand hover:bg-accent-brand/10 rounded-none gap-2">
              <RefreshCw className="h-3 w-3" /> REFRESH
            </Button>
          </div>

          <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/30 p-4">
            <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground leading-relaxed">
              FLAGS ARE STORED IN-MEMORY AND RESET ON API RESTART. USE ORG OVERRIDES FOR PER-TENANT CONTROL WITHOUT CHANGING THE GLOBAL DEFAULT.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 border border-border/50 bg-black/40 animate-pulse" />
              ))}
            </div>
          ) : (
            categories.map(cat => (
              <div key={cat}>
                <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-3">
                  <Badge variant="outline" className={`font-mono text-[8px] uppercase tracking-widest rounded-none px-2 py-0.5 ${CATEGORY_COLOR[cat] ?? ""}`}>{cat}</Badge>
                  <span>{flags.filter(f => f.category === cat).length} FLAG{flags.filter(f => f.category === cat).length !== 1 ? "S" : ""}</span>
                  <div className="flex-1 h-[1px] bg-border/30 ml-2" />
                </h2>
                <div className="space-y-3 mb-8">
                  {flags.filter(f => f.category === cat).map(flag => (
                    <div key={flag.key} className={`border p-4 flex items-center gap-4 transition-colors relative group ${flag.enabled ? "border-accent-brand/30 bg-accent-brand/5 hover:border-accent-brand" : "border-border/50 bg-black/40 hover:border-border"}`}>
                      <div className={`absolute top-0 left-0 w-1 h-full ${flag.enabled ? "bg-accent-brand shadow-[0_0_10px_rgba(0,195,255,0.8)]" : "bg-border/50"}`} />
                      <div className="flex-1 min-w-0 pl-2">
                        <div className="flex items-center gap-3 mb-1.5">
                          <code className="font-mono text-[11px] font-bold uppercase tracking-widest text-foreground">{flag.key}</code>
                          {Object.keys(flag.orgOverrides).length > 0 && (
                            <Badge variant="outline" className="font-mono text-[8px] uppercase tracking-widest rounded-none border-status-warning/50 text-status-warning bg-status-warning/10 px-1.5 py-0.5">
                              {Object.keys(flag.orgOverrides).length} ORG OVERRIDE{Object.keys(flag.orgOverrides).length !== 1 ? "S" : ""}
                            </Badge>
                          )}
                        </div>
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/80 leading-relaxed">{flag.description}</p>
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className={`font-mono text-[9px] font-bold uppercase tracking-widest ${flag.enabled ? "text-status-normal" : "text-muted-foreground"}`}>
                          {flag.enabled ? "ENABLED" : "DISABLED"}
                        </span>
                        <button
                          onClick={() => toggleMut.mutate({ key: flag.key, enabled: !flag.enabled })}
                          disabled={toggleMut.isPending}
                          className="transition-transform hover:scale-110"
                        >
                          {flag.enabled
                            ? <ToggleRight className="h-8 w-8 text-accent-brand drop-shadow-[0_0_8px_rgba(0,195,255,0.6)]" />
                            : <ToggleLeft className="h-8 w-8 text-muted-foreground" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border/50">
            {[
              { label: "TOTAL FLAGS",    value: flags.length,                              color: "text-foreground" },
              { label: "ENABLED",        value: flags.filter(f => f.enabled).length,       color: "text-status-normal" },
              { label: "DISABLED / BETA",value: flags.filter(f => !f.enabled).length,      color: "text-status-warning" },
            ].map(({ label, value, color }) => (
              <div key={label} className="border border-border/50 bg-black/40 p-4 text-center group hover:border-border transition-colors relative">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-border/30 group-hover:bg-border/60 transition-colors" />
                <p className={`font-mono text-3xl font-bold ${color}`}>{value}</p>
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-2">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </SuperAdminLayout>
    </SuperAdminGuard>
  );
}
