import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, X, CheckCheck, ExternalLink, AlertTriangle, Wrench, Zap, Info,
} from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL;

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  resourceType?: string;
  resourceUrl?: string;
  isRead: boolean;
  createdAt: string;
}

interface NotifResponse {
  data: Notification[];
  page: number;
  hasMore: boolean;
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "alarm.critical": AlertTriangle,
  "alarm.major":    AlertTriangle,
  "alarm.minor":    Info,
  "work_order.status":  Wrench,
  "work_order.created": Wrench,
  "device.offline": Zap,
};

const TYPE_COLOR: Record<string, string> = {
  "alarm.critical": "text-status-fault border-status-fault bg-status-fault/10",
  "alarm.major":    "text-[#e67e22] border-[#e67e22] bg-[#e67e22]/10",
  "alarm.minor":    "text-blue-400 border-blue-400 bg-blue-400/10",
  "work_order.status":  "text-brand border-brand bg-brand/10",
  "work_order.created": "text-brand border-brand bg-brand/10",
  "device.offline": "text-muted-foreground border-border/50 bg-black/40",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `T-${mins}M`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `T-${hrs}H`;
  return `T-${Math.floor(hrs / 24)}D`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

/* ── Unread count hook (used by bell badge) ──────────────────────────── */

export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => fetchJson(`${BASE}api/notifications/unread-count`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/* ── Bell button + panel ─────────────────────────────────────────────── */

export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { data: countData } = useUnreadCount();
  const unread = countData?.count ?? 0;

  // Close panel when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="SYSTEM ALERTS"
        className={`relative w-8 h-8 border flex items-center justify-center transition-colors ${
          open
            ? "border-brand text-brand bg-brand/10 shadow-[0_0_10px_rgba(0,255,170,0.2)]"
            : "border-border/50 text-muted-foreground bg-black/40 hover:text-brand hover:border-brand/50"
        } ${className ?? ""}`}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center bg-status-fault text-white text-[8px] font-mono font-bold px-1 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <NotificationPanel onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/* ── Slide-over panel ────────────────────────────────────────────────── */

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<NotifResponse>({
    queryKey: ["notifications", "list"],
    queryFn: () => fetchJson(`${BASE}api/notifications?limit=50`),
    staleTime: 10_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${BASE}api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await fetch(`${BASE}api/notifications/read-all`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notifications = data?.data ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    /* Fixed panel anchored to the sidebar — slides in from left edge */
    <div className="absolute left-full top-0 ml-4 w-96 bg-black/95 border border-brand/50 shadow-[0_0_30px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,255,170,0.05)] z-[200] flex flex-col max-h-[85vh] overflow-hidden backdrop-blur-xl">
      <div className="absolute top-0 left-0 w-full h-1 bg-brand" />
      
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0 bg-black/80">
        <div className="flex items-center gap-3">
          <Bell className="h-4 w-4 text-brand" />
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-foreground">SYSTEM LOGS</span>
          {unreadCount > 0 && (
            <span className="font-mono text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 border border-status-fault text-status-fault bg-status-fault/10 animate-pulse">
              {unreadCount} UNREAD
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground hover:text-brand transition-colors flex items-center gap-1"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              <CheckCheck className="h-3 w-3" /> ACK ALL
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-brand border border-transparent hover:border-brand/50 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-black/60 border border-border/50 animate-pulse" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <Bell className="h-10 w-10 text-muted-foreground/30 mb-4" />
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold text-muted-foreground">LOG BUFFER EMPTY</p>
            <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/60 mt-2">
              AWAITING INCOMING EVENT TELEMETRY
            </p>
          </div>
        ) : (
          <div className="py-2 px-2 space-y-1">
            {notifications.map((notif) => {
              const IconComp = TYPE_ICON[notif.type] ?? Info;
              const colorClass = TYPE_COLOR[notif.type] ?? "text-muted-foreground border-border/50 bg-black/40";

              return (
                <div
                  key={notif.id}
                  className={`p-4 border transition-colors cursor-pointer group ${
                    !notif.isRead 
                      ? "border-brand/50 bg-brand/5 hover:bg-brand/10 hover:border-brand" 
                      : "border-border/30 bg-black/40 hover:border-brand/30 hover:bg-black/60"
                  }`}
                  onClick={() => {
                    if (!notif.isRead) markRead.mutate(notif.id);
                  }}
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`w-8 h-8 border flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                      <IconComp className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <p className={`font-mono text-[10px] uppercase tracking-widest leading-snug truncate ${!notif.isRead ? "font-bold text-foreground" : "text-foreground/70"}`}>
                          {notif.title}
                        </p>
                        {!notif.isRead && (
                          <span className="w-1.5 h-1.5 bg-brand flex-shrink-0 mt-1 shadow-[0_0_5px_rgba(0,255,170,0.8)] animate-pulse" />
                        )}
                      </div>
                      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                        {notif.message}
                      </p>
                      <div className="flex items-center justify-between border-t border-border/30 pt-2">
                        <span className="font-mono text-[8px] uppercase tracking-widest font-bold text-muted-foreground/60">
                          {relativeTime(notif.createdAt)}
                        </span>
                        {notif.resourceUrl && (
                          <Link
                            href={notif.resourceUrl}
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onClose(); }}
                            className="font-mono text-[8px] uppercase tracking-widest font-bold text-brand hover:text-brand/80 flex items-center gap-1 group-hover:underline"
                          >
                            INSPECT <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
