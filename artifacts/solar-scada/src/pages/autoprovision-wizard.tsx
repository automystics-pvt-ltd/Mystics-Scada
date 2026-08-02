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
    <div className="flex items-center gap-2 mb-8 border-b border-border/50 pb-6 overflow-x-auto">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center h-8 w-8 rounded-none border text-[10px] font-mono transition-all ${
              i < current   ? "bg-brand border-brand text-black shadow-[0_0_10px_rgba(0,255,170,0.3)]"
              : i === current ? "border-brand text-brand bg-brand/10 shadow-[inset_0_0_10px_rgba(0,255,170,0.2)]"
              : "border-border/50 text-muted-foreground bg-black/40"
            }`}>
              {i < current ? <CheckCircle2 className="h-4 w-4" /> : `0${i + 1}`}
            </div>
            <span className={`text-[10px] uppercase tracking-widest font-mono hidden sm:block ${i === current ? "text-brand" : i < current ? "text-foreground/80" : "text-muted-foreground"}`}>
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={`h-[1px] w-6 sm:w-10 mx-3 transition-colors ${i < current ? "bg-brand/50" : "bg-border/50"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Info box ──────────────────────────────────────────────────────────────────

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border border-brand/30 bg-brand/5 p-4 relative">
      <div className="absolute top-0 left-0 w-1 h-full bg-brand/50" />
      <Info className="h-4 w-4 text-brand flex-shrink-0 mt-0.5 drop-shadow-[0_0_5px_rgba(0,255,170,0.5)]" />
      <div className="font-mono text-[10px] uppercase tracking-widest text-brand/90 leading-relaxed leading-[1.6]">{children}</div>
    </div>
  );
}

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border border-status-warning/30 bg-status-warning/5 p-4 relative">
      <div className="absolute top-0 left-0 w-1 h-full bg-status-warning/50" />
      <HelpCircle className="h-4 w-4 text-status-warning flex-shrink-0 mt-0.5 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]" />
      <div className="font-mono text-[10px] uppercase tracking-widest text-status-warning/90 leading-relaxed leading-[1.6]">{children}</div>
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-mono uppercase tracking-widest text-foreground/90 flex items-center gap-3">
          <Building2 className="h-5 w-5 text-brand" />
          TARGET ZONE DESIGNATION
        </h2>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">
          SELECT OR INITIALIZE THE PHYSICAL INSTALLATION ZONE FOR THESE DEVICES.
        </p>
      </div>

      <InfoBox>
        REQUIRED PARAMETERS: ZONE DESIGNATION, GEOLOCATION, DC CAPACITY RATING (MW), COMMISSIONING EPOCH.
      </InfoBox>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { value: "existing", label: "LINK EXISTING ZONE", desc: "ATTACH TO PRE-REGISTERED PLANT", icon: Building2 },
          { value: "new",      label: "INITIALIZE NEW ZONE",   desc: "CREATE NEW PHYSICAL INSTALLATION",    icon: Plus },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => update({ plantChoice: opt.value as "existing" | "new" })}
            className={`border p-5 text-left transition-all relative group overflow-hidden ${
              state.plantChoice === opt.value
                ? "border-brand bg-brand/5 shadow-[0_0_15px_rgba(0,255,170,0.1)]"
                : "border-border/50 bg-black/40 hover:border-brand/50 hover:bg-brand/5"
            }`}
          >
            <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${state.plantChoice === opt.value ? "bg-brand" : "bg-border/50 group-hover:bg-brand/50"}`} />
            <opt.icon className={`h-6 w-6 mb-3 ${state.plantChoice === opt.value ? "text-brand drop-shadow-[0_0_8px_rgba(0,255,170,0.5)]" : "text-muted-foreground"}`} />
            <div className={`font-mono text-sm uppercase tracking-widest mb-2 ${state.plantChoice === opt.value ? "text-foreground" : "text-foreground/80"}`}>{opt.label}</div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider leading-relaxed">{opt.desc}</div>
          </button>
        ))}
      </div>

      {state.plantChoice === "existing" && (
        <div className="border border-border/50 bg-black/40 p-5 relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-border/50" />
          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Target Zone Registry</Label>
          {plants.length === 0 ? (
            <p className="font-mono text-[10px] uppercase tracking-widest text-status-warning mt-2">REGISTRY EMPTY. INITIALIZE A NEW ZONE FIRST.</p>
          ) : (
            <Select value={state.existingPlantId} onValueChange={(v) => update({ existingPlantId: v })}>
              <SelectTrigger className="rounded-none font-mono text-sm border-border/50 bg-black/40 text-brand"><SelectValue placeholder="QUERY REGISTRY..." /></SelectTrigger>
              <SelectContent className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest bg-background">
                {plants.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.location ? ` // ${p.location}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {state.plantChoice === "new" && (
        <div className="space-y-5 border border-border/50 bg-black/40 p-6 relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-border/50" />
          {/* Name + Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Zone Designation <span className="text-status-fault">*</span></Label>
              <Input
                className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-foreground"
                placeholder="RAJASTHAN SOLAR PARK I"
                value={state.newPlantName}
                onChange={(e) => update({ newPlantName: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-brand" /> Geolocation</Label>
              <Input
                className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-brand/80"
                placeholder="26.9124 N, 70.9122 E"
                value={state.newPlantLocation}
                onChange={(e) => update({ newPlantLocation: e.target.value })}
              />
            </div>
          </div>

          {/* Capacity + Tracker + Year */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block flex items-center gap-2"><Gauge className="h-3.5 w-3.5 text-brand" /> Rating (MW) <span className="text-status-fault">*</span></Label>
              <Input
                className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-foreground font-bold"
                type="number"
                min="0.1"
                step="0.5"
                placeholder="50"
                value={state.newPlantCapacityMw}
                onChange={(e) => update({ newPlantCapacityMw: e.target.value })}
              />
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block flex items-center gap-2"><Sun className="h-3.5 w-3.5 text-brand" /> Tracker Mode <span className="text-status-fault">*</span></Label>
              <Select
                value={state.newPlantTrackerType}
                onValueChange={(v) => update({ newPlantTrackerType: v })}
              >
                <SelectTrigger className="rounded-none font-mono text-sm border-border/50 bg-black/40 text-foreground"><SelectValue placeholder="SELECT..." /></SelectTrigger>
                <SelectContent className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest bg-background">
                  <SelectItem value="fixed_tilt">FIXED TILT</SelectItem>
                  <SelectItem value="single_axis_tracker">SINGLE AXIS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-brand" /> Commission Epoch</Label>
              <Input
                className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-foreground"
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
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Timezone Vector (UTC)</Label>
            <Select
              value={state.newPlantTimezoneOffset}
              onValueChange={(v) => update({ newPlantTimezoneOffset: v })}
            >
              <SelectTrigger className="rounded-none font-mono text-sm border-border/50 bg-black/40 text-foreground"><SelectValue placeholder="SELECT..." /></SelectTrigger>
              <SelectContent className="rounded-none border-border/50 font-mono text-[10px] uppercase tracking-widest bg-background">
                <SelectItem value="5.5">UTC+5:30 // IST</SelectItem>
                <SelectItem value="0">UTC+0 // GMT/WET</SelectItem>
                <SelectItem value="1">UTC+1 // CET</SelectItem>
                <SelectItem value="2">UTC+2 // EET/SAST</SelectItem>
                <SelectItem value="3">UTC+3 // EAT/AST</SelectItem>
                <SelectItem value="4">UTC+4 // GST</SelectItem>
                <SelectItem value="6">UTC+6 // BST</SelectItem>
                <SelectItem value="7">UTC+7 // ICT</SelectItem>
                <SelectItem value="8">UTC+8 // CST/SGT</SelectItem>
                <SelectItem value="-5">UTC-5 // EST</SelectItem>
                <SelectItem value="-6">UTC-6 // CST</SelectItem>
                <SelectItem value="-7">UTC-7 // MST</SelectItem>
                <SelectItem value="-8">UTC-8 // PST</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TipBox>
            HARDWARE TOPOLOGY IS AUTOGENERATED FROM RATING. MANUAL OVERRIDES AVAILABLE IN PHASE 3.
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-mono uppercase tracking-widest text-foreground/90 flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-brand" />
          HARDWARE PROFILE SELECTION
        </h2>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">
          LINK ACQUISITION TEMPLATES FOR TARGET HARDWARE MANUFACTURES.
        </p>
      </div>

      <InfoBox>
        TEMPLATES ENCODE REGISTER MAPS AND PROTOCOL DIRECTIVES. MULTIPLE TEMPLATES MAY BE MIXED WITHIN A SINGLE TARGET ZONE TO ACCOMMODATE HETEROGENEOUS HARDWARE DEPLOYMENTS.
      </InfoBox>

      <div className="space-y-5 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        {Object.entries(byProtocol).map(([proto, group]) => (
          <div key={proto} className="border border-border/50 bg-black/40 p-4">
            <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-foreground/50 mb-4 border-b border-border/50 pb-2">{proto}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {group.map((t) => {
                const selected = state.selectedTemplateIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className={`border p-3 text-left transition-all flex items-start gap-4 relative group ${
                      selected ? "border-brand bg-brand/5" : "border-border/50 bg-black/60 hover:border-brand/30 hover:bg-brand/5"
                    }`}
                  >
                    <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${selected ? "bg-brand shadow-[0_0_10px_rgba(0,255,170,0.5)]" : "bg-transparent group-hover:bg-brand/30"}`} />
                    <div className={`mt-0.5 h-4 w-4 border flex items-center justify-center flex-shrink-0 transition-colors ${
                      selected ? "border-brand bg-brand/20 text-brand shadow-[0_0_5px_rgba(0,255,170,0.5)]" : "border-border/50 text-transparent"
                    }`}>
                      <CheckCircle2 className="h-3 w-3" />
                    </div>
                    <div>
                      <div className={`font-mono text-xs uppercase tracking-widest font-bold ${selected ? "text-foreground" : "text-foreground/80"}`}>{t.manufacturer}</div>
                      <div className={`font-mono text-[9px] uppercase tracking-widest mt-1 ${selected ? "text-brand" : "text-muted-foreground"}`}>{t.model}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {state.selectedTemplateIds.length > 0 && (
        <div className="border border-status-normal/30 bg-status-normal/5 px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-status-normal flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4" /> {state.selectedTemplateIds.length} PROFILES LOADED TO BUFFER. PROCEED TO INSTANTIATION.
        </div>
      )}

      <TipBox>
        PROPRIETARY HARDWARE NOT LISTED? CUSTOM TEMPLATES CAN BE AUTHORED VIA CONFIGURATION &rarr; TEMPLATES POST-DEPLOYMENT.
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
    modbus_tcp: "ENTER PLC/INVERTER LAN IP AND MODBUS TCP PORT (DEF: 502).",
    modbus:     "ENTER PLC/INVERTER LAN IP AND MODBUS TCP PORT (DEF: 502).",
    mqtt:       "DEFINE BROKER URL AND TOPIC PUBLICATION VECTOR.",
    http:       "DEFINE TARGET REST API URL AND PORT.",
    opcua:      "DEFINE OPC-UA SERVER ENDPOINT IP AND PORT (DEF: 4840).",
    bacnet:     "DEFINE BACNET/IP ADDRESS AND UNIQUE DEVICE INSTANCE NUMBER.",
    websocket:  "DEFINE FULL WSS STREAM TARGET URL.",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-mono uppercase tracking-widest text-foreground/90 flex items-center gap-3">
          <Cpu className="h-5 w-5 text-brand" />
          HARDWARE INSTANTIATION
        </h2>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">
          PROVISION INDIVIDUAL UNITS. ASSIGN NETWORK VECTORS FOR TELEMETRY DRIVERS.
        </p>
      </div>

      <InfoBox>
        NETWORK ADDRESSABILITY REQUIRES STRICT ACCURACY. VERIFY IP ALLOCATIONS PER WIRING DIAGRAM.
      </InfoBox>

      {/* Add buttons per template */}
      <div className="border border-border/50 bg-black/40 p-4">
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand mb-3">INSTANTIATE FROM PROFILES:</p>
        <div className="flex flex-wrap gap-3">
          {state.selectedTemplateIds.map((tid) => {
            const tmpl = templates.find((t) => t.id === tid);
            if (!tmpl) return null;
            return (
              <Button key={tid} variant="outline" size="sm" className="gap-2 rounded-none border-brand/50 text-brand bg-brand/5 hover:bg-brand/20 font-mono text-[10px] uppercase tracking-widest" onClick={() => addDevice(tid)}>
                <Plus className="h-3.5 w-3.5" /> {tmpl.manufacturer} {tmpl.model}
              </Button>
            );
          })}
        </div>
      </div>

      {state.devices.length === 0 ? (
        <div className="border border-dashed border-border/50 p-12 text-center bg-black/20">
          <Cpu className="h-8 w-8 text-brand/30 mx-auto mb-4 animate-pulse" />
          <p className="text-sm font-mono uppercase tracking-widest text-foreground/80">NO UNITS INSTANTIATED</p>
          <p className="text-[10px] font-mono text-muted-foreground mt-2 uppercase tracking-widest">CLICK A PROFILE ABOVE TO BEGIN INSTANTIATION.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {state.devices.map((dev, i) => {
            const tmpl = templates.find((t) => t.id === dev.templateId);
            const proto = dev.protocol.toLowerCase();
            const helpText = PROTO_HELP[proto] ?? "";
            return (
              <div key={i} className="border border-border/50 bg-black/40 relative group">
                <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-brand transition-colors" />
                <div className="flex items-center justify-between border-b border-border/50 bg-black/60 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs uppercase tracking-widest font-bold text-foreground/90">
                      {tmpl?.manufacturer} {tmpl?.model}
                    </span>
                    <span className="font-mono text-[9px] bg-brand/10 text-brand border border-brand/20 px-2 py-0.5">UNIT_ID {String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <button onClick={() => removeDevice(i)} className="text-muted-foreground hover:text-status-fault hover:bg-status-fault/10 p-2 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {helpText && (
                    <p className="text-[9px] font-mono text-muted-foreground border-l-2 border-brand/30 pl-3 uppercase tracking-widest">{helpText}</p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="sm:col-span-2">
                      <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Logical Identifier <span className="text-status-fault">*</span></Label>
                      <Input
                        className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-foreground uppercase"
                        placeholder={`${tmpl?.manufacturer ?? "DEVICE"}_INV_${String(i + 1).padStart(2, '0')}`}
                        value={dev.name}
                        onChange={(e) => updateDevice(i, { name: e.target.value })}
                      />
                    </div>

                    {(proto === "modbus_tcp" || proto === "modbus" || proto === "http" || proto === "opcua" || proto === "bacnet") && (
                      <>
                        <div>
                          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Network IP</Label>
                          <Input
                            className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-brand"
                            placeholder="192.168.1.10"
                            value={dev.ipAddress ?? ""}
                            onChange={(e) => updateDevice(i, { ipAddress: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">TCP Port</Label>
                          <Input
                            className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50"
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
                        <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Device Instance ID <span className="text-status-fault">*</span></Label>
                        <Input
                          className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-brand"
                          type="number"
                          placeholder="1001"
                          value={dev.bacnetDeviceInstance ?? ""}
                          onChange={(e) => updateDevice(i, { bacnetDeviceInstance: e.target.value })}
                        />
                      </div>
                    )}

                    {proto === "mqtt" && (
                      <>
                        <div className="sm:col-span-2">
                          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Broker Route</Label>
                          <Input
                            className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-foreground"
                            placeholder="mqtt://192.168.1.50:1883"
                            value={dev.brokerUrl ?? ""}
                            onChange={(e) => updateDevice(i, { brokerUrl: e.target.value })}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Publication Topic</Label>
                          <Input
                            className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-brand"
                            placeholder="plant/site/inverter01/data"
                            value={dev.topic ?? ""}
                            onChange={(e) => updateDevice(i, { topic: e.target.value })}
                          />
                        </div>
                      </>
                    )}

                    {proto === "websocket" && (
                      <div className="sm:col-span-2">
                        <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Target WebSocket URL</Label>
                        <Input
                          className="rounded-none font-mono text-sm border-border/50 bg-black/40 focus-visible:border-brand/50 text-brand"
                          placeholder="ws://192.168.1.30:8080/data"
                          value={dev.url ?? ""}
                          onChange={(e) => updateDevice(i, { url: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {state.devices.length > 0 && (
        <TipBox>
          BUFFER CONTAINS {state.devices.length} INSTANTIATION{state.devices.length !== 1 ? "S" : ""}. PROCEED TO PHASE 4 FOR DIAGNOSTIC VERIFICATION BEFORE COMMIT.
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
