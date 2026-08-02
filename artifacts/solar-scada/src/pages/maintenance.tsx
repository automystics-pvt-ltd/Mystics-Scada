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
import { Wrench, Plus, Clock, User, AlertCircle, AlertTriangle, Calendar, X, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

/* ── Helpers ──────────────────────────────────────────────────────────── */

const KANBAN_COLUMNS: { id: WorkOrderStatus; title: string; color: string }[] = [
  { id: "open",        title: "PENDING ASSIGNMENT",        color: "bg-muted-foreground/50 border-muted-foreground" },
  { id: "assigned",    title: "ASSIGNED TO ENG",           color: "bg-blue-500/50 border-blue-500" },
  { id: "in_progress", title: "ACTIVE RESOLUTION",         color: "bg-status-warning/50 border-status-warning" },
  { id: "resolved",    title: "RESOLUTION LOGGED",         color: "bg-status-normal/50 border-status-normal" },
  { id: "verified",    title: "VERIFIED CLEAR",            color: "bg-brand/50 border-brand" },
];

const PRIORITY_LEFT: Record<WorkOrderPriority, string> = {
  critical: "border-l-status-fault",
  high:     "border-l-[#e67e22]",
  medium:   "border-l-status-warning",
  low:      "border-l-muted-foreground",
};

const PRIORITY_BADGE: Record<WorkOrderPriority, string> = {
  critical: "bg-status-fault/10 text-status-fault border-status-fault shadow-[0_0_10px_rgba(239,68,68,0.3)]",
  high:     "bg-[#e67e22]/10 text-[#e67e22] border-[#e67e22] shadow-[0_0_10px_rgba(230,126,34,0.3)]",
  medium:   "bg-status-warning/10 text-status-warning border-status-warning shadow-[0_0_10px_rgba(251,191,36,0.3)]",
  low:      "bg-card/40 text-muted-foreground border-border/50",
};

function formatDue(dueDate: Date | string | null): { label: string; overdue: boolean } {
  if (!dueDate) return { label: "NO DEADLINE SET", overdue: false };
  const d = new Date(dueDate as string);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH  = Math.round(diffMs / 3600000);
  const overdue = diffMs < 0;
  if (overdue) return { label: `SLA OVERDUE: ${Math.abs(diffH)}H`, overdue: true };
  if (diffH < 24) return { label: `SLA TARGET: T-${diffH}H`, overdue: false };
  const diffD = Math.floor(diffH / 24);
  return { label: `SLA TARGET: T-${diffD}D`, overdue: false };
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-card/80 backdrop-blur-sm p-4">
      <div className="bg-card/90 border border-brand/50 w-full max-w-md shadow-[0_0_30px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,255,170,0.05)] rounded-none relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-brand" />
        
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <h2 className="font-mono text-base font-bold uppercase tracking-widest text-brand flex items-center gap-3">
            <Wrench className="w-5 h-5" />
            INITIALIZE WORK ORDER
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-brand transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 bg-brand inline-block" /> EQUIPMENT TARGET *
            </label>
            <input
              required
              value={form.equipment}
              onChange={e => setForm(f => ({ ...f, equipment: e.target.value }))}
              placeholder="e.g. INVERTER-03"
              className="w-full bg-card/40 border border-border/50 rounded-none px-3 py-2 font-mono text-sm focus:outline-none focus:border-brand/50 focus:ring-0 text-foreground uppercase"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 bg-brand inline-block" /> FAULT TELEMETRY *
            </label>
            <textarea
              required
              rows={3}
              value={form.faultDescription}
              onChange={e => setForm(f => ({ ...f, faultDescription: e.target.value }))}
              placeholder="DESCRIBE OBSERVED ANOMALY..."
              className="w-full bg-card/40 border border-border/50 rounded-none px-3 py-2 font-mono text-sm focus:outline-none focus:border-brand/50 focus:ring-0 resize-none text-foreground uppercase"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 bg-brand inline-block" /> PRIORITY LEVEL
              </label>
              <div className="relative">
                <select
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value as WorkOrderPriority }))}
                  className="w-full appearance-none bg-card/40 border border-border/50 rounded-none px-3 py-2 font-mono text-sm focus:outline-none focus:border-brand/50 focus:ring-0 pr-8 text-foreground uppercase"
                >
                  <option value="low">LOW</option>
                  <option value="medium">MEDIUM</option>
                  <option value="high">HIGH</option>
                  <option value="critical">CRITICAL</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 bg-brand inline-block" /> SLA DEADLINE
              </label>
              <input
                type="datetime-local"
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className="w-full bg-card/40 border border-border/50 rounded-none px-3 py-2 font-mono text-[10px] uppercase focus:outline-none focus:border-brand/50 focus:ring-0 text-brand"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-brand flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 bg-brand inline-block" /> ASSIGN ENGINEER
            </label>
            <input
              value={form.assignedTo}
              onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
              placeholder="OPERATOR IDENTIFIER (OPTIONAL)"
              className="w-full bg-card/40 border border-border/50 rounded-none px-3 py-2 font-mono text-sm focus:outline-none focus:border-brand/50 focus:ring-0 text-foreground uppercase"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-border/50">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border/50 bg-card/40 font-mono text-[10px] uppercase tracking-widest font-bold text-muted-foreground hover:bg-white/5 transition-colors"
            >
              ABORT
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 border border-brand bg-brand/10 font-mono text-[10px] uppercase tracking-widest font-bold text-brand hover:bg-brand/20 transition-colors shadow-[0_0_10px_rgba(0,255,170,0.2)] disabled:opacity-50"
            >
              {submitting ? "INITIALIZING..." : "EXECUTE INITIATION"}
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
    <div className={`border border-border/50 bg-card/60 border-l-[3px] ${PRIORITY_LEFT[wo.priority]} p-4 relative group hover:border-r-brand/50 transition-all`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">WO-{wo.id.substring(0, 6).toUpperCase()}</span>
        <span className={`px-2 py-0.5 font-mono text-[8px] uppercase tracking-widest font-bold border ${PRIORITY_BADGE[wo.priority]}`}>
          {wo.priority}
        </span>
      </div>

      {/* Title */}
      <h4 className="font-mono text-xs font-bold mb-1 leading-snug text-foreground line-clamp-2 uppercase">{wo.faultDescription}</h4>
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-4 bg-white/5 inline-block px-2 py-0.5 border border-border/50">
        {wo.plantName} // {wo.equipment}
      </p>

      {/* SLA breach */}
      {wo.slaBreached && (
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest font-bold text-status-fault bg-status-fault/10 border border-status-fault/30 px-2 py-1 mb-3 animate-pulse">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          SLA PROTOCOL BREACHED
        </div>
      )}

      {/* Due date */}
      {wo.dueDate && (
        <div className={`flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest mb-3 ${due.overdue ? "text-status-fault font-bold" : "text-brand"}`}>
          <Calendar className="w-3 h-3 flex-shrink-0" />
          {due.label}
        </div>
      )}

      {/* Root cause snippet */}
      {wo.rootCause && (
        <div className="border-l-2 border-brand/50 pl-2 mb-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground line-clamp-2 bg-card/40 p-1.5">
          <span className="font-bold text-brand">RCA: </span>{wo.rootCause}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50 mt-auto">
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          <User className="w-3 h-3" />
          <span className={wo.assignedTo ? "text-foreground font-bold" : "opacity-50"}>{wo.assignedTo ?? "UNASSIGNED"}</span>
        </div>
        {!isLast && (
          <button
            onClick={() => onMove(wo.id, wo.status)}
            className="font-mono text-[9px] uppercase tracking-widest font-bold px-2 py-1 border border-brand/50 text-brand bg-brand/5 hover:bg-brand/20 transition-colors opacity-0 group-hover:opacity-100"
          >
            ADVANCE &gt;
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
        <div className="flex flex-col h-[calc(100vh-100px)] space-y-6">

          {/* Header */}
          <div className="border border-border/50 bg-card/40 p-5 relative flex-shrink-0 flex flex-wrap justify-between items-start gap-4">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
            <div>
              <h1 className="text-xl font-mono font-bold uppercase tracking-widest text-foreground flex items-center gap-3">
                <Wrench className="w-5 h-5 text-brand" />
                MAINTENANCE OPERATIONS LOG
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2 ml-8">
                O&M WORKFLOW PIPELINE // DRAG TO ADVANCE STATE
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="font-mono text-[10px] uppercase tracking-widest font-bold border border-brand bg-brand/10 text-brand hover:bg-brand/20 px-4 py-2 flex items-center gap-2 transition-colors shadow-[0_0_10px_rgba(0,255,170,0.2)]"
            >
              <Plus className="w-3.5 h-3.5" /> INITIATE WORK ORDER
            </button>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
            <div className="border border-border/50 bg-card/60 p-4 relative">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-brand shadow-[0_0_10px_rgba(0,255,170,0.5)]" />
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2"><Clock className="w-3 h-3 text-brand" /> ACTIVE TICKETS</div>
              <div className="font-mono text-2xl font-bold text-foreground">{isLoading ? "..." : stats.open}</div>
            </div>
            <div className="border border-border/50 bg-card/60 p-4 relative">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-status-fault shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-pulse" />
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2"><AlertCircle className="w-3 h-3 text-status-fault" /> CRITICAL INCIDENTS</div>
              <div className="font-mono text-2xl font-bold text-status-fault">{isLoading ? "..." : stats.critical}</div>
            </div>
            <div className="border border-border/50 bg-card/60 p-4 relative">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-status-warning shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-status-warning" /> SLA BREACHED</div>
              <div className="font-mono text-2xl font-bold text-status-warning">{isLoading ? "..." : stats.breached}</div>
            </div>
            <div className="border border-border/50 bg-card/60 p-4 relative">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-status-normal shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2"><Wrench className="w-3 h-3 text-status-normal" /> VERIFIED LOGS</div>
              <div className="font-mono text-2xl font-bold text-status-normal">{isLoading ? "..." : stats.done}</div>
            </div>
          </div>

          {/* Kanban board */}
          <div className="flex-1 overflow-x-auto min-h-0 custom-scrollbar border border-border/50 bg-card/40 p-4">
            <div className="flex gap-4 h-full" style={{ minWidth: `${KANBAN_COLUMNS.length * 320 + 64}px` }}>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="w-[300px] flex-shrink-0 bg-card/60 border border-border/50 animate-pulse" />
                ))
              ) : KANBAN_COLUMNS.map(col => {
                const cards = cardsFor(col.id);
                return (
                  <div key={col.id} className="w-[300px] flex-shrink-0 flex flex-col bg-card/60 border border-border/50 relative">
                    <div className={`absolute top-0 left-0 w-full h-1 ${col.color}`} />
                    
                    {/* Column header */}
                    <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between bg-card/80">
                      <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 inline-block ${col.color}`} />
                        {col.title}
                      </h3>
                      <span className="font-mono text-[9px] uppercase tracking-widest text-brand bg-brand/10 border border-brand/30 px-2 py-0.5">
                        {cards.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                      {cards.length === 0 ? (
                        <div className="flex items-center justify-center h-20 border border-dashed border-border/50 bg-card/40">
                          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">NO TICKETS IN QUEUE</span>
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
