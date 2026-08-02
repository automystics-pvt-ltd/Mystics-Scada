import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Zap, TrendingUp, Gauge, Activity, Cpu, GitBranch,
  Cloud, Bell, Clock, Wrench, DollarSign, Leaf,
  Download, Calendar, Plus, Trash2, CheckCircle2,
  ChevronDown, X, RefreshCw,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL;

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReportTypeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
}

interface ReportRow {
  id: string;
  reportType: string | null;
  name: string;
  format: string;
  plantIds: string[];
  dateFrom: string | null;
  dateTo: string | null;
  status: string;
  requestedBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface PlantDef {
  id: string;
  name: string;
  location: string;
  capacityMw: number;
}

interface Schedule {
  id: string;
  reportType: string;
  reportName: string;
  plantIds: string[];
  format: string;
  frequency: string;
  dayOfWeek: number | null;
  timeUtc: string;
  recipients: string[];
  createdAt: string;
}

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap, TrendingUp, Gauge, Activity, Cpu, GitBranch, Cloud, Bell, Clock, Wrench, DollarSign, Leaf,
};

const CATEGORY_COLORS: Record<string, string> = {
  Generation: "text-yellow-400 border-yellow-500/30",
  Performance: "text-blue-400 border-blue-500/30",
  Equipment: "text-primary border-primary/30",
  Environmental: "text-emerald-400 border-emerald-500/30",
  Operations: "text-orange-400 border-orange-500/30",
  Financial: "text-purple-400 border-purple-500/30",
};

// ── Date range presets ────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  {
    label: "Last 7 days",
    getRange: () => {
      const to = new Date();
      const from = new Date(to); from.setDate(from.getDate() - 6);
      return { from: isoDate(from), to: isoDate(to) };
    },
  },
  {
    label: "Last 30 days",
    getRange: () => {
      const to = new Date();
      const from = new Date(to); from.setDate(from.getDate() - 29);
      return { from: isoDate(from), to: isoDate(to) };
    },
  },
  {
    label: "Last 90 days",
    getRange: () => {
      const to = new Date();
      const from = new Date(to); from.setDate(from.getDate() - 89);
      return { from: isoDate(from), to: isoDate(to) };
    },
  },
  {
    label: "This month",
    getRange: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: isoDate(from), to: isoDate(now) };
    },
  },
  {
    label: "This year",
    getRange: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), 0, 1);
      return { from: isoDate(from), to: isoDate(now) };
    },
  },
];

// ── Generate modal ────────────────────────────────────────────────────────────

