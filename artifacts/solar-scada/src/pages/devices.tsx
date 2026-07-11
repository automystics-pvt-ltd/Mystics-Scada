import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Cpu,
  Plus,
  Search,
  Wifi,
  WifiOff,
  AlertCircle,
  Signal,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL;

type DeviceStatus = "online" | "offline" | "error";

interface Template {
  id: string;
  manufacturer: string;
  model: string;
  protocol: string;
  defaultPollIntervalS: number;
}

interface Device {
  id: string;
  orgId: string;
  plantId: string;
  name: string;
  type: string;
  protocol: string;
  templateId: string | null;
  status: DeviceStatus;
  signalStrengthPct: number;
  lastSeenAt: string;
  firmwareVersion: string;
  latestFirmwareVersion: string | null;
  firmwareUpToDate: boolean;
  healthScore: number | null;
  dataSource: "live" | "simulated";
  pendingDeploy: boolean;
  config: {
    ipAddress: string | null;
    port: number | null;
    modbusUnitId: number | null;
    brokerUrl: string | null;
    topic: string | null;
    pollingIntervalSec: number;
  };
}

const DEVICE_TYPES = [
  "RTU", "PLC", "data_logger", "smart_meter", "inverter",
  "weather_station", "tracker_controller", "sensor", "gateway",
];
const PROTOCOLS = ["modbus", "mqtt", "http", "opcua", "websocket", "bacnet"];

const PLANT_NAMES: Record<string, string> = {
  "plant-thar":       "Thar Desert Solar Farm",
  "plant-sundarbans": "Sundarbans Solar Park",
  "plant-deccan":     "Deccan Plateau Array",
  "plant-coastal":    "Coastal Ridge Plant",
};

function StatusBadge({ status }: { status: DeviceStatus }) {
  if (status === "online") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-status-normal">
        <Wifi className="h-3 w-3" /> Online
      </span>
    );
  }
  if (status === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <WifiOff className="h-3 w-3" /> Offline
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-status-fault">
      <AlertCircle className="h-3 w-3" /> Error
    </span>
  );
}

