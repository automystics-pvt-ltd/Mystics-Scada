import { 
  useListAlerts, 
  useUpdateAlert,
  getListAlertsQueryKey,
  AlertStatus,
  AlertSeverity
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { SeverityBadge } from "@/components/ui/scada";
import { useState } from "react";
import { AlertTriangle, Filter, CheckCircle2, UserPlus, FileText, BellRing, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

function AlertStatusBadge({ status }: { status: AlertStatus }) {
  switch (status) {
    case "open": return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-status-fault/20 text-status-fault border border-status-fault/30 uppercase tracking-wider">Open</span>;
    case "acknowledged": return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-[#e67e22]/20 text-[#e67e22] border border-[#e67e22]/30 uppercase tracking-wider">Ack'd</span>;
    case "assigned": return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-500 border border-blue-500/30 uppercase tracking-wider">Assigned</span>;
    case "resolved": return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-status-normal/20 text-status-normal border border-status-normal/30 uppercase tracking-wider">Resolved</span>;
    case "closed": return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground border border-border uppercase tracking-wider">Closed</span>;
  }
}

export default function AlertCenter() {
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | undefined>();
  const [filterStatus, setFilterStatus] = useState<AlertStatus | undefined>();
  
  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useListAlerts(
    { severity: filterSeverity, status: filterStatus },
    { query: { refetchInterval: 10000, queryKey: getListAlertsQueryKey({ severity: filterSeverity, status: filterStatus }) } }
  );

  const updateAlert = useUpdateAlert();

  const handleAcknowledge = (alertId: string) => {
    updateAlert.mutate({ alertId, data: { status: "acknowledged" } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() })
    });
  };

  const handleResolve = (alertId: string) => {
    updateAlert.mutate({ alertId, data: { status: "resolved" } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() })
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6 h-full">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <AlertTriangle className="w-6 h-6 mr-2 text-status-fault" />
              Alert Center
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Fleet-wide real-time event monitoring</p>
          </div>
          <div className="flex space-x-2">
            <div className="flex items-center space-x-2 bg-card border border-border rounded-md px-3 py-1.5 text-sm">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select 
                className="bg-transparent border-none focus:ring-0 text-foreground outline-none"
                value={filterStatus || ""}
                onChange={(e) => setFilterStatus(e.target.value ? e.target.value as AlertStatus : undefined)}
              >
                <option value="">All Statuses</option>
                <option value="open">Open</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="assigned">Assigned</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="flex items-center space-x-2 bg-card border border-border rounded-md px-3 py-1.5 text-sm">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select 
                className="bg-transparent border-none focus:ring-0 text-foreground outline-none"
                value={filterSeverity || ""}
                onChange={(e) => setFilterSeverity(e.target.value ? e.target.value as AlertSeverity : undefined)}
              >
                <option value="">All Severities</option>
                <option value="critical">Critical</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
                <option value="informational">Info</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-card border border-card-border rounded-lg overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-card-border sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Plant</th>
                  <th className="px-4 py-3 font-medium">Device</th>
                  <th className="px-4 py-3 font-medium w-full">Message</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {isLoading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading alerts...</td></tr>
                ) : alerts?.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No alerts match the current filters.</td></tr>
                ) : alerts?.map(alert => (
                  <tr key={alert.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="flex items-center">
                        <Clock className="w-3 h-3 mr-1.5" />
                        {new Date(alert.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-4 py-3"><SeverityBadge severity={alert.severity} /></td>
                    <td className="px-4 py-3"><AlertStatusBadge status={alert.status} /></td>
                    <td className="px-4 py-3 font-medium">{alert.plantName}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 bg-muted rounded border border-border">{alert.deviceName}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-normal min-w-[300px]">
                      <div className="font-medium text-foreground">{alert.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{alert.message}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {alert.status === 'open' && (
                          <button 
                            onClick={() => handleAcknowledge(alert.id)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                            title="Acknowledge"
                          >
                            <BellRing className="w-4 h-4" />
                          </button>
                        )}
                        {(alert.status === 'open' || alert.status === 'acknowledged' || alert.status === 'assigned') && (
                          <button 
                            onClick={() => handleResolve(alert.id)}
                            className="p-1.5 text-muted-foreground hover:text-status-normal hover:bg-status-normal/10 rounded"
                            title="Resolve"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
