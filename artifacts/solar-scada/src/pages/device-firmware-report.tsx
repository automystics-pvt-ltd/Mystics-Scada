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
      <div className="space-y-6">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/devices")} className="gap-2 -ml-2 mb-3">
            <ArrowLeft className="h-4 w-4" /> Back to Devices
          </Button>
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Fleet Firmware Report</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Firmware version status across your device fleet, grouped by model.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Devices</div>
            <div className="text-2xl font-bold tabular-nums">{totalDevices}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Up to Date</div>
            <div className="text-2xl font-bold tabular-nums text-status-normal">{totalDevices - totalOutdated}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Need Update</div>
            <div className="text-2xl font-bold tabular-nums text-status-warning">{totalOutdated}</div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">Loading firmware report…</div>
        ) : groups.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">No devices registered yet.</div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={`${g.manufacturer}::${g.model}`} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-b border-border">
                  <div>
                    <div className="font-semibold text-sm">{g.manufacturer} {g.model}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {g.latestFirmwareVersion
                        ? <>Latest known-good version: <code className="bg-muted px-1 rounded">{g.latestFirmwareVersion}</code></>
                        : "No target firmware version configured for this model"}
                    </div>
                  </div>
                  {g.outdatedDevices > 0 ? (
                    <Badge variant="outline" className="gap-1.5 border-amber-500/40 text-amber-400">
                      <AlertTriangle className="h-3 w-3" /> {g.outdatedDevices} of {g.totalDevices} outdated
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1.5 border-green-500/40 text-green-400">
                      <CheckCircle2 className="h-3 w-3" /> All up to date
                    </Badge>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">Device</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">Plant</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">Firmware</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.devices.map((d) => (
                      <tr
                        key={d.id}
                        className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer"
                        onClick={() => navigate(`/devices/${d.id}`)}
                      >
                        <td className="px-4 py-2.5 font-medium">{d.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {PLANT_NAMES[d.plantId] ?? d.plantId}
                        </td>
                        <td className="px-4 py-2.5">
                          <code className="text-xs">{d.firmwareVersion}</code>
                        </td>
                        <td className="px-4 py-2.5">
                          {d.upToDate ? (
                            <span className="text-xs text-status-normal flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Up to date</span>
                          ) : (
                            <span className="text-xs text-status-warning flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Update available</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