function SignalBar({ pct }: { pct: number }) {
  const color = pct >= 60 ? "bg-status-normal" : pct >= 30 ? "bg-status-warning" : "bg-status-fault";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
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

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DevicesPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("device.manage") ?? false;

  const [search, setSearch] = useState("");
  const [filterPlant, setFilterPlant] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [showRegister, setShowRegister] = useState(false);

  // Register form state
  const [form, setForm] = useState({
    name: "", type: "RTU", protocol: "modbus", plantId: "plant-thar",
    templateId: "",
    ipAddress: "", port: "502", modbusUnitId: "1", pollingIntervalSec: "30",
    brokerUrl: "", topic: "", url: "",
    opcuaSecurityMode: "None", opcuaUsername: "", opcuaPassword: "",
    bacnetDeviceInstance: "",
  });

  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load devices");
      return r.json() as Promise<Device[]>;
    },
    refetchInterval: 30_000,
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["device-templates"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/device-templates`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json() as Promise<Template[]>;
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await fetch(`${BASE}api/devices`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Failed to register device");
      }
      return r.json() as Promise<Device>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      setShowRegister(false);
      setForm({ name: "", type: "RTU", protocol: "modbus", plantId: "plant-thar",
        templateId: "",
        ipAddress: "", port: "502", modbusUnitId: "1", pollingIntervalSec: "30",
        brokerUrl: "", topic: "", url: "",
        opcuaSecurityMode: "None", opcuaUsername: "", opcuaPassword: "",
        bacnetDeviceInstance: "" });
      toast({ title: "Device registered", description: "New device added to the registry." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function onTemplateChange(templateId: string) {
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) {
      setForm((f) => ({ ...f, templateId: "" }));
      return;
    }
    // Normalise protocol for the form dropdown
    const proto = tmpl.protocol.replace("modbus_tcp", "modbus").replace("modbus_rtu", "modbus") as string;
    setForm((f) => ({
      ...f,
      templateId,
      protocol: PROTOCOLS.includes(proto as typeof PROTOCOLS[number]) ? proto : "modbus",
      pollingIntervalSec: String(tmpl.defaultPollIntervalS),
    }));
  }

  function handleRegister() {
    const body: Record<string, unknown> = {
      name: form.name,
      type: form.type,
      protocol: form.protocol,
      plantId: form.plantId,
      pollingIntervalSec: Number(form.pollingIntervalSec) || 30,
    };
    if (form.templateId) body.templateId = form.templateId;
    if (form.protocol === "modbus") {
      if (form.ipAddress) body.ipAddress = form.ipAddress;
      if (form.port) body.port = Number(form.port);
      if (form.modbusUnitId) body.modbusUnitId = Number(form.modbusUnitId);
    } else if (form.protocol === "mqtt") {
      if (form.brokerUrl) body.brokerUrl = form.brokerUrl;
      if (form.topic) body.topic = form.topic;
    } else if (form.protocol === "websocket") {
      if (form.url) body.url = form.url;
    } else if (form.protocol === "bacnet") {
      if (form.ipAddress) body.ipAddress = form.ipAddress;
      if (form.port) body.port = Number(form.port);
      if (form.bacnetDeviceInstance) body.bacnetDeviceInstance = Number(form.bacnetDeviceInstance);
    } else {
      if (form.ipAddress) body.ipAddress = form.ipAddress;
      if (form.port) body.port = Number(form.port);
      if (form.url) body.url = form.url;
      if (form.protocol === "opcua") {
        body.opcuaSecurityMode = form.opcuaSecurityMode;
        if (form.opcuaUsername) body.opcuaUsername = form.opcuaUsername;
        if (form.opcuaPassword) body.opcuaPassword = form.opcuaPassword;
      }
    }
    registerMutation.mutate(body);
  }

  // Filter
  const filtered = devices.filter((d) => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.type.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterPlant !== "all" && d.plantId !== filterPlant) return false;
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    if (filterType !== "all" && d.type !== filterType) return false;
    return true;
  });

  const counts = {
    online: devices.filter((d) => d.status === "online").length,
    offline: devices.filter((d) => d.status === "offline").length,
    error: devices.filter((d) => d.status === "error").length,
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Cpu className="h-6 w-6 text-primary" />
              IoT Device Registry
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Registered field devices — RTUs, PLCs, sensors, and gateways
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setShowRegister(true)} size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Register Device
            </Button>
          )}
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: "Online",  count: counts.online,  color: "text-status-normal",   bg: "bg-status-normal/10" },
            { label: "Offline", count: counts.offline, color: "text-muted-foreground", bg: "bg-muted/30" },
            { label: "Error",   count: counts.error,   color: "text-status-fault",    bg: "bg-status-fault/10" },
          ].map(({ label, count, color, bg }) => (
            <div key={label} className={`rounded-lg border border-border ${bg} px-4 py-3 flex items-center justify-between`}>
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className={`text-2xl font-bold ${color}`}>{count}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search devices…"
              className="pl-8 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterPlant} onValueChange={setFilterPlant}>
            <SelectTrigger className="h-9 min-w-[130px]"><SelectValue placeholder="All plants" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plants</SelectItem>
              {Object.entries(PLANT_NAMES).map(([id, name]) => (
                <SelectItem key={id} value={id}>{name.split(" ").slice(0, 2).join(" ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 min-w-[110px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 min-w-[120px]"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {DEVICE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["devices"] })}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Protocol</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Plant</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Signal</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Firmware</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Last Comm</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    Loading devices…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    {devices.length === 0 ? "No devices registered yet." : "No devices match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => navigate(`/devices/${d.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{d.name}</span>
                        {d.pendingDeploy && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 py-0">
                            Pending deploy
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{typeLabel(d.type)}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{d.protocol}</code>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {PLANT_NAMES[d.plantId]?.split(" ").slice(0, 2).join(" ") ?? d.plantId}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-3">
                      {d.status !== "offline" ? <SignalBar pct={d.signalStrengthPct} /> : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs text-muted-foreground">{d.firmwareVersion}</code>
                        {!d.firmwareUpToDate && (
                          <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400 px-1 py-0">
                            Update
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                      {timeAgo(d.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {devices.length} devices
          </p>
        )}
      </div>

      {/* Register Device Modal */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Register New Device</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1 sm:col-span-2">
                <Label>Device Template <span className="text-muted-foreground font-normal">(optional — auto-fills protocol &amp; register map)</span></Label>
                <Select value={form.templateId || "none"} onValueChange={(v) => onTemplateChange(v === "none" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="No template (custom)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template (custom)</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.manufacturer} — {t.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 sm:col-span-2">
                <Label>Device Name</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. Thar RTU-01"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Protocol</Label>
                <Select value={form.protocol} onValueChange={(v) => setForm((f) => ({ ...f, protocol: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROTOCOLS.map((p) => <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 sm:col-span-2">
                <Label>Plant Assignment</Label>
                <Select value={form.plantId} onValueChange={(v) => setForm((f) => ({ ...f, plantId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLANT_NAMES).map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Protocol-specific fields */}
              {form.protocol === "modbus" && (
                <>
                  <div>
                    <Label>IP Address</Label>
                    <Input className="mt-1" placeholder="10.0.1.10" value={form.ipAddress}
                      onChange={(e) => setForm((f) => ({ ...f, ipAddress: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Port</Label>
                    <Input className="mt-1" type="number" value={form.port}
                      onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Modbus Unit ID</Label>
                    <Input className="mt-1" type="number" value={form.modbusUnitId}
                      onChange={(e) => setForm((f) => ({ ...f, modbusUnitId: e.target.value }))} />
                  </div>
                </>
              )}
              {form.protocol === "mqtt" && (
                <>
                  <div className="col-span-1 sm:col-span-2">
                    <Label>Broker URL</Label>
                    <Input className="mt-1" placeholder="mqtt://10.0.1.50:1883" value={form.brokerUrl}
                      onChange={(e) => setForm((f) => ({ ...f, brokerUrl: e.target.value }))} />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <Label>Topic</Label>
                    <Input className="mt-1" placeholder="plant/thar/wx/0/data" value={form.topic}
                      onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} />
                  </div>
                </>
              )}
              {(form.protocol === "http" || form.protocol === "opcua") && (
                <>
                  <div>
                    <Label>IP Address</Label>
                    <Input className="mt-1" placeholder="10.0.1.20" value={form.ipAddress}
                      onChange={(e) => setForm((f) => ({ ...f, ipAddress: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Port</Label>
                    <Input className="mt-1" type="number" value={form.port}
                      onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <Label>Endpoint URL <span className="text-muted-foreground font-normal">(overrides IP/port if set)</span></Label>
                    <Input className="mt-1" placeholder={form.protocol === "opcua" ? "opc.tcp://device.local:4840" : "https://device.local/api/data"} value={form.url}
                      onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
                  </div>
                </>
              )}
              {form.protocol === "opcua" && (
                <>
                  <div>
                    <Label>Security Mode</Label>
                    <Select value={form.opcuaSecurityMode} onValueChange={(v) => setForm((f) => ({ ...f, opcuaSecurityMode: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="None">None</SelectItem>
                        <SelectItem value="Sign">Sign</SelectItem>
                        <SelectItem value="SignAndEncrypt">Sign &amp; Encrypt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Username <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input className="mt-1" value={form.opcuaUsername}
                      onChange={(e) => setForm((f) => ({ ...f, opcuaUsername: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Password <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input className="mt-1" type="password" value={form.opcuaPassword}
                      onChange={(e) => setForm((f) => ({ ...f, opcuaPassword: e.target.value }))} />
                  </div>
                </>
              )}
              {form.protocol === "bacnet" && (
                <>
                  <div>
                    <Label>IP Address</Label>
                    <Input className="mt-1" placeholder="10.0.1.40" value={form.ipAddress}
                      onChange={(e) => setForm((f) => ({ ...f, ipAddress: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Port <span className="text-muted-foreground font-normal">(default 47808)</span></Label>
                    <Input className="mt-1" type="number" placeholder="47808" value={form.port}
                      onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Device Instance</Label>
                    <Input className="mt-1" type="number" placeholder="1001" value={form.bacnetDeviceInstance}
                      onChange={(e) => setForm((f) => ({ ...f, bacnetDeviceInstance: e.target.value }))} />
                  </div>
                </>
              )}
              {form.protocol === "websocket" && (
                <div className="col-span-1 sm:col-span-2">
                  <Label>WebSocket URL</Label>
                  <Input className="mt-1" placeholder="ws://10.0.1.30:8080/data" value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
                </div>
              )}

              <div>
                <Label>Polling Interval (seconds)</Label>
                <Input className="mt-1" type="number" value={form.pollingIntervalSec}
                  onChange={(e) => setForm((f) => ({ ...f, pollingIntervalSec: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegister(false)}>Cancel</Button>
            <Button
              onClick={handleRegister}
              disabled={!form.name || registerMutation.isPending}
            >
              {registerMutation.isPending ? "Registering…" : "Register Device"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
