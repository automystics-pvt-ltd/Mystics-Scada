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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            {type.name}
          </DialogTitle>
        </DialogHeader>

        {!generatedId ? (
          <div className="space-y-4 py-2">
            {/* Plants */}
            <div>
              <Label>Plants</Label>
              <div className="mt-1.5 space-y-1.5">
                {plants.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPlants.includes(p.id)}
                      onChange={() => togglePlant(p.id)}
                      className="accent-primary"
                    />
                    <span className="text-sm">{p.name}</span>
                    <span className="text-xs text-muted-foreground">({p.capacityMw} MW)</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Date range presets */}
            <div>
              <Label>Date Range</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PRESETS.map((p) => {
                  const range = p.getRange();
                  const active = range.from === dateFrom && range.to === dateTo;
                  return (
                    <button
                      key={p.label}
                      onClick={() => { setDateFrom(range.from); setDateTo(range.to); }}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-2">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input type="date" className="h-8 text-sm mt-0.5" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input type="date" className="h-8 text-sm mt-0.5" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Format */}
            <div>
              <Label>Export Format</Label>
              <div className="flex gap-2 mt-1.5">
                {(["csv", "pdf"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`px-4 py-2 rounded border text-sm font-medium uppercase transition-colors ${format === f ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-status-normal/20 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-status-normal" />
            </div>
            <p className="font-medium">Report ready</p>
            <p className="text-sm text-muted-foreground">Your {type.name} report has been generated.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="h-3.5 w-3.5 mr-1.5" /> {generatedId ? "Close" : "Cancel"}
          </Button>
          {!generatedId ? (
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || selectedPlants.length === 0}
              className="gap-2"
            >
              {mutation.isPending ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Generating…</>
              ) : (
                <>Generate Report</>
              )}
            </Button>
          ) : (
            <Button onClick={() => void download()} disabled={downloading} className="gap-2">
              <Download className="h-3.5 w-3.5" />
              {downloading ? "Downloading…" : `Download ${format.toUpperCase()}`}
            </Button>
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Schedule {type.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
            <Icon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">{type.description}</p>
          </div>

          <div>
            <Label>Plants</Label>
            <div className="mt-1.5 space-y-1">
              {plants.map((p) => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedPlants.includes(p.id)} onChange={() => togglePlant(p.id)} className="accent-primary" />
                  <span className="text-sm">{p.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v: "daily" | "weekly" | "monthly") => setFrequency(v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Format</Label>
              <Select value={format} onValueChange={(v: "pdf" | "csv") => setFormat(v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {frequency === "weekly" && (
            <div>
              <Label>Day of Week</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Delivery Time (UTC)</Label>
            <Input type="time" className="mt-1 h-9" value={timeUtc} onChange={(e) => setTimeUtc(e.target.value)} />
          </div>

          <div>
            <Label>Email Recipients</Label>
            <Input className="mt-1" placeholder="ops@co.com, reports@co.com" value={recipients} onChange={(e) => setRecipients(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Comma-separated. Leave blank for no email delivery.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || selectedPlants.length === 0} className="gap-2">
            <Calendar className="h-3.5 w-3.5" />
            {mutation.isPending ? "Saving…" : "Save Schedule"}
          </Button>
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
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Reporting Engine
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Generate and schedule structured reports for any plant and period
            </p>
          </div>
        </div>

        <div className="flex gap-5 min-h-0 flex-1">
          {/* ── Left: Report type gallery ── */}
          <div className="w-72 flex-shrink-0 flex flex-col">
            <div className="flex gap-1 mb-3 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${filterCategory === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredTypes.map((type) => {
                const Icon = ICONS[type.icon] ?? FileText;
                const catCls = CATEGORY_COLORS[type.category] ?? "text-muted-foreground border-border";
                return (
                  <div
                    key={type.id}
                    className="rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors group"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold">{type.name}</span>
                          <Badge variant="outline" className={`text-[10px] py-0 px-1 ${catCls}`}>
                            {type.category}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                          {type.description}
                        </p>
                        <div className="flex gap-1.5 mt-2">
                          {canExport && (
                            <Button
                              size="sm"
                              className="h-6 px-2.5 text-xs gap-1"
                              onClick={() => setGenerateType(type)}
                            >
                              <ChevronDown className="h-3 w-3" /> Generate
                            </Button>
                          )}
                          {canSchedule && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs gap-1"
                              onClick={() => setScheduleType(type)}
                            >
                              <Calendar className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right: History + Schedules ── */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Tabs */}
            <div className="flex border-b border-border mb-4 flex-shrink-0">
              {(["history", "schedules"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                    activeTab === tab
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "history" ? "Generated Reports" : "Scheduled Delivery"}
                  {tab === "schedules" && schedules.length > 0 && (
                    <span className="ml-2 bg-primary/20 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {schedules.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === "history" && (
              <div className="flex-1 overflow-auto">
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Report</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Period</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Plants</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Format</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Generated</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {reportsLoading ? (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading reports…</td></tr>
                      ) : generatedReports.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center">
                            <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">No reports generated yet</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">
                              Select a report type on the left and click Generate
                            </p>
                          </td>
                        </tr>
                      ) : (
                        generatedReports.map((r) => {
                          const typeMeta = types.find((t) => t.id === r.reportType);
                          const Icon = typeMeta ? (ICONS[typeMeta.icon] ?? FileText) : FileText;
                          return (
                            <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                  <span className="font-medium text-sm">{r.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                {r.dateFrom ? `${r.dateFrom.slice(0, 10)} → ${r.dateTo?.slice(0, 10) ?? ""}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {r.plantIds.length} plant{r.plantIds.length !== 1 ? "s" : ""}
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="text-xs font-mono uppercase">
                                  {r.format}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {new Date(r.createdAt).toLocaleString()}
                              </td>
                              <td className="px-4 py-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 gap-1.5 text-xs"
                                  onClick={() => void downloadReport(r)}
                                  disabled={downloading === r.id}
                                >
                                  {downloading === r.id ? (
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Download className="h-3 w-3" />
                                  )}
                                  {downloading === r.id ? "…" : r.format.toUpperCase()}
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "schedules" && (
              <div className="flex-1 overflow-auto">
                {schedules.length === 0 ? (
                  <div className="rounded-lg border border-border p-10 text-center">
                    <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No scheduled reports</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Click the calendar icon on a report type to schedule recurring delivery
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Report Type</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Frequency</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Delivery Time</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Format</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Plants</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {schedules.map((s) => {
                          const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                          const dayLabel = s.dayOfWeek !== null ? days[s.dayOfWeek] ?? "" : "";
                          const freqLabel = s.frequency === "weekly" ? `Weekly (${dayLabel})` : s.frequency.charAt(0).toUpperCase() + s.frequency.slice(1);
                          return (
                            <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                              <td className="px-4 py-3">
                                <span className="font-medium">{s.reportName}</span>
                              </td>
                              <td className="px-4 py-3 text-sm">{freqLabel}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{s.timeUtc} UTC</td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="text-xs font-mono uppercase">{s.format}</Badge>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {s.plantIds.length} plant{s.plantIds.length !== 1 ? "s" : ""}
                              </td>
                              <td className="px-4 py-3">
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 px-2 text-status-fault hover:text-status-fault"
                                  onClick={() => deleteScheduleMutation.mutate(s.id)}
                                  disabled={deleteScheduleMutation.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
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
