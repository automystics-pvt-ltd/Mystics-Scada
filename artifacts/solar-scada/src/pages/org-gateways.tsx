import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Router, Plus, Wifi, WifiOff, Copy, Ban, Check, Activity } from "lucide-react";
import { AppLayout } from "@/components/layout";
import { OrgNav } from "@/components/org-nav";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL;

interface Gateway {
  id: string;
  name: string;
  lastSeenAt: string | null;
  deviceCount: number;
  connectivity: "online" | "offline" | "never_connected" | "revoked";
  createdAt: string;
  revokedAt: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "NEVER";
  const diffMs = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}S AGO`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  return `${Math.floor(hrs / 24)}D AGO`;
}

function ConnectivityBadge({ status }: { status: Gateway["connectivity"] }) {
  if (status === "online") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest bg-status-normal/10 text-status-normal border border-status-normal/30 shadow-[0_0_10px_hsl(var(--status-normal)/0.15)]">
        <Wifi className="h-3 w-3" /> ONLINE
      </span>
    );
  }
  if (status === "revoked") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest bg-muted/50 text-muted-foreground border border-border/50">
        <Ban className="h-3 w-3" /> REVOKED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest bg-status-fault/10 text-status-fault border border-status-fault/30 shadow-[0_0_10px_hsl(var(--status-fault)/0.15)]">
      <WifiOff className="h-3 w-3" /> {status === "never_connected" ? "NO SIGNAL" : "OFFLINE"}
    </span>
  );
}

export default function OrgGatewaysPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("settings.manage") ?? false;

  const [showGenerate, setShowGenerate] = useState(false);
  const [name, setName] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: gateways = [], isLoading } = useQuery<Gateway[]>({
    queryKey: ["org-gateways"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/gateway/list`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load gateways");
      return r.json() as Promise<Gateway[]>;
    },
    refetchInterval: 30_000,
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/gateway/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Failed to register gateway");
      }
      return r.json() as Promise<{ id: string; name: string; token: string }>;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["org-gateways"] });
      setIssuedToken(data.token);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${BASE}api/gateway/${id}/revoke`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to revoke gateway");
      return r.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["org-gateways"] });
      toast({ title: "Gateway revoked", description: "The agent can no longer authenticate with this token." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function closeDialog() {
    setShowGenerate(false);
    setName("");
    setIssuedToken(null);
    setCopied(false);
  }

  function copyToken() {
    if (!issuedToken) return;
    void navigator.clipboard.writeText(issuedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto flex flex-col space-y-6 h-full">
        <div className="flex flex-wrap items-start justify-between gap-4 animate-fade-up">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 text-foreground">
              <Router className="h-7 w-7 text-accent-brand" />
              Organisation Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Manage your org profile, users, notifications, and activity log
            </p>
          </div>
          {canManage && (
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-accent-brand/50 bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]" onClick={() => setShowGenerate(true)}>
              <Plus className="h-4 w-4" /> Generate Token
            </button>
          )}
        </div>

        <OrgNav />

        <div className="bg-card/40 border border-card-border p-5 rounded-xl shadow-sm animate-fade-up" style={{ animationDelay: '50ms' }}>
          <p className="text-xs text-muted-foreground leading-relaxed flex items-start gap-3">
            <Activity className="w-4 h-4 text-accent-brand shrink-0 mt-0.5" />
            <span>Edge Gateway Agents run on a plant-local machine and poll devices on the plant LAN that the cloud can't reach directly (Modbus TCP, MQTT, HTTP). Assign devices to a gateway from the Devices page's "Assigned Gateway" field.</span>
          </p>
        </div>

        <div className="rounded-xl border border-card-border bg-card/40 backdrop-blur-md overflow-hidden shadow-sm animate-fade-up" style={{ animationDelay: '100ms' }}>
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-border/50 bg-muted/10">
                <th className="text-left px-5 py-4 font-bold text-muted-foreground text-[9px] uppercase tracking-widest whitespace-nowrap">Name</th>
                <th className="text-left px-5 py-4 font-bold text-muted-foreground text-[9px] uppercase tracking-widest whitespace-nowrap">Status</th>
                <th className="text-left px-5 py-4 font-bold text-muted-foreground text-[9px] uppercase tracking-widest whitespace-nowrap">Assigned Devices</th>
                <th className="text-left px-5 py-4 font-bold text-muted-foreground text-[9px] uppercase tracking-widest whitespace-nowrap">Last Heartbeat</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/30 bg-card/20"><td colSpan={5} className="px-5 py-6"><div className="h-6 w-full bg-muted/30 rounded animate-shimmer" /></td></tr>
                ))
              ) : gateways.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-16 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-card/20 border-dashed">No gateways registered yet.</td></tr>
              ) : (
                gateways.map((g) => (
                  <tr key={g.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors bg-card/20 group">
                    <td className="px-5 py-4 font-bold text-foreground group-hover:text-accent-brand transition-colors">{g.name}</td>
                    <td className="px-5 py-4"><ConnectivityBadge status={g.connectivity} /></td>
                    <td className="px-5 py-4 font-mono font-bold text-muted-foreground">{g.deviceCount}</td>
                    <td className="px-5 py-4 text-[10px] font-bold font-mono text-muted-foreground tabular-nums tracking-widest">{timeAgo(g.lastSeenAt)}</td>
                    <td className="px-5 py-4 text-right">
                      {canManage && !g.revokedAt && (
                        <button
                          className="flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg border border-status-fault/30 text-status-fault hover:bg-status-fault/10 text-[9px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                          onClick={() => revokeMutation.mutate(g.id)}
                          disabled={revokeMutation.isPending}
                        >
                          <Ban className="h-3 w-3" /> Revoke
                        </button>
                      )}
                      {g.revokedAt && <span className="inline-block px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest border border-border/50 bg-muted/50 text-muted-foreground">Revoked</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showGenerate} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-card-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">{issuedToken ? "Gateway Token" : "Register New Gateway"}</DialogTitle>
          </DialogHeader>
          {issuedToken ? (
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Copy this token now — it won't be shown again. Paste it into the agent's
                <code className="bg-background/80 border border-border/50 px-1.5 py-0.5 rounded mx-1 font-mono text-foreground">.env.gateway</code> file as{" "}
                <code className="bg-background/80 border border-border/50 px-1.5 py-0.5 rounded font-mono text-foreground">GATEWAY_TOKEN</code>.
              </p>
              <div className="flex gap-2">
                <input className="flex-1 h-10 px-4 rounded-lg border border-accent-brand/50 bg-background/80 text-sm font-mono font-bold text-foreground focus:outline-none shadow-inner tracking-widest" readOnly value={issuedToken} />
                <button onClick={copyToken} className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg border border-border/50 bg-card text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all shadow-sm">
                  {copied ? <Check className="h-3.5 w-3.5 text-status-normal" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 py-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Gateway Name</label>
                <input
                  className="w-full h-10 px-4 rounded-lg border border-border/50 bg-background/50 text-sm text-foreground focus:outline-none focus:border-accent-brand/50 focus:ring-1 focus:ring-accent-brand/50 transition-all shadow-sm"
                  placeholder="e.g. Thar Desert Site Gateway"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0 mt-4 border-t border-border/50 pt-4">
            {issuedToken ? (
              <button className="px-5 py-2.5 rounded-lg bg-foreground text-background text-[10px] font-bold uppercase tracking-widest hover:bg-foreground/90 transition-all shadow-sm w-full sm:w-auto" onClick={closeDialog}>Done</button>
            ) : (
              <>
                <button className="px-5 py-2.5 rounded-lg border border-border/50 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all shadow-sm" onClick={closeDialog}>Cancel</button>
                <button
                  className="px-5 py-2.5 rounded-lg bg-accent-brand text-background text-[10px] font-bold uppercase tracking-widest hover:bg-accent-brand/90 disabled:opacity-50 transition-all shadow-[0_0_15px_hsl(var(--accent-brand)/0.3)]"
                  onClick={() => registerMutation.mutate()}
                  disabled={!name.trim() || registerMutation.isPending}
                >
                  {registerMutation.isPending ? "Generating…" : "Generate Token"}
                </button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
