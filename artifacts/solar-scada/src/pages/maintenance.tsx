import { 
  useListWorkOrders, 
  useUpdateWorkOrder,
  getListWorkOrdersQueryKey,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrder
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Wrench, Plus, Clock, User, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const KANBAN_COLUMNS: { id: WorkOrderStatus; title: string }[] = [
  { id: "open", title: "Open" },
  { id: "assigned", title: "Assigned" },
  { id: "in_progress", title: "In Progress" },
  { id: "resolved", title: "Resolved" },
  { id: "verified", title: "Verified" }
];

function PriorityBadge({ priority }: { priority: WorkOrderPriority }) {
  switch (priority) {
    case "critical": return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-status-fault text-status-fault-foreground uppercase">Critical</span>;
    case "high": return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#e67e22] text-white uppercase">High</span>;
    case "medium": return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground uppercase border border-border">Medium</span>;
    case "low": return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-muted/50 text-muted-foreground/70 uppercase border border-border/50">Low</span>;
  }
}

export default function MaintenanceBoard() {
  const queryClient = useQueryClient();
  const { data: workOrders, isLoading } = useListWorkOrders({}, {
    query: { refetchInterval: 15000, queryKey: getListWorkOrdersQueryKey({}) }
  });
  
  const updateWO = useUpdateWorkOrder();

  const moveCard = (woId: string, currentStatus: WorkOrderStatus) => {
    const idx = KANBAN_COLUMNS.findIndex(c => c.id === currentStatus);
    if (idx >= 0 && idx < KANBAN_COLUMNS.length - 1) {
      const nextStatus = KANBAN_COLUMNS[idx + 1].id;
      updateWO.mutate({ workOrderId: woId, data: { status: nextStatus } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() })
      });
    }
  };

  const getCardsForColumn = (status: WorkOrderStatus) => {
    return workOrders?.filter(wo => wo.status === status) || [];
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <Wrench className="w-6 h-6 mr-2 text-primary" />
              Maintenance Operations
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Kanban board for O&M work orders</p>
          </div>
          <button className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium flex items-center shadow-sm transition-colors">
            <Plus className="w-4 h-4 mr-2" /> New Work Order
          </button>
        </div>

        <div className="flex-1 overflow-x-auto pb-4">
          <div className="flex space-x-4 h-full min-w-max">
            {isLoading ? (
              <div className="text-muted-foreground w-full text-center mt-20 animate-pulse">Loading board...</div>
            ) : KANBAN_COLUMNS.map(column => (
              <div key={column.id} className="w-80 flex flex-col bg-muted/30 border border-border rounded-xl">
                <div className="px-4 py-3 border-b border-border flex justify-between items-center bg-card rounded-t-xl">
                  <h3 className="font-semibold text-sm">{column.title}</h3>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-mono">
                    {getCardsForColumn(column.id).length}
                  </span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {getCardsForColumn(column.id).map(wo => (
                    <div key={wo.id} className="bg-card border border-card-border rounded-lg p-4 shadow-sm hover:border-primary/50 transition-colors group">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-mono text-muted-foreground">#{wo.id.substring(0,6).toUpperCase()}</span>
                        <PriorityBadge priority={wo.priority} />
                      </div>
                      
                      <h4 className="text-sm font-medium mb-1 leading-tight">{wo.faultDescription}</h4>
                      <p className="text-xs text-muted-foreground mb-3">{wo.plantName} • {wo.equipment}</p>
                      
                      {wo.slaBreached && (
                        <div className="flex items-center text-[10px] text-status-fault mb-3 bg-status-fault/10 px-2 py-1 rounded border border-status-fault/20">
                          <AlertCircle className="w-3 h-3 mr-1" /> SLA BREACHED
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                        <div className="flex items-center text-xs text-muted-foreground">
                          {wo.assignedTo ? (
                            <><User className="w-3 h-3 mr-1" /> {wo.assignedTo}</>
                          ) : (
                            <span className="italic">Unassigned</span>
                          )}
                        </div>
                        
                        {column.id !== "verified" && (
                          <button 
                            onClick={() => moveCard(wo.id, wo.status)}
                            className="text-xs font-medium text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Move →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
