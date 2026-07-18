/**
 * Auto-Provisioning Wizard
 * 5-step guided flow: Plant → Templates → Devices → Test → Go Live
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Building2, BookOpen, Cpu, TestTube2, CheckCircle2,
  ArrowRight, ArrowLeft, Plus, Trash2, Loader2, AlertCircle,
  Wifi, Activity, Info, MapPin, Calendar, Sun, Gauge,
  ChevronRight, HelpCircle, AlertTriangle,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Plant { id: string; name: string; location?: string; }
interface Template { id: string; manufacturer: string; model: string; protocol: string; }
interface Device {
  name: string; templateId: string; protocol: string;
  ipAddress?: string; port?: string; brokerUrl?: string;
  topic?: string; url?: string; plantId: string;
  bacnetDeviceInstance?: string;
}
interface TestResult { deviceName: string; ok: boolean; error?: string; latencyMs: number; }

interface WizardState {
  plantChoice: "existing" | "new";
  existingPlantId: string;
  newPlantName: string;
  newPlantLocation: string;
  newPlantCapacityMw: string;
  newPlantTrackerType: string;
  newPlantTimezoneOffset: string;
  newPlantCommissionedYear: string;
  selectedTemplateIds: string[];
  devices: Device[];
  testResults: TestResult[];
  createdDeviceIds: string[];
  resolvedPlantId: string;
  createdPlantName: string;
}

const STEP_LABELS = ["Plant", "Templates", "Devices", "Test", "Go Live"];

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold border-2 transition-all ${
              i < current  ? "bg-primary border-primary text-primary-foreground"
              : i === current ? "border-primary text-primary bg-primary/5"
              : "border-border text-muted-foreground"
            }`}>
              {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-[10px] whitespace-nowrap ${i === current ? "text-foreground font-medium" : "text-muted-foreground"}`}>{label}</span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={`h-0.5 w-8 sm:w-14 mx-1 mb-4 transition-colors ${i < current ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Info box ──────────────────────────────────────────────────────────────────

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg bg-blue-500/8 border border-blue-500/20 px-3.5 py-3 text-sm text-blue-600 dark:text-blue-400">
      <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20 px-3.5 py-3 text-sm text-amber-700 dark:text-amber-400">
      <HelpCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

// ── Step 0 — Plant ────────────────────────────────────────────────────────────

function StepPlant({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  const { data: plants = [] } = useQuery<Plant[]>({
    queryKey: ["plants"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/plants`, { credentials: "include" });
      return r.ok ? r.json() as Promise<Plant[]> : [];
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Step 1 — Identify your plant site</h2>
        <p className="text-sm text-muted-foreground mt-1">
          A <strong>plant</strong> is a physical solar installation site. Every device you add in this wizard will be linked to it.
        </p>
      </div>

      <InfoBox>
        Have the following ready before continuing: site name, GPS location or city, installed capacity in MW, and the year the plant was commissioned.
      </InfoBox>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { value: "existing", label: "Use existing plant", desc: "Add devices to a plant already in the system", icon: Building2 },
          { value: "new",      label: "Create new plant",   desc: "Register a brand-new installation site",    icon: Plus },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => update({ plantChoice: opt.value as "existing" | "new" })}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              state.plantChoice === opt.value
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <opt.icon className={`h-5 w-5 mb-2 ${state.plantChoice === opt.value ? "text-primary" : "text-muted-foreground"}`} />
            <div className="font-medium text-sm">{opt.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
          </button>
        ))}
      </div>

      {state.plantChoice === "existing" && (
        <div>
          <Label>Select plant</Label>
          {plants.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">No plants registered yet. Create a new plant first.</p>
          ) : (
            <Select value={state.existingPlantId} onValueChange={(v) => update({ existingPlantId: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a plant…" /></SelectTrigger>
              <SelectContent>
                {plants.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.location ? ` — ${p.location}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {state.plantChoice === "new" && (
        <div className="space-y-4">
          {/* Name + Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Plant Name <span className="text-red-400">*</span></Label>
              <Input
                className="mt-1"
                placeholder="e.g. Rajasthan Solar Park I"
                value={state.newPlantName}
                onChange={(e) => update({ newPlantName: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">Use the official site name so it matches your O&amp;M records.</p>
            </div>
            <div className="sm:col-span-2">
              <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Location</Label>
              <Input
                className="mt-1"
                placeholder="e.g. Jaisalmer, Rajasthan  or  26.9124° N, 70.9122° E"
                value={state.newPlantLocation}
                onChange={(e) => update({ newPlantLocation: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">City/state or GPS coordinates — used for display and solar noon calculation.</p>
            </div>
          </div>

          {/* Capacity + Tracker + Year */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> Capacity (MW) <span className="text-red-400">*</span></Label>
              <Input
                className="mt-1"
                type="number"
                min="0.1"
                step="0.5"
                placeholder="e.g. 50"
                value={state.newPlantCapacityMw}
                onChange={(e) => update({ newPlantCapacityMw: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">Total DC installed capacity.</p>
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><Sun className="h-3.5 w-3.5" /> Tracker type <span className="text-red-400">*</span></Label>
              <Select
                value={state.newPlantTrackerType}
                onValueChange={(v) => update({ newPlantTrackerType: v })}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_tilt">Fixed Tilt</SelectItem>
                  <SelectItem value="single_axis_tracker">Single Axis Tracker</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Affects yield simulation.</p>
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Commissioned year</Label>
              <Input
                className="mt-1"
                type="number"
                min="2000"
                max={new Date().getFullYear()}
                placeholder={String(new Date().getFullYear())}
                value={state.newPlantCommissionedYear}
                onChange={(e) => update({ newPlantCommissionedYear: e.target.value })}
              />
            </div>
          </div>

          {/* Timezone */}
          <div className="sm:w-1/2">
            <Label>Timezone (UTC offset)</Label>
            <Select
              value={state.newPlantTimezoneOffset}
              onValueChange={(v) => update({ newPlantTimezoneOffset: v })}
            >
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select timezone…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5.5">UTC+5:30 — India (IST)</SelectItem>
                <SelectItem value="0">UTC+0 — UK / West Africa</SelectItem>
                <SelectItem value="1">UTC+1 — Central Europe</SelectItem>
                <SelectItem value="2">UTC+2 — East Europe / South Africa</SelectItem>
                <SelectItem value="3">UTC+3 — East Africa / Arabia</SelectItem>
                <SelectItem value="4">UTC+4 — Gulf / UAE</SelectItem>
                <SelectItem value="6">UTC+6 — Bangladesh</SelectItem>
                <SelectItem value="7">UTC+7 — Thailand / Vietnam</SelectItem>
                <SelectItem value="8">UTC+8 — China / Malaysia / Singapore</SelectItem>
                <SelectItem value="-5">UTC-5 — Eastern US / Colombia</SelectItem>
                <SelectItem value="-6">UTC-6 — Central US</SelectItem>
                <SelectItem value="-7">UTC-7 — Mountain US</SelectItem>
                <SelectItem value="-8">UTC-8 — Pacific US</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Used to align solar irradiance and yield calculations to local noon.</p>
          </div>

          <TipBox>
            Inverter count and ratings are estimated automatically from capacity. You can fine-tune these later from the Devices page.
          </TipBox>
        </div>
      )}
    </div>
  );
}

