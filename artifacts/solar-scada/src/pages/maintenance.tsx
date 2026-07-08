import {
  useListWorkOrders,
  useUpdateWorkOrder,
  useCreateWorkOrder,
  getListWorkOrdersQueryKey,
  WorkOrderStatus,
  WorkOrderPriority,
  type WorkOrder,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { StatCard } from "@/components/ui/scada";
import { Wrench, Plus, Clock, User, AlertCircle, AlertTriangle, Calendar, X, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

/* ── Helpers ──────────────────────────────────────────────────────────── */

const KANBAN_COLUMNS: { id: WorkOrderStatus; title: string; color: string }[] = [
  { id: "open",        title: "Open",        color: "border-t-muted-foreground" },
  { id: "assigned",    title: "Assigned",    color: "border-t-blue-400" },
  { id: "in_progress", title: "In Progress", color: "border-t-status-warning" },
  { id: "resolved",    title: "Resolved",    color: "border-t-status-normal" },
  { id: "verified",    title: "Verified",    color: "border-t-primary" },
];

const PRIORITY_LEFT: Record<WorkOrderPriority, string> = {
  critical: "border-l-status-fault",
  high:     "border-l-[#e67e22]",
  medium:   "border-l-status-warning",
  low:      "border-l-border",
};

const PRIORITY_BADGE: Record<WorkOrderPriority, string> = {
  critical: "bg-status-fault/15 text-status-fault border-status-fault/30",
  high:     "bg-[#e67e22]/15 text-[#e67e22] border-[#e67e22]/30",
  medium:   "bg-status-warning/15 text-status-warning border-status-warning/30",
  low:      "bg-muted text-muted-foreground border-border",
};

function formatDue(dueDate: Date | string | null): { label: string; overdue: boolean } {
  if (!dueDate) return { label: "No due date", overdue: false };
  const d = new Date(dueDate as string);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH  = Math.round(diffMs / 3600000);
  const overdue = diffMs < 0;
  if (overdue) return { label: `Overdue by ${Math.abs(diffH)}h`, overdue: true };
  if (diffH < 24) return { label: `Due in ${diffH}h`, overdue: false };
  const diffD = Math.floor(diffH / 24);
  return { label: `Due in ${diffD}d`, overdue: false };
}

/* ── New Work Order modal ─────────────────────────────────────────────── */

function NewWorkOrderModal({ onClose }: { onClose: () => void }) {
  const createWO = useCreateWorkOrder();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    plantId: "plant-thar",
    equipment: "",
    faultDescription: "",
    priority: "medium" as WorkOrderPriority,
    assignedTo: "",
    dueDate: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    createWO.mutate({
      data: {
        plantId: form.plantId,
        equipment: form.equipment,
        faultDescription: form.faultDescription,
        priority: form.priority,
        assignedTo: form.assignedTo || undefined,
        dueDate: form.dueDate || undefined,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
        onClose();
      },
      onSettled: () => setSubmitting(false),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-card-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" />
            New Work Order
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Equipment *</label>
            <input
              required
              value={form.equipment}
              onChange={e => setForm(f => ({ ...f, equipment: e.target.value }))}
              placeholder="e.g. Inverter 3, Combiner Box 2"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Fault Description *</label>
            <textarea
              required
              rows={3}
              value={form.faultDescription}
              onChange={e => setForm(f => ({ ...f, faultDescription: e.target.value }))}
              placeholder="Describe the issue in detail…"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Priority</label>
              <div className="relative">
                <select
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value as WorkOrderPriority }))}
                  className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 pr-8"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Due Date</label>
              <input
                type="datetime-local"
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Assign To</label>
            <input
              value={form.assignedTo}
              onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
              placeholder="Technician name (optional)"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create Work Order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Work order card ──────────────────────────────────────────────────── */

function WOCard({ wo, onMove, isLast }: { wo: WorkOrder; onMove: (id: string, s: WorkOrderStatus) => void; isLast: boolean }) {
  const due = formatDue(wo.dueDate);

  return (
    <div className={`bg-card border border-card-border border-l-4 ${PRIORITY_LEFT[wo.priority]} rounded-lg p-4 shadow-sm hover:shadow-md hover:border-r-primary/30 transition-all`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] font-mono text-muted-foreground">#{wo.id.substring(0, 6).toUpperCase()}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase ${PRIORITY_BADGE[wo.priority]}`}>
          {wo.priority}
        </span>
      </div>

      {/* Title */}
      <h4 className="text-sm font-semibold mb-0.5 leading-tight line-clamp-2">{wo.faultDescription}</h4>
      <p className="text-xs text-muted-foreground mb-3">{wo.plantName} · {wo.equipment}</p>

      {/* SLA breach */}
      {wo.slaBreached && (
        <div className="flex items-center gap-1.5 text-[10px] text-status-fault bg-status-fault/10 border border-status-fault/20 rounded px-2 py-1 mb-3">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span className="font-bold uppercase tracking-wide">SLA Breached</span>
        </div>
      )}

      {/* Due date */}
      {wo.dueDate && (
        <div className={`flex items-center gap-1.5 text-xs mb-3 ${due.overdue ? "text-status-fault" : "text-muted-foreground"}`}>
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span className={due.overdue ? "font-semibold" : ""}>{due.label}</span>
        </div>
      )}

      {/* Root cause snippet */}
      {wo.rootCause && (
        <div className="text-[11px] bg-muted/50 rounded px-2 py-1.5 border border-border/50 text-muted-foreground mb-3 line-clamp-2">
          <span className="font-semibold text-foreground/70">Root cause: </span>{wo.rootCause}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="w-3 h-3" />
          <span className={wo.assignedTo ? "" : "italic"}>{wo.assignedTo ?? "Unassigned"}</span>
        </div>
        {!isLast && (
          <button
            onClick={() => onMove(wo.id, wo.status)}
            className="text-xs font-medium px-2.5 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            Advance →
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────── */

export default function MaintenanceBoard() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

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

  const cardsFor = (status: WorkOrderStatus) =>
    (workOrders ?? []).filter(wo => wo.status === status);

  const stats = {
    open:     cardsFor("open").length + cardsFor("assigned").length + cardsFor("in_progress").length,
    critical: (workOrders ?? []).filter(wo => wo.priority === "critical" && wo.status !== "verified" && wo.status !== "closed").length,
    breached: (workOrders ?? []).filter(wo => wo.slaBreached).length,
    done:     cardsFor("verified").length,
  };

  return (
    <>
      {showModal && <NewWorkOrderModal onClose={() => setShowModal(false)} />}

      <AppLayout>
        <div className="flex flex-col h-full space-y-5">

          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Wrench className="w-6 h-6 text-primary" />
                Maintenance Operations
              </h1>
              <p className="text-sm text-muted-foreground mt-1">O&M work order board · drag cards to advance</p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> New Work Order
            </button>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Active Work Orders" value={stats.open}     icon={Clock}         accent="info"    loading={isLoading} />
            <StatCard label="Critical Priority"  value={stats.critical} icon={AlertCircle}   accent="danger"  loading={isLoading} />
            <StatCard label="SLA Breached"        value={stats.breached} icon={AlertTriangle} accent="warning" loading={isLoading} />
            <StatCard label="Verified Complete"   value={stats.done}    icon={Wrench}         accent="success" loading={isLoading} />
          </div>

          {/* Kanban board */}
          <div className="flex-1 overflow-x-auto pb-4 min-h-0">
            <div className="flex gap-4 h-full" style={{ minWidth: `${KANBAN_COLUMNS.length * 320 + 64}px` }}>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="w-72 flex-shrink-0 bg-muted/30 border border-border rounded-xl animate-pulse" />
                ))
              ) : KANBAN_COLUMNS.map(col => {
                const cards = cardsFor(col.id);
                return (
                  <div key={col.id} className={`w-72 flex-shrink-0 flex flex-col bg-muted/20 border border-border rounded-xl border-t-4 ${col.color}`}>
                    {/* Column header */}
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card rounded-t-[10px]">
                      <h3 className="font-semibold text-sm">{col.title}</h3>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-mono font-semibold">
                        {cards.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                      {cards.length === 0 ? (
                        <div className="flex items-center justify-center h-20 border-2 border-dashed border-border rounded-lg">
                          <span className="text-xs text-muted-foreground">No {col.title.toLowerCase()} orders</span>
                        </div>
                      ) : (
                        cards.map(wo => (
                          <WOCard
                            key={wo.id}
                            wo={wo}
                            onMove={moveCard}
                            isLast={col.id === "verified"}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </AppLayout>
    </>
  );
}
