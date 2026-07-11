import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Router, Plus, Wifi, WifiOff, Copy, Ban, Check } from "lucide-react";
import { AppLayout } from "@/components/layout";
import { OrgNav } from "@/components/org-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ConnectivityBadge({ status }: { status: Gateway["connectivity"] }) {
  if (status === "online") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-status-normal">
        <Wifi className="h-3 w-3" /> Online
      </span>
    );
  }
  if (status === "revoked") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Ban className="h-3 w-3" /> Revoked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <WifiOff className="h-3 w-3" /> {status === "never_connected" ? "Never connected" : "Offline"}
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
      <div className="max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Router className="h-6 w-6 text-primary" />
              Organisation Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your org profile, users, notifications, and activity log
            </p>
          </div>
          {canManage && (
            <Button size="sm" className="gap-2" onClick={() => setShowGenerate(true)}>
              <Plus className="h-4 w-4" /> Generate Token
            </Button>
          )}
        </div>

        <OrgNav />

        <p className="text-sm text-muted-foreground mb-4">
          Edge Gateway Agents run on a plant-local machine and poll devices on the plant LAN
          that the cloud can't reach directly (Modbus TCP, MQTT, HTTP). Assign devices to a
          gateway from the Devices page's "Assigned Gateway" field.
        </p>

        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Devices</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Last Heartbeat</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading gateways…</td></tr>
              ) : gateways.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No gateways registered yet.</td></tr>
              ) : (
                gateways.map((g) => (
                  <tr key={g.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{g.name}</td>
                    <td className="px-4 py-3"><ConnectivityBadge status={g.connectivity} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{g.deviceCount}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{timeAgo(g.lastSeenAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {canManage && !g.revokedAt && (
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-xs gap-1.5 text-status-fault border-status-fault/30 hover:bg-status-fault/10"
                          onClick={() => revokeMutation.mutate(g.id)}
                          disabled={revokeMutation.isPending}
                        >
                          <Ban className="h-3 w-3" /> Revoke
                        </Button>
                      )}
                      {g.revokedAt && <Badge variant="outline" className="text-[10px]">Revoked</Badge>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showGenerate} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{issuedToken ? "Gateway Token" : "Register New Gateway"}</DialogTitle>
          </DialogHeader>
          {issuedToken ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Copy this token now — it won't be shown again. Paste it into the agent's
                <code className="bg-muted px-1 rounded mx-1">.env.gateway</code> file as{" "}
                <code className="bg-muted px-1 rounded">GATEWAY_TOKEN</code>.
              </p>
              <div className="flex gap-2">
                <Input className="font-mono text-xs" readOnly value={issuedToken} />
                <Button size="sm" variant="outline" onClick={copyToken} className="shrink-0 gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div>
                <Label>Gateway Name</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. Thar Desert Site Gateway"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            {issuedToken ? (
              <Button onClick={closeDialog}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button
                  onClick={() => registerMutation.mutate()}
                  disabled={!name.trim() || registerMutation.isPending}
                >
                  {registerMutation.isPending ? "Generating…" : "Generate Token"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