// ── Step 1 — Templates ────────────────────────────────────────────────────────

function StepTemplates({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["device-templates"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/device-templates`, { credentials: "include" });
      return r.ok ? r.json() as Promise<Template[]> : [];
    },
  });

  const byProtocol = templates.reduce<Record<string, Template[]>>((acc, t) => {
    const key = t.protocol.toUpperCase();
    (acc[key] ??= []).push(t);
    return acc;
  }, {});

  const toggle = (id: string) => {
    const sel = state.selectedTemplateIds;
    update({ selectedTemplateIds: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Step 2 — Select device templates</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Templates define the make/model and communication protocol for each type of equipment on your site. Select every model you have installed.
        </p>
      </div>

      <InfoBox>
        <strong>What is a template?</strong> It's a reusable definition for a device model — manufacturer, model name, and the protocol it uses (Modbus, MQTT, OPC-UA, etc.). In the next step you'll create one device entry per physical unit, based on these templates.
      </InfoBox>

      <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
        {Object.entries(byProtocol).map(([proto, group]) => (
          <div key={proto}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">{proto}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {group.map((t) => {
                const selected = state.selectedTemplateIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className={`rounded-lg border-2 p-3 text-left transition-all flex items-start gap-3 ${
                      selected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className={`mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selected ? "border-primary bg-primary" : "border-muted-foreground/40"
                    }`}>
                      {selected && <CheckCircle2 className="h-2.5 w-2.5 text-primary-foreground" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{t.manufacturer}</div>
                      <div className="text-xs text-muted-foreground">{t.model}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {state.selectedTemplateIds.length > 0 && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-3.5 py-2.5 text-sm text-primary font-medium">
          ✓ {state.selectedTemplateIds.length} template{state.selectedTemplateIds.length !== 1 ? "s" : ""} selected — continue to add individual device units
        </div>
      )}

      <TipBox>
        Don't see your device model? You can add custom templates from <strong>Settings → Device Templates</strong> after completing this wizard.
      </TipBox>
    </div>
  );
}

// ── Step 2 — Devices ──────────────────────────────────────────────────────────

function StepDevices({ state, update, templates }: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  templates: Template[];
}) {
  const addDevice = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    const proto = tmpl.protocol.toLowerCase();
    update({
      devices: [...state.devices, {
        name: "", templateId, protocol: tmpl.protocol,
        ipAddress: "", port: proto === "bacnet" ? "47808" : "502",
        brokerUrl: "", topic: "", url: "", plantId: state.resolvedPlantId,
      }],
    });
  };

  const updateDevice = (i: number, patch: Partial<Device>) => {
    const devs = [...state.devices];
    devs[i] = { ...devs[i]!, ...patch };
    update({ devices: devs });
  };

  const removeDevice = (i: number) => {
    update({ devices: state.devices.filter((_, idx) => idx !== i) });
  };

  const PROTO_HELP: Record<string, string> = {
    modbus_tcp: "Provide the PLC/inverter's LAN IP and Modbus TCP port (default 502).",
    modbus:     "Provide the PLC/inverter's LAN IP and Modbus TCP port (default 502).",
    mqtt:       "Point to your MQTT broker URL and the topic this device publishes to.",
    http:       "Provide the device's REST API base URL and port.",
    opcua:      "Provide the OPC-UA server endpoint IP and port (default 4840).",
    bacnet:     "Provide the BACnet/IP device address and unique device instance number.",
    websocket:  "Provide the full WebSocket URL the device streams data on.",
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Step 3 — Register individual devices</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add one entry per <em>physical unit</em>. Give each a unique name and its network address so the SCADA driver can connect to it.
        </p>
      </div>

      <InfoBox>
        Have your site network diagram or IP allocation sheet open. You'll need the IP address (and port) for each inverter, PLC, meter, or weather station.
      </InfoBox>

      {/* Add buttons per template */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Click a button to add a device of that type:</p>
        <div className="flex flex-wrap gap-2">
          {state.selectedTemplateIds.map((tid) => {
            const tmpl = templates.find((t) => t.id === tid);
            if (!tmpl) return null;
            return (
              <Button key={tid} variant="outline" size="sm" className="gap-1.5" onClick={() => addDevice(tid)}>
                <Plus className="h-3.5 w-3.5" /> {tmpl.manufacturer} {tmpl.model}
              </Button>
            );
          })}
        </div>
      </div>

      {state.devices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Cpu className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">No devices added yet. Click a button above to register your first unit.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {state.devices.map((dev, i) => {
            const tmpl = templates.find((t) => t.id === dev.templateId);
            const proto = dev.protocol.toLowerCase();
            const helpText = PROTO_HELP[proto] ?? "";
            return (
              <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {tmpl?.manufacturer} {tmpl?.model}
                    </span>
                    <span className="ml-2 text-[10px] rounded px-1.5 py-0.5 bg-muted text-muted-foreground">#{i + 1}</span>
                  </div>
                  <button onClick={() => removeDevice(i)} className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {helpText && (
                  <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">{helpText}</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label>Device Name <span className="text-red-400">*</span></Label>
                    <Input
                      className="mt-1"
                      placeholder={`e.g. ${tmpl?.manufacturer ?? "Device"}-INV-01`}
                      value={dev.name}
                      onChange={(e) => updateDevice(i, { name: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Use a name that matches your wiring diagram labels.</p>
                  </div>

                  {(proto === "modbus_tcp" || proto === "modbus" || proto === "http" || proto === "opcua" || proto === "bacnet") && (
                    <>
                      <div>
                        <Label>IP Address</Label>
                        <Input
                          className="mt-1"
                          placeholder="192.168.1.10"
                          value={dev.ipAddress ?? ""}
                          onChange={(e) => updateDevice(i, { ipAddress: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Port</Label>
                        <Input
                          className="mt-1"
                          type="number"
                          placeholder={proto === "bacnet" ? "47808" : proto === "opcua" ? "4840" : "502"}
                          value={dev.port ?? ""}
                          onChange={(e) => updateDevice(i, { port: e.target.value })}
                        />
                      </div>
                    </>
                  )}

                  {proto === "bacnet" && (
                    <div>
                      <Label>Device Instance <span className="text-red-400">*</span></Label>
                      <Input
                        className="mt-1"
                        type="number"
                        placeholder="1001"
                        value={dev.bacnetDeviceInstance ?? ""}
                        onChange={(e) => updateDevice(i, { bacnetDeviceInstance: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Unique BACnet object ID for this device.</p>
                    </div>
                  )}

                  {proto === "mqtt" && (
                    <>
                      <div className="sm:col-span-2">
                        <Label>Broker URL</Label>
                        <Input
                          className="mt-1"
                          placeholder="mqtt://192.168.1.50:1883"
                          value={dev.brokerUrl ?? ""}
                          onChange={(e) => updateDevice(i, { brokerUrl: e.target.value })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Topic</Label>
                        <Input
                          className="mt-1"
                          placeholder="plant/site/inverter01/data"
                          value={dev.topic ?? ""}
                          onChange={(e) => updateDevice(i, { topic: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">The MQTT topic this device publishes telemetry to.</p>
                      </div>
                    </>
                  )}

                  {proto === "websocket" && (
                    <div className="sm:col-span-2">
                      <Label>WebSocket URL</Label>
                      <Input
                        className="mt-1"
                        placeholder="ws://192.168.1.30:8080/data"
                        value={dev.url ?? ""}
                        onChange={(e) => updateDevice(i, { url: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {state.devices.length > 0 && (
        <TipBox>
          All {state.devices.length} device{state.devices.length !== 1 ? "s" : ""} will be registered in the next step and their connections tested immediately. Devices that fail the test will retry automatically — you won't lose them.
        </TipBox>
      )}
    </div>
  );
}

// ── Step 3 — Test ─────────────────────────────────────────────────────────────

function StepTest({ state, onTest, testing }: {
  state: WizardState;
  onTest: () => void;
  testing: boolean;
}) {
  const ok    = state.testResults.filter((r) => r.ok).length;
  const fail  = state.testResults.filter((r) => !r.ok).length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Step 4 — Register &amp; test connections</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Each device will be saved to the system and a live connection test will run immediately. Failed devices retry automatically — you can still go live.
        </p>
      </div>

      <InfoBox>
        Make sure the SCADA server can reach your devices over the network. If devices are on a private LAN, ensure the API server is on the same network or has a route to it.
      </InfoBox>

      {state.testResults.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-4">
          <TestTube2 className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
          <div>
            <p className="text-sm font-medium">{state.devices.length} device{state.devices.length !== 1 ? "s" : ""} ready to register</p>
            <p className="text-xs text-muted-foreground mt-1">This will save all devices and run a connection test on each one.</p>
          </div>
          <Button onClick={onTest} disabled={testing} className="gap-2 mx-auto">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
            {testing ? "Registering & Testing…" : "Register & Test All Devices"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary bar */}
          <div className={`flex items-center gap-3 rounded-lg px-4 py-3 border text-sm font-medium ${
            fail === 0
              ? "bg-green-500/5 border-green-500/20 text-green-700 dark:text-green-400"
              : ok  === 0
              ? "bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400"
              : "bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-400"
          }`}>
            {fail === 0
              ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              : ok === 0
              ? <AlertCircle className="h-4 w-4 flex-shrink-0" />
              : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
            {fail === 0
              ? `All ${ok} device${ok !== 1 ? "s" : ""} connected successfully`
              : ok === 0
              ? `All ${fail} device${fail !== 1 ? "s" : ""} failed — check network and IP addresses`
              : `${ok} connected, ${fail} failed — you can still proceed; failed devices will retry`}
          </div>

          {/* Per-device results */}
          <div className="space-y-2">
            {state.testResults.map((r) => (
              <div
                key={r.deviceName}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                  r.ok ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
                }`}
              >
                {r.ok
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  : <AlertCircle  className="h-4 w-4 text-red-400 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.deviceName}</p>
                  {r.error && <p className="text-xs text-red-400 truncate">{r.error}</p>}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                  {r.ok ? `${r.latencyMs} ms` : "–"}
                </span>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={onTest} disabled={testing} className="gap-2">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="h-3.5 w-3.5" />}
            Re-run Tests
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Step 4 — Go Live ──────────────────────────────────────────────────────────

function StepGoLive({ state }: { state: WizardState }) {
  const ok    = state.testResults.filter((r) => r.ok).length;
  const total = state.testResults.length;

  return (
    <div className="space-y-5">
      <div className="text-center py-4">
        <div className="h-16 w-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
          <Zap className="h-8 w-8 text-green-500" />
        </div>
        <h2 className="text-xl font-bold">You're live!</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
          Plant <strong>{state.createdPlantName || "site"}</strong> is registered.{" "}
          {ok} of {total} device{total !== 1 ? "s" : ""} connected. Drivers are polling and data is flowing into the SCADA.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-border bg-muted/5 p-4 space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">What was provisioned</h3>
        <div className="flex items-center gap-2 text-sm">
          <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="font-medium">{state.createdPlantName || "Plant"}</span>
          <span className="text-muted-foreground">— plant site registered</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Cpu className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="font-medium">{total} device{total !== 1 ? "s" : ""}</span>
          <span className="text-muted-foreground">— {ok} online, {total - ok} retrying</span>
        </div>
      </div>

      {/* Next steps */}
      <div className="rounded-lg border border-border bg-muted/5 p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recommended next steps</h3>
        {[
          { icon: Activity,      text: "Go to Driver Health to see real-time polling status for all registered devices" },
          { icon: Wifi,          text: "Open each device's detail page to view live readings and set alert thresholds" },
          { icon: BookOpen,      text: "If you have more device models, add templates in Settings → Device Templates" },
          { icon: ChevronRight,  text: "Run a CSV import on the device detail page to backfill historical readings" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-start gap-3 text-sm">
            <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <span className="text-muted-foreground">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

function defaultState(): WizardState {
  return {
    plantChoice: "existing",
    existingPlantId: "",
    newPlantName: "",
    newPlantLocation: "",
    newPlantCapacityMw: "",
    newPlantTrackerType: "fixed_tilt",
    newPlantTimezoneOffset: "5.5",
    newPlantCommissionedYear: String(new Date().getFullYear()),
    selectedTemplateIds: [],
    devices: [],
    testResults: [],
    createdDeviceIds: [],
    resolvedPlantId: "",
    createdPlantName: "",
  };
}

export default function AutoProvisionWizardPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(defaultState());
  const [testing, setTesting] = useState(false);

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["device-templates"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/device-templates`, { credentials: "include" });
      return r.ok ? r.json() as Promise<Template[]> : [];
    },
  });

  function update(patch: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  function canAdvance(): boolean {
    switch (step) {
      case 0:
        if (state.plantChoice === "existing") return !!state.existingPlantId;
        return (
          !!state.newPlantName.trim() &&
          !!state.newPlantCapacityMw &&
          Number(state.newPlantCapacityMw) > 0 &&
          !!state.newPlantTrackerType
        );
      case 1: return state.selectedTemplateIds.length > 0;
      case 2: return state.devices.length > 0 && state.devices.every((d) => d.name.trim());
      case 3: return state.testResults.length > 0;
      case 4: return true;
      default: return false;
    }
  }

  async function handleAdvance() {
    if (step === 0) {
      let plantId = state.existingPlantId;
      let plantName = "";

      if (state.plantChoice === "new") {
        const body = {
          name:                 state.newPlantName.trim(),
          location:             state.newPlantLocation.trim() || undefined,
          capacityMw:           Number(state.newPlantCapacityMw) || 10,
          trackerType:          state.newPlantTrackerType || "fixed_tilt",
          timezoneOffsetHours:  Number(state.newPlantTimezoneOffset) || 5.5,
          commissionedYear:     Number(state.newPlantCommissionedYear) || new Date().getFullYear(),
        };
        const r = await fetch(`${BASE}api/plants`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({})) as { message?: string };
          toast({ title: "Failed to create plant", description: err.message ?? "Please check your details and try again.", variant: "destructive" });
          return;
        }
        const plant = await r.json() as { id: string; name: string };
        plantId   = plant.id;
        plantName = plant.name;
        void queryClient.invalidateQueries({ queryKey: ["plants"] });
      } else {
        // find name for go-live summary
        const plants = queryClient.getQueryData<Plant[]>(["plants"]) ?? [];
        plantName = plants.find((p) => p.id === state.existingPlantId)?.name ?? "";
      }

      update({
        resolvedPlantId: plantId,
        createdPlantName: plantName,
        devices: state.devices.map((d) => ({ ...d, plantId })),
      });
    }

    if (step === 2) {
      update({ devices: state.devices.map((d) => ({ ...d, plantId: state.resolvedPlantId })) });
    }

    if (step === 3) {
      await runTests();
      return;
    }

    if (step === 4) { navigate("/devices"); return; }

    setStep((s) => s + 1);
  }

  async function runTests() {
    setTesting(true);
    const results: TestResult[] = [];
    const createdIds: string[]  = [];

    for (const dev of state.devices) {
      try {
        const r = await fetch(`${BASE}api/devices`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name:                  dev.name,
            type:                  "inverter",
            protocol:              dev.protocol,
            templateId:            dev.templateId,
            plantId:               dev.plantId || state.resolvedPlantId,
            ipAddress:             dev.ipAddress  || undefined,
            port:                  dev.port       ? Number(dev.port)  : undefined,
            brokerUrl:             dev.brokerUrl  || undefined,
            topic:                 dev.topic      || undefined,
            url:                   dev.url        || undefined,
            bacnetDeviceInstance:  dev.bacnetDeviceInstance ? Number(dev.bacnetDeviceInstance) : undefined,
            pollingIntervalSec:    30,
          }),
        });

        if (!r.ok) {
          const err = await r.json().catch(() => ({})) as { message?: string };
          results.push({ deviceName: dev.name, ok: false, error: err.message ?? "Failed to register", latencyMs: 0 });
          continue;
        }

        const created = await r.json() as { id: string };
        createdIds.push(created.id);

        const t0 = Date.now();
        const tr = await fetch(`${BASE}api/devices/${created.id}/connection-test`, {
          method: "GET",
          credentials: "include",
        });
        const testData = tr.ok
          ? await tr.json() as { ok: boolean; error?: string }
          : { ok: false, error: "Connection test endpoint unreachable" };

        results.push({ deviceName: dev.name, ok: testData.ok, error: testData.error, latencyMs: Date.now() - t0 });
      } catch (err) {
        results.push({ deviceName: dev.name, ok: false, error: err instanceof Error ? err.message : "Network error", latencyMs: 0 });
      }
    }

    update({ testResults: results, createdDeviceIds: createdIds });
    void queryClient.invalidateQueries({ queryKey: ["devices"] });
    setTesting(false);
    setStep(4);
  }

  const nextLabel = () => {
    if (step === 3) return state.testResults.length > 0 ? "Continue" : "Register & Test All";
    if (step === 4) return "View Devices";
    return "Continue";
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> Auto-Provisioning Wizard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Register a plant and its devices in under 30 minutes — guided step by step.
          </p>
        </div>

        <StepIndicator current={step} />

        <div className="rounded-xl border border-border bg-card p-6 min-h-[360px]">
          {step === 0 && <StepPlant     state={state} update={update} />}
          {step === 1 && <StepTemplates state={state} update={update} />}
          {step === 2 && <StepDevices   state={state} update={update} templates={templates} />}
          {step === 3 && <StepTest      state={state} onTest={runTests} testing={testing} />}
          {step === 4 && <StepGoLive    state={state} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline" size="sm" className="gap-2"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0 || step === 4}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

          <Button
            onClick={handleAdvance}
            disabled={!canAdvance() || testing}
            className="gap-2"
          >
            {testing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing…</>
              : step === 4
              ? <><ArrowRight className="h-4 w-4" /> {nextLabel()}</>
              : <>{nextLabel()} <ArrowRight className="h-4 w-4" /></>
            }
          </Button>
        </div>

        {step < 4 && (
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Step {step + 1} of {STEP_LABELS.length} — {STEP_LABELS[step]}
          </p>
        )}
      </div>
    </AppLayout>
  );
}
