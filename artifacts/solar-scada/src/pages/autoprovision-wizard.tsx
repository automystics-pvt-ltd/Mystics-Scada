/**
 * Auto-Provisioning Wizard
 * Guided 6-step flow: plant → templates → devices → test → go-live
 * Designed for first-time org setup in under 30 minutes.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Building2, BookOpen, Cpu, TestTube2, CheckCircle2,
  ArrowRight, ArrowLeft, Plus, Trash2, Loader2, AlertCircle,
  Wifi, Activity, ChevronRight, Info,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Plant { id: string; name: string; location?: string; }
interface Template { id: string; manufacturer: string; model: string; protocol: string; orgId?: string; }
interface Device { name: string; templateId: string; protocol: string; ipAddress?: string; port?: string; brokerUrl?: string; topic?: string; url?: string; plantId: string; }
interface TestResult { deviceName: string; ok: boolean; error?: string; latencyMs: number; }

interface WizardState {
  // Step 1 — plant
  plantChoice: "existing" | "new";
  existingPlantId: string;
  newPlantName: string;
  newPlantLocation: string;
  // Step 2 — templates
  selectedTemplateIds: string[];
  // Step 3 — devices
  devices: Device[];
  // Step 4 — test results
  testResults: TestResult[];
  // Step 5 — created device IDs (for go-live)
  createdDeviceIds: string[];
  resolvedPlantId: string;
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
              : i === current ? "border-primary text-primary"
              : "border-border text-muted-foreground"
            }`}>
              {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-[10px] whitespace-nowrap ${i === current ? "text-foreground font-medium" : "text-muted-foreground"}`}>{label}</span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={`h-0.5 w-8 sm:w-16 mx-1 mb-4 ${i < current ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
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
        <h2 className="text-lg font-semibold">Select or create a plant</h2>
        <p className="text-sm text-muted-foreground mt-1">All devices registered in this wizard will be assigned to this plant.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { value: "existing", label: "Use existing plant", desc: "Pick from your registered plants", icon: Building2 },
          { value: "new",      label: "Create new plant",   desc: "Register a brand-new site",       icon: Plus },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => update({ plantChoice: opt.value as "existing" | "new" })}
            className={`rounded-xl border-2 p-5 text-left transition-all ${state.plantChoice === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}
          >
            <opt.icon className={`h-5 w-5 mb-2 ${state.plantChoice === opt.value ? "text-primary" : "text-muted-foreground"}`} />
            <div className="font-medium text-sm">{opt.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
          </button>
        ))}
      </div>

      {state.plantChoice === "existing" && (
        <div>
          <Label>Plant</Label>
          <Select value={state.existingPlantId} onValueChange={(v) => update({ existingPlantId: v })}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a plant…" /></SelectTrigger>
            <SelectContent>
              {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.location ? ` — ${p.location}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {state.plantChoice === "new" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label>Plant Name <span className="text-red-400">*</span></Label>
            <Input className="mt-1" placeholder="e.g. Thar Solar Farm I"
              value={state.newPlantName} onChange={(e) => update({ newPlantName: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input className="mt-1" placeholder="City, State or GPS coordinates"
              value={state.newPlantLocation} onChange={(e) => update({ newPlantLocation: e.target.value })} />
          </div>
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

  const toggle = (id: string) => {
    const sel = state.selectedTemplateIds;
    update({ selectedTemplateIds: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Choose device templates</h2>
        <p className="text-sm text-muted-foreground mt-1">Select every device model you have on site. You'll configure one or more units of each in the next step.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
        {templates.map((t) => {
          const selected = state.selectedTemplateIds.includes(t.id);
          return (
            <button key={t.id} onClick={() => toggle(t.id)}
              className={`rounded-lg border-2 p-3 text-left transition-all flex items-start gap-3 ${selected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
              <div className={`mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                {selected && <CheckCircle2 className="h-2.5 w-2.5 text-primary-foreground" />}
              </div>
              <div>
                <div className="text-sm font-medium">{t.manufacturer}</div>
                <div className="text-xs text-muted-foreground">{t.model}</div>
                <div className="text-[10px] mt-0.5 text-muted-foreground/70 uppercase tracking-wide">{t.protocol}</div>
              </div>
            </button>
          );
        })}
      </div>
      {state.selectedTemplateIds.length > 0 && (
        <p className="text-xs text-primary">{state.selectedTemplateIds.length} template{state.selectedTemplateIds.length !== 1 ? "s" : ""} selected</p>
      )}
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
    update({
      devices: [...state.devices, {
        name: "", templateId, protocol: tmpl.protocol,
        ipAddress: "", port: "502", brokerUrl: "", topic: "", url: "",
        plantId: state.resolvedPlantId,
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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Register devices</h2>
        <p className="text-sm text-muted-foreground mt-1">Add one row per physical unit. Give each a unique name and fill in its network address.</p>
      </div>

      {/* Add buttons per selected template */}
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

      {state.devices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Cpu className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">Click a button above to add your first device</p>
        </div>
      ) : (
        <div className="space-y-3">
          {state.devices.map((dev, i) => {
            const tmpl = templates.find((t) => t.id === dev.templateId);
            const proto = dev.protocol.toLowerCase();
            return (
              <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {tmpl?.manufacturer} {tmpl?.model} #{i + 1}
                  </span>
                  <button onClick={() => removeDevice(i)} className="text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label>Device Name <span className="text-red-400">*</span></Label>
                    <Input className="mt-1" placeholder={`e.g. ${tmpl?.manufacturer ?? "Device"}-01`}
                      value={dev.name} onChange={(e) => updateDevice(i, { name: e.target.value })} />
                  </div>
                  {(proto === "modbus_tcp" || proto === "modbus" || proto === "http" || proto === "opcua") && (
                    <>
                      <div>
                        <Label>IP Address</Label>
                        <Input className="mt-1" placeholder="192.168.1.10"
                          value={dev.ipAddress ?? ""} onChange={(e) => updateDevice(i, { ipAddress: e.target.value })} />
                      </div>
                      <div>
                        <Label>Port</Label>
                        <Input className="mt-1" type="number" value={dev.port ?? ""}
                          onChange={(e) => updateDevice(i, { port: e.target.value })} />
                      </div>
                    </>
                  )}
                  {proto === "mqtt" && (
                    <>
                      <div className="sm:col-span-2">
                        <Label>Broker URL</Label>
                        <Input className="mt-1" placeholder="mqtt://192.168.1.50:1883"
                          value={dev.brokerUrl ?? ""} onChange={(e) => updateDevice(i, { brokerUrl: e.target.value })} />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Topic</Label>
                        <Input className="mt-1" placeholder="plant/site/device/data"
                          value={dev.topic ?? ""} onChange={(e) => updateDevice(i, { topic: e.target.value })} />
                      </div>
                    </>
                  )}
                  {proto === "websocket" && (
                    <div className="sm:col-span-2">
                      <Label>WebSocket URL</Label>
                      <Input className="mt-1" placeholder="ws://192.168.1.30:8080/data"
                        value={dev.url ?? ""} onChange={(e) => updateDevice(i, { url: e.target.value })} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Step 3 — Test ─────────────────────────────────────────────────────────────

function StepTest({ state, update, onTest, testing }: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  onTest: () => void;
  testing: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Test connections</h2>
        <p className="text-sm text-muted-foreground mt-1">Devices will be registered and each connection tested. You can proceed even if some fail — they will retry automatically.</p>
      </div>

      {state.testResults.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-4">
          <TestTube2 className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
          <p className="text-sm text-muted-foreground">Ready to register {state.devices.length} device{state.devices.length !== 1 ? "s" : ""} and test their connections</p>
          <Button onClick={onTest} disabled={testing} className="gap-2 mx-auto">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
            {testing ? "Registering & Testing…" : "Register & Test All"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {state.testResults.map((r) => (
            <div key={r.deviceName} className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${r.ok ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
              {r.ok
                ? <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                : <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.deviceName}</p>
                {r.error && <p className="text-xs text-red-400 truncate">{r.error}</p>}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{r.latencyMs} ms</span>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={onTest} disabled={testing} className="gap-2 mt-2">
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
          <Zap className="h-8 w-8 text-green-400" />
        </div>
        <h2 className="text-xl font-bold">You're live!</h2>
        <p className="text-sm text-muted-foreground mt-2">
          {ok} of {total} device{total !== 1 ? "s" : ""} connected successfully. Drivers are polling and data is flowing.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-muted/5 p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">What's next</h3>
        {[
          { icon: Activity,  text: "Check the Driver Health dashboard to monitor all drivers in real time" },
          { icon: Wifi,      text: "Open any device's detail page to see live readings and configure thresholds" },
          { icon: BookOpen,  text: "Add more device templates if you have other equipment models on site" },
          { icon: ChevronRight, text: "Run CSV import on the device detail page to backfill historical data" },
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
    selectedTemplateIds: [],
    devices: [],
    testResults: [],
    createdDeviceIds: [],
    resolvedPlantId: "",
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
      case 0: return state.plantChoice === "existing" ? !!state.existingPlantId : !!state.newPlantName.trim();
      case 1: return state.selectedTemplateIds.length > 0;
      case 2: return state.devices.length > 0 && state.devices.every((d) => d.name.trim());
      case 3: return state.testResults.length > 0;
      case 4: return true;
      default: return false;
    }
  }

  async function handleAdvance() {
    if (step === 0) {
      // Create plant if needed
      let plantId = state.existingPlantId;
      if (state.plantChoice === "new") {
        const r = await fetch(`${BASE}api/plants`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: state.newPlantName, location: state.newPlantLocation || undefined }),
        });
        if (!r.ok) { toast({ title: "Failed to create plant", variant: "destructive" }); return; }
        const plant = await r.json() as { id: string };
        plantId = plant.id;
        void queryClient.invalidateQueries({ queryKey: ["plants"] });
      }
      update({ resolvedPlantId: plantId, devices: state.devices.map((d) => ({ ...d, plantId })) });
    }

    if (step === 2) {
      // Ensure all devices have the resolved plant
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
    const createdIds: string[] = [];

    for (const dev of state.devices) {
      // Register device
      try {
        const r = await fetch(`${BASE}api/devices`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: dev.name,
            type: "inverter",
            protocol: dev.protocol,
            templateId: dev.templateId,
            plantId: dev.plantId || state.resolvedPlantId,
            ipAddress: dev.ipAddress || undefined,
            port: dev.port ? Number(dev.port) : undefined,
            brokerUrl: dev.brokerUrl || undefined,
            topic: dev.topic || undefined,
            url: dev.url || undefined,
            pollingIntervalSec: 30,
          }),
        });

        if (!r.ok) {
          results.push({ deviceName: dev.name, ok: false, error: "Failed to register device", latencyMs: 0 });
          continue;
        }

        const created = await r.json() as { id: string };
        createdIds.push(created.id);

        // Test connection (backend exposes GET for connection-test)
        const t0 = Date.now();
        const tr = await fetch(`${BASE}api/devices/${created.id}/connection-test`, {
          method: "GET",
          credentials: "include",
        });
        const testData = tr.ok ? await tr.json() as { ok: boolean; error?: string } : { ok: false, error: "Test endpoint failed" };
        results.push({ deviceName: dev.name, ok: testData.ok, error: testData.error, latencyMs: Date.now() - t0 });
      } catch (err) {
        results.push({ deviceName: dev.name, ok: false, error: err instanceof Error ? err.message : "Unknown error", latencyMs: 0 });
      }
    }

    update({ testResults: results, createdDeviceIds: createdIds });
    void queryClient.invalidateQueries({ queryKey: ["devices"] });
    setTesting(false);
    setStep(4);
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> Auto-Provisioning Wizard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Register a plant, devices, and templates — and go live in under 30 minutes.
          </p>
        </div>

        <StepIndicator current={step} />

        <div className="rounded-xl border border-border bg-card p-6 min-h-[320px]">
          {step === 0 && <StepPlant state={state} update={update} />}
          {step === 1 && <StepTemplates state={state} update={update} />}
          {step === 2 && <StepDevices state={state} update={update} templates={templates} />}
          {step === 3 && <StepTest state={state} update={update} onTest={runTests} testing={testing} />}
          {step === 4 && <StepGoLive state={state} />}
        </div>

        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline" size="sm" className="gap-2"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0 || step === 4}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

          {step === 4 ? (
            <Button onClick={() => navigate("/devices")} className="gap-2">
              View Devices <ArrowRight className="h-4 w-4" />
            </Button>
          ) : step === 3 ? (
            <Button onClick={handleAdvance} disabled={testing || !canAdvance()} className="gap-2">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
              {testing ? "Testing…" : state.testResults.length > 0 ? "Continue" : "Register & Test"}
            </Button>
          ) : (
            <Button onClick={handleAdvance} disabled={!canAdvance()} className="gap-2">
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>

        {step < 4 && (
          <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            Step {step + 1} of {STEP_LABELS.length} — {STEP_LABELS[step]}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
