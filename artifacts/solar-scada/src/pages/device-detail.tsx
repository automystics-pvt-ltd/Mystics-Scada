import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import {
  Cpu,
  ArrowLeft,
  Wifi,
  WifiOff,
  AlertCircle,
  RotateCcw,
  RefreshCw,
  Save,
  CheckCircle2,
  Clock,
  Signal,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL;

type DeviceStatus = "online" | "offline" | "error";
type LogLevel = "INFO" | "WARN" | "ERROR";

interface Device {
  id: string;
  plantId: string;
  name: string;
  type: string;
  protocol: string;
  status: DeviceStatus;
  signalStrengthPct: number;
  lastSeenAt: string;
  firmwareVersion: string;
  pendingDeploy: boolean;
  config: {
    ipAddress: string | null;
    port: number | null;
    modbusUnitId: number | null;
    brokerUrl: string | null;
    topic: string | null;
    pollingIntervalSec: number;
  };
  connectivityTimeline: { timestamp: string; status: DeviceStatus }[];
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

const PLANT_NAMES: Record<string, string> = {
  "plant-thar":       "Thar Desert Solar Farm",
  "plant-sundarbans": "Sundarbans Solar Park",
  "plant-deccan":     "Deccan Plateau Array",
  "plant-coastal":    "Coastal Ridge Plant",
};

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function StatusDot({ status }: { status: DeviceStatus }) {
  const map = {
    online:  { Icon: Wifi,        cls: "text-status-normal",   label: "Online"  },
    offline: { Icon: WifiOff,     cls: "text-muted-foreground", label: "Offline" },
    error:   { Icon: AlertCircle, cls: "text-status-fault",    label: "Error"   },
  };
  const { Icon, cls, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${cls}`}>
      <Icon className="h-4 w-4" /> {label}
    </span>
  );
}

function ConnectivityTimeline({ points }: { points: { timestamp: string; status: DeviceStatus }[] }) {
  const colorMap: Record<DeviceStatus, string> = {
    online:  "bg-status-normal",
    offline: "bg-muted-foreground/30",
    error:   "bg-status-fault",
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 h-6">
        {points.map((p, i) => (
          <div
            key={i}
            title={`${new Date(p.timestamp).toLocaleTimeString()} — ${p.status}`}
            className={`flex-1 h-full rounded-sm ${colorMap[p.status]}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>24h ago</span>
        <span>Now</span>
      </div>
      <div className="flex gap-4 text-[10px] text-muted-foreground">
        {[
          { label: "Online",  cls: "bg-status-normal" },
          { label: "Offline", cls: "bg-muted-foreground/30" },
          { label: "Error",   cls: "bg-status-fault" },
        ].map(({ label, cls }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`h-2 w-4 rounded-sm ${cls}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LogLevelBadge({ level }: { level: LogLevel }) {
  const map: Record<LogLevel, string> = {
    INFO:  "bg-muted/50 text-muted-foreground",
    WARN:  "bg-status-warning/15 text-status-warning",
    ERROR: "bg-status-fault/15 text-status-fault",
  };
  return (
    <span className={`inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${map[level]}`}>
      {level}
    </span>
  );
}

type Tab = "config" | "logs" | "history";

export default function DeviceDetailPage() {
  const [, params] = useRoute("/devices/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("device.manage") ?? false;

  const deviceId = params?.id ?? "";
  const [activeTab, setActiveTab] = useState<Tab>("config");
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirmSync, setConfirmSync] = useState(false);

  // Config edit state
  const [editing, setEditing] = useState(false);
  const [configForm, setConfigForm] = useState<{
    ipAddress: string; port: string; modbusUnitId: string;
    brokerUrl: string; topic: string; pollingIntervalSec: string;
  } | null>(null);

  const { data: device, isLoading } = useQuery<Device>({
    queryKey: ["device", deviceId],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Device not found");
      return r.json() as Promise<Device>;
    },
    refetchInterval: 30_000,
  });

  const { data: logs = [] } = useQuery<LogEntry[]>({
    queryKey: ["device-logs", deviceId],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}/logs`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json() as Promise<LogEntry[]>;
    },
    enabled: activeTab === "logs",
    refetchInterval: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await fetch(`${BASE}api/devices/${deviceId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed to update config");
      return r.json() as Promise<Device>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["device", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      setEditing(false);
      toast({ title: "Config updated", description: "Changes saved — pending deployment to device." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const restartMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}/restart`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error("Restart failed");
      return r.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["device", deviceId] });
      toast({ title: "Restart sent", description: "Restart command dispatched to device." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/devices/${deviceId}/sync`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error("Sync failed");
      return r.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["device", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast({ title: "Config synced", description: "Device acknowledged the configuration." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function startEdit(d: Device) {
    setConfigForm({
      ipAddress:          d.config.ipAddress ?? "",
      port:               String(d.config.port ?? ""),
      modbusUnitId:       String(d.config.modbusUnitId ?? ""),
      brokerUrl:          d.config.brokerUrl ?? "",
      topic:              d.config.topic ?? "",
      pollingIntervalSec: String(d.config.pollingIntervalSec),
    });
    setEditing(true);
  }

  function saveEdit() {
    if (!configForm) return;
    const body: Record<string, unknown> = {
      pollingIntervalSec: Number(configForm.pollingIntervalSec) || 30,
    };
    if (configForm.ipAddress)    body.ipAddress    = configForm.ipAddress;
    if (configForm.port)         body.port         = Number(configForm.port);
    if (configForm.modbusUnitId) body.modbusUnitId = Number(configForm.modbusUnitId);
    if (configForm.brokerUrl)    body.brokerUrl    = configForm.brokerUrl;
    if (configForm.topic)        body.topic        = configForm.topic;
    updateMutation.mutate(body);
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading device…</div>
      </AppLayout>
    );
  }

  if (!device) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/devices")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Devices
          </Button>
          <p className="text-muted-foreground">Device not found.</p>
        </div>
      </AppLayout>
    );
  }

  const uptimePct =
    device.connectivityTimeline.length > 0
      ? Math.round(
          (device.connectivityTimeline.filter((p) => p.status === "online").length /
            device.connectivityTimeline.length) *
            100,
        )
      : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Back + header */}
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/devices")} className="gap-2 -ml-2 mb-3">
            <ArrowLeft className="h-4 w-4" /> Back to Devices
          </Button>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Cpu className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold">{device.name}</h1>
                {device.pendingDeploy && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                    Pending deploy
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {typeLabel(device.type)} · {device.protocol.toUpperCase()} ·{" "}
                {PLANT_NAMES[device.plantId] ?? device.plantId}
              </p>
            </div>
            {canManage && (
              <div className="flex gap-2">
                {device.pendingDeploy && (
                  <Button
                    size="sm" variant="outline"
                    className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                    onClick={() => setConfirmSync(true)}
                    disabled={syncMutation.isPending}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {syncMutation.isPending ? "Syncing…" : "Sync Config"}
                  </Button>
                )}
                <Button
                  size="sm" variant="outline"
                  className="gap-2"
                  onClick={() => setConfirmRestart(true)}
                  disabled={restartMutation.isPending}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {restartMutation.isPending ? "Restarting…" : "Restart"}
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="gap-2"
                  onClick={() => void queryClient.invalidateQueries({ queryKey: ["device", deviceId] })}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Left — live status panel */}
          <div className="space-y-4">
            {/* Status card */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live Status</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <StatusDot status={device.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last seen</span>
                  <span className="text-sm tabular-nums flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {timeAgo(device.lastSeenAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Firmware</span>
                  <code className="text-xs">{device.firmwareVersion}</code>
                </div>
              </div>
            </div>

            {/* Signal strength */}
            {device.status !== "offline" && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Signal className="h-3.5 w-3.5" /> Signal Strength
                </h3>
                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums">
                    {device.signalStrengthPct}
                    <span className="text-base font-normal text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      device.signalStrengthPct >= 60
                        ? "bg-status-normal"
                        : device.signalStrengthPct >= 30
                          ? "bg-status-warning"
                          : "bg-status-fault"
                    }`}
                    style={{ width: `${device.signalStrengthPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-center">
                  {device.signalStrengthPct >= 70
                    ? "Good signal"
                    : device.signalStrengthPct >= 40
                      ? "Moderate signal"
                      : "Weak signal"}
                </p>
              </div>
            )}

            {/* 24h uptime */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">24h Uptime</h3>
              <div className="text-2xl font-bold tabular-nums">
                {uptimePct}
                <span className="text-sm font-normal text-muted-foreground">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Based on 15-min polling intervals</p>
            </div>
          </div>

          {/* Right — tabs */}
          <div className="col-span-2 space-y-4">
            {/* Tab bar */}
            <div className="flex border-b border-border">
              {(["config", "logs", "history"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors capitalize border-b-2 -mb-px ${
                    activeTab === tab
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "history" ? "Connectivity" : tab}
                </button>
              ))}
            </div>

            {/* Config tab */}
            {activeTab === "config" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Connection Parameters</h3>
                  {canManage && !editing && (
                    <Button size="sm" variant="outline" onClick={() => startEdit(device)}>
                      Edit Config
                    </Button>
                  )}
                </div>

                {!editing ? (
                  <div className="rounded-lg border border-border overflow-hidden">
                    {[
                      { label: "Protocol",           value: device.protocol.toUpperCase() },
                      { label: "IP Address",          value: device.config.ipAddress },
                      { label: "Port",                value: device.config.port },
                      { label: "Modbus Unit ID",      value: device.config.modbusUnitId },
                      { label: "Broker URL",          value: device.config.brokerUrl },
                      { label: "Topic",               value: device.config.topic },
                      { label: "Polling Interval",    value: device.config.pollingIntervalSec ? `${device.config.pollingIntervalSec}s` : null },
                    ]
                      .filter((r) => r.value != null)
                      .map(({ label, value }) => (
                        <div key={label} className="flex items-center border-b border-border last:border-0 px-4 py-2.5">
                          <span className="w-40 text-xs text-muted-foreground">{label}</span>
                          <code className="text-sm">{String(value)}</code>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border p-4 space-y-4">
                    {configForm && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          {device.protocol === "modbus" && (
                            <>
                              <div>
                                <Label>IP Address</Label>
                                <Input className="mt-1" value={configForm.ipAddress}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, ipAddress: e.target.value }))} />
                              </div>
                              <div>
                                <Label>Port</Label>
                                <Input className="mt-1" type="number" value={configForm.port}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, port: e.target.value }))} />
                              </div>
                              <div>
                                <Label>Modbus Unit ID</Label>
                                <Input className="mt-1" type="number" value={configForm.modbusUnitId}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, modbusUnitId: e.target.value }))} />
                              </div>
                            </>
                          )}
                          {device.protocol === "mqtt" && (
                            <>
                              <div className="col-span-2">
                                <Label>Broker URL</Label>
                                <Input className="mt-1" value={configForm.brokerUrl}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, brokerUrl: e.target.value }))} />
                              </div>
                              <div className="col-span-2">
                                <Label>Topic</Label>
                                <Input className="mt-1" value={configForm.topic}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, topic: e.target.value }))} />
                              </div>
                            </>
                          )}
                          {(device.protocol === "http" || device.protocol === "opcua") && (
                            <>
                              <div>
                                <Label>IP Address</Label>
                                <Input className="mt-1" value={configForm.ipAddress}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, ipAddress: e.target.value }))} />
                              </div>
                              <div>
                                <Label>Port</Label>
                                <Input className="mt-1" type="number" value={configForm.port}
                                  onChange={(e) => setConfigForm((f) => f && ({ ...f, port: e.target.value }))} />
                              </div>
                            </>
                          )}
                          <div>
                            <Label>Polling Interval (seconds)</Label>
                            <Input className="mt-1" type="number" value={configForm.pollingIntervalSec}
                              onChange={(e) => setConfigForm((f) => f && ({ ...f, pollingIntervalSec: e.target.value }))} />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending} className="gap-2">
                            <Save className="h-3.5 w-3.5" />
                            {updateMutation.isPending ? "Saving…" : "Save Changes"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                        </div>
                        <p className="text-xs text-amber-400 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
                          Saving will mark config as pending deploy until synced to the device
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Logs tab */}
            {activeTab === "logs" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Device Log — Last 100 Entries</h3>
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                    onClick={() => void queryClient.invalidateQueries({ queryKey: ["device-logs", deviceId] })}>
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </Button>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="overflow-y-auto max-h-[420px] font-mono text-xs">
                    <table className="w-full">
                      <tbody>
                        {[...logs].reverse().map((entry, i) => (
                          <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                            <td className="px-3 py-1.5 text-muted-foreground tabular-nums whitespace-nowrap">
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <LogLevelBadge level={entry.level} />
                            </td>
                            <td className="px-3 py-1.5 text-foreground/80">{entry.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* History tab */}
            {activeTab === "history" && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">24h Connectivity Timeline</h3>
                <div className="rounded-lg border border-border p-4">
                  <ConnectivityTimeline points={device.connectivityTimeline} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    {
                      label: "Online",
                      count: device.connectivityTimeline.filter((p) => p.status === "online").length,
                      total: device.connectivityTimeline.length,
                      cls: "text-status-normal",
                    },
                    {
                      label: "Offline",
                      count: device.connectivityTimeline.filter((p) => p.status === "offline").length,
                      total: device.connectivityTimeline.length,
                      cls: "text-muted-foreground",
                    },
                    {
                      label: "Error",
                      count: device.connectivityTimeline.filter((p) => p.status === "error").length,
                      total: device.connectivityTimeline.length,
                      cls: "text-status-fault",
                    },
                  ].map(({ label, count, total, cls }) => (
                    <div key={label} className="rounded-lg border border-border p-3 text-center">
                      <div className={`text-xl font-bold tabular-nums ${cls}`}>
                        {total > 0 ? Math.round((count / total) * 100) : 0}%
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                      <div className="text-[10px] text-muted-foreground">{count} of {total} intervals</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Restart confirm dialog */}
      <AlertDialog open={confirmRestart} onOpenChange={setConfirmRestart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a restart command to <strong>{device.name}</strong>. The device will
              briefly go offline during the reboot cycle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { restartMutation.mutate(); setConfirmRestart(false); }}>
              Restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sync confirm dialog */}
      <AlertDialog open={confirmSync} onOpenChange={setConfirmSync}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sync config to device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will push the pending configuration to <strong>{device.name}</strong> and clear
              the "Pending deploy" flag. Confirm only after the device has received the new settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { syncMutation.mutate(); setConfirmSync(false); }}>
              Sync Config
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
