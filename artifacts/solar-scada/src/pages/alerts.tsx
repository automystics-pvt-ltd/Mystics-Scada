import {
  useListAlerts,
  useUpdateAlert,
  getListAlertsQueryKey,
  AlertStatus,
  AlertSeverity,
  type Alert,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { SeverityBadge, StatCard } from "@/components/ui/scada";
import { useState, useMemo } from "react";
import {
  AlertTriangle, Filter, CheckCircle2, BellRing, Clock,
  XCircle, Info, ChevronRight, X, Calendar,
  FileText, MapPin, FlaskConical,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const map: Record<AlertStatus, string> = {
    open:         "bg-status-fault/15 text-status-fault border-status-fault/30",
    acknowledged: "bg-[#e67e22]/15 text-[#e67e22] border-[#e67e22]/30",
    assigned:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
    resolved:     "bg-status-normal/15 text-status-normal border-status-normal/30",
    closed:       "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${map[status]}`}>
      {status}
    </span>
  );
}

/** True when this alert was created by the fault injection system, not a real device fault. */
function isSimulatedFaultAlert(alert: Alert): boolean {
  return alert.title.startsWith("Fault Simulation:");
}

function timeAgo(date: string | Date) {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function AlertDetail({ alert, onClose, onAcknowledge, onResolve }: {
  alert: Alert;
  onClose: () => void;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const severityBorder: Record<AlertSeverity, string> = {
    critical: "border-l-status-fault",
    major:    "border-l-[#e67e22]",
    minor:    "border-l-status-warning",
    informational: "border-l-blue-400",
  };

  return (
    <div className={`h-full flex flex-col bg-card border-l border-card-border border-l-4 ${severityBorder[alert.severity]} animate-fade-up`}>
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-border">
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <SeverityBadge severity={alert.severity} />
            <AlertStatusBadge status={alert.status} />
            <span className="text-[10px] font-mono text-muted-foreground">ID: {alert.id.substring(0, 8).toUpperCase()}</span>
          </div>
          <h3 className="text-xl font-bold text-foreground leading-snug">{alert.title}</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* SIMULATION notice — shown only for drill alerts created by fault injection */}
        {isSimulatedFaultAlert(alert) && (
          <div className="flex items-start gap-3 rounded-lg px-4 py-3 border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm">
            <FlaskConical className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">SIMULATION DRILL</span>
              {" — This alarm was injected by an operator for training purposes. It does not indicate a real device fault."}
            </div>
          </div>
        )}
        {/* Message */}
        <div className="bg-muted/40 rounded-xl p-4 border border-border/50 text-sm leading-relaxed text-foreground/90">
          {alert.message}
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { icon: MapPin,    label: "Plant",    value: alert.plantName },
            { icon: FileText,  label: "Device",   value: alert.deviceName },
            { icon: Calendar,  label: "Triggered",value: new Date(alert.createdAt).toLocaleString() },
            { icon: Clock,     label: "Duration", value: timeAgo(alert.createdAt) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-3 p-3 bg-muted/20 border border-border/40 rounded-lg">
              <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">{label}</div>
                <div className="font-medium text-sm">{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="pt-2">
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-5">Event Timeline</h4>
          <div className="space-y-5">
            <div className="flex gap-4 text-sm relative">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-status-fault mt-1 flex-shrink-0 relative z-10 shadow-[0_0_8px_hsl(var(--status-fault)/0.5)]" />
                <div className="w-px flex-1 bg-border/80 mt-1 absolute top-4 bottom-[-20px] left-[5px]" />
              </div>
              <div className="pb-4">
                <div className="font-semibold text-foreground">Alert triggered</div>
                <div className="text-xs text-muted-foreground mt-1 font-mono">{new Date(alert.createdAt).toLocaleString()}</div>
              </div>
            </div>
            {(alert.status === "acknowledged" || alert.status === "assigned" || alert.status === "resolved" || alert.status === "closed") && (
              <div className="flex gap-4 text-sm relative">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-[#e67e22] mt-1 flex-shrink-0 relative z-10 shadow-[0_0_8px_rgba(230,126,34,0.5)]" />
                  {alert.status === "resolved" || alert.status === "closed" ? <div className="w-px flex-1 bg-border/80 mt-1 absolute top-4 bottom-[-20px] left-[5px]" /> : null}
                </div>
                <div className="pb-4">
                  <div className="font-semibold text-foreground">Acknowledged</div>
                  <div className="text-xs text-muted-foreground mt-1">Status updated to acknowledged</div>
                </div>
              </div>
            )}
            {(alert.status === "resolved" || alert.status === "closed") && (
              <div className="flex gap-4 text-sm relative">
                <div className="w-3 h-3 rounded-full bg-status-normal mt-1 flex-shrink-0 relative z-10 shadow-[0_0_8px_hsl(var(--status-normal)/0.5)]" />
                <div>
                  <div className="font-semibold text-foreground">Resolved</div>
                  <div className="text-xs text-muted-foreground mt-1">Issue cleared by operator</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      {(alert.status === "open" || alert.status === "acknowledged" || alert.status === "assigned") && (
        <div className="p-5 border-t border-border bg-muted/10 flex gap-3">
          {alert.status === "open" && (
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#e67e22]/10 hover:bg-[#e67e22]/20 text-[#e67e22] border border-[#e67e22]/30 rounded-lg text-sm font-semibold transition-colors"
            >
              <BellRing className="w-4 h-4" /> Acknowledge
            </button>
          )}
          <button
            onClick={() => onResolve(alert.id)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-status-normal/10 hover:bg-status-normal/20 text-status-normal border border-status-normal/30 rounded-lg text-sm font-semibold transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" /> Mark Resolved
          </button>
        </div>
      )}
    </div>
  );
}

export default function AlertCenter() {
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | undefined>();
  const [filterStatus,   setFilterStatus]   = useState<AlertStatus | undefined>();
  const [selectedAlert,  setSelectedAlert]  = useState<Alert | null>(null);

  const queryClient = useQueryClient();
  const { data: alerts, isLoading } = useListAlerts(
    { severity: filterSeverity, status: filterStatus },
    { query: { refetchInterval: 10000, queryKey: getListAlertsQueryKey({ severity: filterSeverity, status: filterStatus }) } }
  );

  // Unfiltered counts for summary
  const { data: allAlerts } = useListAlerts({}, {
    query: { refetchInterval: 15000, queryKey: getListAlertsQueryKey({}) }
  });

  const updateAlert = useUpdateAlert();

  const handleAcknowledge = (alertId: string) => {
    updateAlert.mutate({ alertId, data: { status: "acknowledged" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
        setSelectedAlert(prev => prev?.id === alertId ? { ...prev, status: "acknowledged" } : prev);
      }
    });
  };

  const handleResolve = (alertId: string) => {
    updateAlert.mutate({ alertId, data: { status: "resolved" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
        setSelectedAlert(prev => prev?.id === alertId ? { ...prev, status: "resolved" } : prev);
      }
    });
  };

  const stats = useMemo(() => {
    const all = allAlerts ?? [];
    return {
      open:     all.filter(a => a.status === "open").length,
      critical: all.filter(a => a.severity === "critical" && a.status === "open").length,
      major:    all.filter(a => a.severity === "major"    && a.status === "open").length,
      resolved: all.filter(a => a.status === "resolved").length,
    };
  }, [allAlerts]);

  const severityOrder: Record<AlertSeverity, number> = { critical: 0, major: 1, minor: 2, informational: 3 };
  const sorted = useMemo(() => [...(alerts ?? [])].sort((a, b) =>
    severityOrder[a.severity] - severityOrder[b.severity] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ), [alerts]);

  return (
    <AppLayout>
      <div className="flex flex-col h-full space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 animate-fade-up">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <AlertTriangle className="w-7 h-7 text-status-fault" />
              Alert Center
            </h1>
            <p className="text-sm text-muted-foreground mt-2">Fleet-wide event monitoring · <span className="text-accent-brand">Live updates active</span></p>
          </div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 text-sm transition-colors focus-within:border-accent-brand focus-within:ring-1 focus-within:ring-accent-brand/50 shadow-sm">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select className="bg-transparent border-none outline-none text-foreground text-sm cursor-pointer font-medium" value={filterStatus ?? ""} onChange={e => setFilterStatus(e.target.value ? e.target.value as AlertStatus : undefined)}>
                <option value="">All Statuses</option>
                <option value="open">Open</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="assigned">Assigned</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 text-sm transition-colors focus-within:border-accent-brand focus-within:ring-1 focus-within:ring-accent-brand/50 shadow-sm">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select className="bg-transparent border-none outline-none text-foreground text-sm cursor-pointer font-medium" value={filterSeverity ?? ""} onChange={e => setFilterSeverity(e.target.value ? e.target.value as AlertSeverity : undefined)}>
                <option value="">All Severities</option>
                <option value="critical">Critical</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
                <option value="informational">Info</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up" style={{ animationDelay: '50ms' }}>
          <StatCard label="Open Alerts"     value={stats.open}     icon={AlertTriangle}  accent="warning" loading={isLoading} />
          <StatCard label="Critical Active" value={stats.critical} icon={XCircle}        accent="danger"  loading={isLoading} />
          <StatCard label="Major Active"    value={stats.major}    icon={AlertTriangle}  accent="warning" loading={isLoading} />
          <StatCard label="Resolved"        value={stats.resolved} icon={CheckCircle2}   accent="success" loading={isLoading} />
        </div>

        {/* Split: list + detail — mobile shows one panel at a time */}
        <div className="flex-1 min-h-0 flex gap-6 overflow-hidden animate-fade-up" style={{ animationDelay: '100ms', minHeight: "400px" }}>

          {/* Alert list — hidden on mobile when detail is open */}
          <div className={`flex flex-col bg-card border border-card-border rounded-2xl overflow-hidden shadow-sm transition-all ${
            selectedAlert ? "hidden md:flex md:w-[45%]" : "flex-1"
          }`}>
            <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center justify-between flex-shrink-0">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                {sorted.length} {sorted.length === 1 ? "Event" : "Events"}
              </span>
              {selectedAlert && (
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" /> Select for detail
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border/50">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-5 py-4 animate-shimmer">
                    <div className="h-4 bg-muted/50 rounded w-3/4 mb-3" />
                    <div className="h-3 bg-muted/50 rounded w-1/2" />
                  </div>
                ))
              ) : sorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 text-status-normal opacity-80" />
                  <span className="text-sm font-medium">No alerts match filters</span>
                </div>
              ) : sorted.map(alert => (
                <button
                  key={alert.id}
                  onClick={() => setSelectedAlert(prev => prev?.id === alert.id ? null : alert)}
                  className={`w-full text-left px-5 py-4 hover:bg-muted/30 transition-all flex items-start gap-4 group border-l-[3px] ${
                    selectedAlert?.id === alert.id 
                      ? "bg-muted/40 border-l-accent-brand shadow-[inset_2px_0_0_rgba(20,205,230,1)]" 
                      : alert.severity === "critical" ? "border-l-status-fault" :
                        alert.severity === "major" ? "border-l-[#e67e22]" :
                        alert.severity === "minor" ? "border-l-status-warning/50" :
                        "border-l-blue-400/50"
                  }`}
                >

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-semibold leading-snug truncate group-hover:text-accent-brand transition-colors text-foreground">{alert.title}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0 font-mono mt-0.5">
                        {timeAgo(alert.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <SeverityBadge severity={alert.severity} className="text-[9px]" />
                      <AlertStatusBadge status={alert.status} />
                      {isSimulatedFaultAlert(alert) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider bg-amber-500/15 text-amber-400 border-amber-500/30">
                          <FlaskConical className="w-2.5 h-2.5" /> DRILL
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground font-medium ml-1 truncate">{alert.plantName} · {alert.deviceName}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-transform -translate-x-2 group-hover:translate-x-0 flex-shrink-0 mt-2" />
                </button>
              ))}
            </div>
          </div>

          {/* Detail panel — full-width on mobile, flex-1 on desktop */}
          {selectedAlert ? (
            <div className="flex-1 min-w-0 rounded-2xl overflow-hidden shadow-sm">
              <AlertDetail
                alert={selectedAlert}
                onClose={() => setSelectedAlert(null)}
                onAcknowledge={handleAcknowledge}
                onResolve={handleResolve}
              />
            </div>
          ) : (
            <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-card/50 border border-card-border border-dashed rounded-2xl text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-muted/50 border border-border flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-sm font-medium">Select an alert to view details</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
