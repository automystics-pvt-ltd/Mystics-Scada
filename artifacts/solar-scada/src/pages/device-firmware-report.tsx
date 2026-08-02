import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Cpu, CheckCircle2, AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL;

interface FirmwareReportDevice {
  id: string;
  name: string;
  plantId: string;
  firmwareVersion: string;
  upToDate: boolean;
  status: string;
}

interface FirmwareReportGroup {
  manufacturer: string;
  model: string;
  latestFirmwareVersion: string | null;
  totalDevices: number;
  outdatedDevices: number;
  devices: FirmwareReportDevice[];
}

const PLANT_NAMES: Record<string, string> = {
  "plant-thar":       "Thar Desert Solar Farm",
  "plant-sundarbans": "Sundarbans Solar Park",
  "plant-deccan":     "Deccan Plateau Array",
  "plant-coastal":    "Coastal Ridge Plant",
};

export default function DeviceFirmwareReportPage() {
  const [, navigate] = useLocation();

  const { data: groups = [], isLoading } = useQuery<FirmwareReportGroup[]>({
    queryKey: ["device-firmware-report"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/devices/firmware-report`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load firmware report");
      return r.json() as Promise<FirmwareReportGroup[]>;
    },
  });

  const totalDevices = groups.reduce((sum, g) => sum + g.totalDevices, 0);
  const totalOutdated = groups.reduce((sum, g) => sum + g.outdatedDevices, 0);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/devices")} className="gap-2 -ml-2 mb-4 rounded-none hover:bg-brand/10 hover:text-brand font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> REVERT TO INVENTORY
          </Button>
          <div className="flex items-center gap-3 border-b border-border/50 pb-6">
            <Cpu className="h-6 w-6 text-brand" />
            <div>
              <h1 className="text-2xl font-mono uppercase tracking-widest text-foreground/90">FIRMWARE DEPLOYMENT AUDIT</h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">
                SYSTEM-WIDE SIGNATURE ANALYSIS AND COMPLIANCE TRACKING
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="border border-border/50 bg-card/40 backdrop-blur-md px-6 py-5 relative group overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-brand/50 transition-colors" />
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Total Hardware Targets</div>
            <div className="text-4xl font-mono text-foreground/90">{totalDevices}</div>
          </div>
          <div className="border border-border/50 bg-card/40 backdrop-blur-md px-6 py-5 relative group overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-status-normal/30 group-hover:bg-status-normal transition-colors" />
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Signatures Validated</div>
            <div className="text-4xl font-mono text-status-normal drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">{totalDevices - totalOutdated}</div>
          </div>
          <div className="border border-border/50 bg-card/40 backdrop-blur-md px-6 py-5 relative group overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-status-warning/30 group-hover:bg-status-warning transition-colors" />
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Upgrades Required</div>
            <div className="text-4xl font-mono text-status-warning drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]">{totalOutdated}</div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center font-mono text-[10px] uppercase tracking-widest text-brand py-12 animate-pulse">ANALYZING FLEET SIGNATURES…</div>
        ) : groups.length === 0 ? (
          <div className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground py-12 border border-dashed border-border/50 bg-black/20">NO HARDWARE TARGETS IN INVENTORY</div>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={`${g.manufacturer}::${g.model}`} className="border border-border/50 bg-card/40 backdrop-blur-md relative group">
                <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-brand transition-colors" />
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-black/40">
                  <div>
                    <div className="font-mono text-sm uppercase tracking-widest font-bold text-foreground/90">{g.manufacturer} <span className="text-muted-foreground/50 mx-2">/</span> {g.model}</div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-2 uppercase tracking-widest">
                      {g.latestFirmwareVersion
                        ? <span className="flex items-center gap-2">AUTHORIZED TARGET SIGNATURE: <code className="text-brand bg-brand/5 px-2 py-0.5 border border-brand/20">{g.latestFirmwareVersion}</code></span>
                        : "NO TARGET SIGNATURE ESTABLISHED IN REGISTRY"}
                    </div>
                  </div>
                  {g.outdatedDevices > 0 ? (
                    <Badge variant="outline" className="gap-2 rounded-none border-status-warning/50 text-status-warning bg-status-warning/5 text-[10px] font-mono uppercase tracking-widest px-3 py-1">
                      <AlertTriangle className="h-3 w-3" /> {g.outdatedDevices} / {g.totalDevices} NON-COMPLIANT
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-2 rounded-none border-status-normal/50 text-status-normal bg-status-normal/5 text-[10px] font-mono uppercase tracking-widest px-3 py-1">
                      <CheckCircle2 className="h-3 w-3" /> 100% COMPLIANT
                    </Badge>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono min-w-[700px]">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/10">
                        <th className="text-left px-6 py-3 text-[10px] uppercase tracking-widest text-muted-foreground">Target Ident</th>
                        <th className="text-left px-6 py-3 text-[10px] uppercase tracking-widest text-muted-foreground">Sector</th>
                        <th className="text-left px-6 py-3 text-[10px] uppercase tracking-widest text-muted-foreground">Current Signature</th>
                        <th className="text-left px-6 py-3 text-[10px] uppercase tracking-widest text-muted-foreground">Compliance Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.devices.map((d) => (
                        <tr
                          key={d.id}
                          className="border-b border-border/20 last:border-0 hover:bg-brand/5 transition-colors cursor-pointer"
                          onClick={() => navigate(`/devices/${d.id}`)}
                        >
                          <td className="px-6 py-4 font-bold text-foreground/80 uppercase">{d.name}</td>
                          <td className="px-6 py-4 text-muted-foreground uppercase">
                            {PLANT_NAMES[d.plantId] ?? d.plantId}
                          </td>
                          <td className="px-6 py-4">
                            <code className="text-[10px] bg-black/40 px-2 py-1 border border-border/50 text-foreground/80">{d.firmwareVersion}</code>
                          </td>
                          <td className="px-6 py-4">
                            {d.upToDate ? (
                              <span className="text-[10px] uppercase tracking-widest text-status-normal flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" /> VALIDATED</span>
                            ) : (
                              <span className="text-[10px] uppercase tracking-widest text-status-warning flex items-center gap-2 animate-pulse"><AlertTriangle className="h-3.5 w-3.5" /> UPGRADE REQUIRED</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