function GenerateModal({
  type,
  plants,
  onClose,
  onGenerated,
}: {
  type: ReportTypeDef;
  plants: PlantDef[];
  onClose: () => void;
  onGenerated: () => void;
}) {
  const { toast } = useToast();
  const [selectedPlants, setSelectedPlants] = useState<string[]>(plants.map((p) => p.id));
  const [format, setFormat] = useState<"pdf" | "csv">("csv");
  const [dateFrom, setDateFrom] = useState(PRESETS[1]!.getRange().from);
  const [dateTo, setDateTo] = useState(PRESETS[1]!.getRange().to);
  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/org/reports/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType: type.id, plantIds: selectedPlants, dateFrom, dateTo, format }),
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Generate failed");
      }
      return r.json() as Promise<ReportRow>;
    },
    onSuccess: (data) => {
      setGeneratedId(data.id);
      onGenerated();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function download() {
    if (!generatedId) return;
    setDownloading(true);
    try {
      const r = await fetch(`${BASE}api/reports/${generatedId}/download`, { credentials: "include" });
      if (!r.ok) throw new Error("Download failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type.id}-${dateTo}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  const togglePlant = (id: string) =>
    setSelectedPlants((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);

  const Icon = ICONS[type.icon] ?? FileText;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg rounded-none border border-brand/50 bg-card/90 backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,255,170,0.05)] p-0 gap-0">
        <DialogHeader className="p-5 border-b border-border/50">
          <DialogTitle className="flex items-center gap-3 font-mono text-base uppercase tracking-widest text-brand">
            <Icon className="h-5 w-5" />
            {type.name} // EXTRACTION
          </DialogTitle>
        </DialogHeader>

        {!generatedId ? (
          <div className="p-5 space-y-6">
            {/* Plants */}
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 bg-brand inline-block" /> ZONES TARGETED
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                {plants.map((p) => (
                  <label key={p.id} className={`flex items-center gap-3 p-2 border cursor-pointer transition-colors ${selectedPlants.includes(p.id) ? "border-brand bg-brand/10 text-brand" : "border-border/50 bg-card/40 text-muted-foreground hover:border-brand/50 hover:bg-brand/5"}`}>
                    <input
                      type="checkbox"
                      checked={selectedPlants.includes(p.id)}
                      onChange={() => togglePlant(p.id)}
                      className="accent-brand"
                    />
                    <div className="flex flex-col">
                      <span className="font-mono text-[10px] uppercase tracking-widest font-bold">{p.name}</span>
                      <span className="font-mono text-[8px] uppercase tracking-widest opacity-70">{p.capacityMw} MW</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Date range presets */}
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 bg-brand inline-block" /> TIME HORIZON
              </Label>
              <div className="flex flex-wrap gap-2 mb-3">
                {PRESETS.map((p) => {
                  const range = p.getRange();
                  const active = range.from === dateFrom && range.to === dateTo;
                  return (
                    <button
                      key={p.label}
                      onClick={() => { setDateFrom(range.from); setDateTo(range.to); }}
                      className={`font-mono text-[9px] uppercase tracking-widest px-3 py-1.5 border transition-colors ${active ? "bg-brand/20 text-brand border-brand shadow-[0_0_5px_rgba(0,255,170,0.3)]" : "border-border/50 bg-card/40 text-muted-foreground hover:border-brand/50 hover:text-brand"}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">FROM</Label>
                  <Input type="date" className="mt-1 h-10 rounded-none border-border/50 bg-card/40 font-mono text-[10px] uppercase tracking-widest focus-visible:border-brand/50 focus-visible:ring-0 text-brand" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="flex-1">
                  <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">TO</Label>
                  <Input type="date" className="mt-1 h-10 rounded-none border-border/50 bg-card/40 font-mono text-[10px] uppercase tracking-widest focus-visible:border-brand/50 focus-visible:ring-0 text-brand" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Format */}
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 bg-brand inline-block" /> ENCODING FORMAT
              </Label>
              <div className="flex gap-2">
                {(["csv", "pdf"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`font-mono text-[10px] uppercase tracking-widest px-5 py-2 border transition-colors ${format === f ? "bg-brand/20 text-brand border-brand shadow-[0_0_5px_rgba(0,255,170,0.3)]" : "border-border/50 bg-card/40 text-muted-foreground hover:border-brand/50 hover:text-brand"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-10 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 border border-status-normal bg-status-normal/10 flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(34,197,94,0.3)]">
              <CheckCircle2 className="h-8 w-8 text-status-normal animate-pulse" />
            </div>
            <p className="font-mono text-sm uppercase tracking-widest font-bold text-status-normal">EXTRACTION COMPLETE</p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground max-w-xs">{type.name} PAYLOAD IS READY FOR DOWNLOAD.</p>
          </div>
        )}

        <DialogFooter className="p-5 border-t border-border/50 bg-card/40 sm:justify-between flex-row">
          <button className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-brand transition-colors flex items-center gap-2" onClick={onClose}>
            <X className="h-3.5 w-3.5" /> {generatedId ? "CLOSE" : "ABORT"}
          </button>
          {!generatedId ? (
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || selectedPlants.length === 0}
              className="font-mono text-[10px] uppercase tracking-widest font-bold border border-brand bg-brand/10 text-brand hover:bg-brand/20 px-4 py-2 flex items-center gap-2 transition-colors shadow-[0_0_10px_rgba(0,255,170,0.2)] disabled:opacity-50"
            >
              {mutation.isPending ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> EXTRACTING...</>
              ) : (
                <>EXECUTE EXTRACTION</>
              )}
            </button>
          ) : (
            <button onClick={() => void download()} disabled={downloading} className="font-mono text-[10px] uppercase tracking-widest font-bold border border-status-normal bg-status-normal/10 text-status-normal hover:bg-status-normal/20 px-4 py-2 flex items-center gap-2 transition-colors shadow-[0_0_10px_rgba(34,197,94,0.2)] disabled:opacity-50">
              <Download className="h-3.5 w-3.5" />
              {downloading ? "FETCHING..." : `DOWNLOAD ${format.toUpperCase()}`}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Schedule modal ────────────────────────────────────────────────────────────

function ScheduleModal({
  type,
  plants,
  onClose,
}: {
  type: ReportTypeDef;
  plants: PlantDef[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlants, setSelectedPlants] = useState<string[]>(plants.map((p) => p.id));
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [timeUtc, setTimeUtc] = useState("08:00");
  const [recipients, setRecipients] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}api/org/report-schedules`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: type.id,
          plantIds: selectedPlants,
          format,
          frequency,
          dayOfWeek: frequency === "weekly" ? parseInt(dayOfWeek) : undefined,
          timeUtc,
          recipients: recipients.split(",").map((e) => e.trim()).filter(Boolean),
        }),
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Schedule failed");
      }
      return r.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
      toast({ title: "Schedule created", description: `${frequency} ${type.name} scheduled.` });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const togglePlant = (id: string) =>
    setSelectedPlants((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  const Icon = ICONS[type.icon] ?? FileText;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-none border border-brand/50 bg-card/90 backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,255,170,0.05)] p-0 gap-0">
        <DialogHeader className="p-5 border-b border-border/50">
          <DialogTitle className="flex items-center gap-3 font-mono text-base uppercase tracking-widest text-brand">
            <Calendar className="h-5 w-5" />
            SCHEDULE PIPELINE // {type.name}
          </DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-6">
          <div className="flex items-start gap-3 p-3 border border-border/50 bg-card/40 relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
            <Icon className="h-4 w-4 text-brand mt-0.5 flex-shrink-0" />
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground leading-relaxed">{type.description}</p>
          </div>

          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 bg-brand inline-block" /> ZONES TARGETED
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
              {plants.map((p) => (
                <label key={p.id} className={`flex items-center gap-3 p-2 border cursor-pointer transition-colors ${selectedPlants.includes(p.id) ? "border-brand bg-brand/10 text-brand" : "border-border/50 bg-card/40 text-muted-foreground hover:border-brand/50 hover:bg-brand/5"}`}>
                  <input type="checkbox" checked={selectedPlants.includes(p.id)} onChange={() => togglePlant(p.id)} className="accent-brand" />
                  <span className="font-mono text-[10px] uppercase tracking-widest font-bold">{p.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 bg-brand inline-block" /> CRON FREQUENCY
              </Label>
              <Select value={frequency} onValueChange={(v: "daily" | "weekly" | "monthly") => setFrequency(v)}>
                <SelectTrigger className="h-10 rounded-none border-border/50 bg-card/40 font-mono text-[10px] uppercase tracking-widest text-foreground focus:border-brand/50"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none border-border/50 bg-card/90 font-mono text-[10px] uppercase tracking-widest text-foreground">
                  <SelectItem value="daily">DAILY</SelectItem>
                  <SelectItem value="weekly">WEEKLY</SelectItem>
                  <SelectItem value="monthly">MONTHLY</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 bg-brand inline-block" /> ENCODING
              </Label>
              <Select value={format} onValueChange={(v: "pdf" | "csv") => setFormat(v)}>
                <SelectTrigger className="h-10 rounded-none border-border/50 bg-card/40 font-mono text-[10px] uppercase tracking-widest text-foreground focus:border-brand/50"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none border-border/50 bg-card/90 font-mono text-[10px] uppercase tracking-widest text-foreground">
                  <SelectItem value="pdf">PDF FORMAT</SelectItem>
                  <SelectItem value="csv">CSV FORMAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {frequency === "weekly" && (
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 bg-brand inline-block" /> TRIGGER DAY
              </Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger className="h-10 rounded-none border-border/50 bg-card/40 font-mono text-[10px] uppercase tracking-widest text-foreground focus:border-brand/50"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none border-border/50 bg-card/90 font-mono text-[10px] uppercase tracking-widest text-foreground">
                  {["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 bg-brand inline-block" /> TRIGGER TIME (UTC)
            </Label>
            <Input type="time" className="h-10 rounded-none border-border/50 bg-card/40 font-mono text-[10px] uppercase tracking-widest text-brand focus-visible:border-brand/50" value={timeUtc} onChange={(e) => setTimeUtc(e.target.value)} />
          </div>

          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 bg-brand inline-block" /> DELIVERY TARGETS
            </Label>
            <Input className="h-10 rounded-none border-border/50 bg-card/40 font-mono text-[10px] uppercase tracking-widest text-foreground focus-visible:border-brand/50" placeholder="OPS@CORP.COM, ADMIN@CORP.COM" value={recipients} onChange={(e) => setRecipients(e.target.value)} />
            <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mt-2">COMMA-SEPARATED. LEAVE BLANK TO SKIP EMAIL DELIVERY.</p>
          </div>
        </div>
        <DialogFooter className="p-5 border-t border-border/50 bg-card/40 sm:justify-between flex-row">
          <button className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-brand transition-colors" onClick={onClose}>ABORT</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || selectedPlants.length === 0} className="font-mono text-[10px] uppercase tracking-widest font-bold border border-brand bg-brand/10 text-brand hover:bg-brand/20 px-4 py-2 flex items-center gap-2 transition-colors shadow-[0_0_10px_rgba(0,255,170,0.2)] disabled:opacity-50">
            <Calendar className="h-3.5 w-3.5" />
            {mutation.isPending ? "INITIALIZING CRON..." : "INITIALIZE PIPELINE"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canSchedule = user?.permissions?.includes("reports.schedule") ?? false;
  const canExport = user?.permissions?.includes("reports.export") ?? false;

  const [activeTab, setActiveTab] = useState<"history" | "schedules">("history");
  const [generateType, setGenerateType] = useState<ReportTypeDef | null>(null);
  const [scheduleType, setScheduleType] = useState<ReportTypeDef | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("All");

  const { data: types = [] } = useQuery<ReportTypeDef[]>({
    queryKey: ["report-types"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/reports/types`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to load report types (${r.status})`);
      return r.json() as Promise<ReportTypeDef[]>;
    },
    staleTime: Infinity,
  });

  const { data: plants = [] } = useQuery<PlantDef[]>({
    queryKey: ["report-plants"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/reports/plants`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to load plants (${r.status})`);
      return r.json() as Promise<PlantDef[]>;
    },
    staleTime: 60_000 * 10,
  });

  const { data: reports = [], isLoading: reportsLoading } = useQuery<ReportRow[]>({
    queryKey: ["reports"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/reports`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to load report history (${r.status})`);
      return r.json() as Promise<ReportRow[]>;
    },
    refetchInterval: 30_000,
  });

  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ["report-schedules"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/org/report-schedules`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to load schedules (${r.status})`);
      return r.json() as Promise<Schedule[]>;
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${BASE}api/org/report-schedules/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
      toast({ title: "Schedule deleted" });
    },
  });

  async function downloadReport(report: ReportRow) {
    setDownloading(report.id);
    try {
      const r = await fetch(`${BASE}api/reports/${report.id}/download`, { credentials: "include" });
      if (!r.ok) throw new Error("Download failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.reportType ?? report.name}-${new Date(report.createdAt).toISOString().slice(0, 10)}.${report.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }

  const categories = ["All", ...Array.from(new Set(types.map((t) => t.category)))];
  const filteredTypes = filterCategory === "All" ? types : types.filter((t) => t.category === filterCategory);

  // Only show generated reports (status = ready) in history
  const generatedReports = reports.filter((r) => r.status === "ready" && r.reportType);

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-100px)] space-y-6">
        {/* Header */}
        <div className="border border-border/50 bg-card/40 p-5 relative flex-shrink-0">
          <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
          <h1 className="text-xl font-mono font-bold uppercase tracking-widest text-foreground flex items-center gap-3">
            <FileText className="h-5 w-5 text-brand" />
            REPORTING ENGINE
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2 ml-8">
            DATA EXTRACTION AND SCHEDULED DELIVERY PIPELINES
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 min-h-0 flex-1">
          {/* ── Left: Report type gallery ── */}
          <div className="w-full lg:w-80 lg:flex-shrink-0 flex flex-col h-full">
            <div className="flex gap-2 mb-4 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`font-mono text-[9px] uppercase tracking-widest px-3 py-1.5 transition-colors ${filterCategory === cat ? "border border-brand text-brand bg-brand/10 shadow-[0_0_10px_rgba(0,255,170,0.2)]" : "border border-border/50 text-muted-foreground bg-card/40 hover:text-foreground hover:bg-brand/5 hover:border-brand/30"}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {filteredTypes.map((type) => {
                const Icon = ICONS[type.icon] ?? FileText;
                const catCls = CATEGORY_COLORS[type.category] ?? "text-muted-foreground border-border";
                return (
                  <div
                    key={type.id}
                    className="border border-border/50 bg-card/60 p-4 relative group hover:border-brand/50 transition-colors"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-border/50 group-hover:bg-brand transition-colors" />
                    
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 border border-border/50 bg-card flex items-center justify-center flex-shrink-0 group-hover:border-brand/50 group-hover:text-brand transition-colors">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="font-mono text-xs font-bold uppercase tracking-widest group-hover:text-brand transition-colors">{type.name}</div>
                      </div>
                    </div>
                    
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground leading-relaxed line-clamp-2 mb-4 h-6">
                      {type.description}
                    </p>
                    
                    <div className="flex items-center justify-between border-t border-border/50 pt-3">
                      <div className={`font-mono text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 border ${catCls} bg-card/40`}>
                        {type.category}
                      </div>
                      
                      <div className="flex gap-2">
                        {canSchedule && (
                          <button
                            onClick={() => setScheduleType(type)}
                            className="border border-border/50 bg-card hover:border-brand hover:text-brand p-1.5 transition-colors"
                            title="Schedule Delivery"
                          >
                            <Calendar className="h-3 w-3" />
                          </button>
                        )}
                        {canExport && (
                          <button
                            onClick={() => setGenerateType(type)}
                            className="font-mono text-[9px] uppercase tracking-widest font-bold border border-brand bg-brand/10 text-brand hover:bg-brand/20 px-3 py-1 flex items-center gap-1 transition-colors shadow-[0_0_10px_rgba(0,255,170,0.2)]"
                          >
                            GENERATE <ChevronDown className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right: History + Schedules ── */}
          <div className="flex-1 min-w-0 flex flex-col h-full">
            {/* Tabs */}
            <div className="flex border border-border/50 bg-card/40 mb-5 flex-shrink-0">
              {(["history", "schedules"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-3 font-mono text-[10px] uppercase tracking-widest font-bold transition-all flex items-center gap-2 ${
                    activeTab === tab
                      ? "bg-brand/10 text-brand border-b-2 border-b-brand"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5 border-b-2 border-b-transparent"
                  }`}
                >
                  {tab === "history" ? "GENERATED REPORTS" : "SCHEDULED PIPELINES"}
                  {tab === "schedules" && schedules.length > 0 && (
                    <span className="bg-brand text-black px-1.5 py-0.5 leading-none animate-pulse">
                      {schedules.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 border border-border/50 bg-card/60 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
              
              {activeTab === "history" && (
                <div className="h-full overflow-auto custom-scrollbar">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead className="sticky top-0 bg-card/90 backdrop-blur border-b border-border/50 z-10">
                      <tr>
                        <th className="text-left px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">REPORT TYPE</th>
                        <th className="text-left px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">TIME HORIZON</th>
                        <th className="text-left px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">ZONES TARGETED</th>
                        <th className="text-left px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">ENCODING</th>
                        <th className="text-left px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">TIMESTAMP</th>
                        <th className="px-5 py-4" />
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {reportsLoading ? (
                        <tr><td colSpan={6} className="px-5 py-10 text-center font-mono text-[10px] uppercase tracking-widest text-brand animate-pulse">QUERYING PIPELINES...</td></tr>
                      ) : generatedReports.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-5 py-16 text-center">
                            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
                            <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">NO REPORTS EXTRACTED</p>
                            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
                              SELECT A PIPELINE TYPE ON THE LEFT TO INITIATE EXTRACTION
                            </p>
                          </td>
                        </tr>
                      ) : (
                        generatedReports.map((r) => {
                          const typeMeta = types.find((t) => t.id === r.reportType);
                          const Icon = typeMeta ? (ICONS[typeMeta.icon] ?? FileText) : FileText;
                          return (
                            <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-brand/5 transition-colors">
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <Icon className="h-4 w-4 text-brand flex-shrink-0" />
                                  <span className="font-bold text-foreground text-xs uppercase tracking-widest">{r.name}</span>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-[10px] text-muted-foreground uppercase tracking-widest">
                                {r.dateFrom ? `${r.dateFrom.slice(0, 10)} TO ${r.dateTo?.slice(0, 10) ?? ""}` : "—"}
                              </td>
                              <td className="px-5 py-4 text-[10px] text-muted-foreground uppercase tracking-widest">
                                {r.plantIds.length} ZONE{r.plantIds.length !== 1 ? "S" : ""}
                              </td>
                              <td className="px-5 py-4">
                                <span className="border border-border/50 bg-card/40 text-[9px] uppercase tracking-widest px-2 py-1 font-bold text-foreground">
                                  {r.format}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-[10px] text-muted-foreground uppercase tracking-widest">
                                {new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 16)}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <button
                                  className="font-mono text-[9px] uppercase tracking-widest font-bold border border-brand bg-brand/10 text-brand hover:bg-brand/20 px-3 py-1.5 flex items-center gap-2 transition-colors ml-auto shadow-[0_0_10px_rgba(0,255,170,0.2)] disabled:opacity-50"
                                  onClick={() => void downloadReport(r)}
                                  disabled={downloading === r.id}
                                >
                                  {downloading === r.id ? (
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Download className="h-3 w-3" />
                                  )}
                                  {downloading === r.id ? "PULLING" : "FETCH"}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "schedules" && (
                <div className="h-full overflow-auto custom-scrollbar">
                  {schedules.length === 0 ? (
                    <div className="p-16 text-center">
                      <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
                      <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">NO ACTIVE SCHEDULES</p>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
                        CLICK THE CALENDAR ICON ON A REPORT TYPE TO INITIALIZE CRON
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-sm min-w-[700px]">
                      <thead className="sticky top-0 bg-card/90 backdrop-blur border-b border-border/50 z-10">
                        <tr>
                          <th className="text-left px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">PIPELINE</th>
                          <th className="text-left px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">CRON FREQ</th>
                          <th className="text-left px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">UTC TRIGGER</th>
                          <th className="text-left px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">ENCODING</th>
                          <th className="text-left px-5 py-4 font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">ZONES TARGETED</th>
                          <th className="px-5 py-4" />
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {schedules.map((s) => {
                          const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
                          const dayLabel = s.dayOfWeek !== null ? days[s.dayOfWeek] ?? "" : "";
                          const freqLabel = s.frequency === "weekly" ? `WEEKLY (${dayLabel})` : s.frequency.toUpperCase();
                          return (
                            <tr key={s.id} className="border-b border-border/50 last:border-0 hover:bg-brand/5 transition-colors">
                              <td className="px-5 py-4 font-bold text-foreground text-xs uppercase tracking-widest">
                                {s.reportName}
                              </td>
                              <td className="px-5 py-4 text-[10px] text-brand uppercase tracking-widest font-bold">
                                {freqLabel}
                              </td>
                              <td className="px-5 py-4 text-[10px] text-muted-foreground uppercase tracking-widest">
                                {s.timeUtc}
                              </td>
                              <td className="px-5 py-4">
                                <span className="border border-border/50 bg-card/40 text-[9px] uppercase tracking-widest px-2 py-1 font-bold text-foreground">
                                  {s.format}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-[10px] text-muted-foreground uppercase tracking-widest">
                                {s.plantIds.length} ZONE{s.plantIds.length !== 1 ? "S" : ""}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <button
                                  className="border border-status-fault/50 bg-status-fault/10 text-status-fault hover:bg-status-fault/20 p-1.5 transition-colors disabled:opacity-50"
                                  onClick={() => deleteScheduleMutation.mutate(s.id)}
                                  disabled={deleteScheduleMutation.isPending}
                                  title="Terminate Schedule"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {generateType && (
        <GenerateModal
          type={generateType}
          plants={plants}
          onClose={() => setGenerateType(null)}
          onGenerated={() => void queryClient.invalidateQueries({ queryKey: ["reports"] })}
        />
      )}
      {scheduleType && (
        <ScheduleModal
          type={scheduleType}
          plants={plants}
          onClose={() => setScheduleType(null)}
        />
      )}
    </AppLayout>
  );
}
