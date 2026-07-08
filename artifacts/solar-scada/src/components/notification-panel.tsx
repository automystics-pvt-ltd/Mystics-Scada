import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, X, CheckCheck, ExternalLink, AlertTriangle, Wrench, Zap, Info,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

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
  "alarm.critical": "text-status-fault bg-status-fault/10",
  "alarm.major":    "text-status-warning bg-status-warning/10",
  "alarm.minor":    "text-blue-400 bg-blue-400/10",
  "work_order.status":  "text-primary bg-primary/10",
  "work_order.created": "text-primary bg-primary/10",
  "device.offline": "text-muted-foreground bg-muted/30",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
        title="Notifications"
        className={`relative w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
          open
            ? "text-primary bg-primary/20"
            : "text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
        } ${className ?? ""}`}
      >
        <Bell className="h-3.5 w-3.5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-status-fault text-[9px] font-bold text-white px-0.5">
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
    <div className="absolute left-full top-0 ml-2 w-80 bg-popover border border-border rounded-xl shadow-2xl z-[200] flex flex-col max-h-[80vh] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Notifications</span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-status-fault/15 text-status-fault">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button
              size="sm" variant="ghost"
              className="h-6 text-[10px] gap-1 px-2 text-muted-foreground"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              <CheckCheck className="h-3 w-3" /> Mark all read
            </Button>
          )}
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 bg-muted/30 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <Bell className="h-8 w-8 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Critical alarms and work order updates will appear here
            </p>
          </div>
        ) : (
          <div className="py-1">
            {notifications.map((notif) => {
              const IconComp = TYPE_ICON[notif.type] ?? Info;
              const colorClass = TYPE_COLOR[notif.type] ?? "text-muted-foreground bg-muted/30";

              return (
                <div
                  key={notif.id}
                  className={`px-4 py-3 border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors cursor-pointer ${
                    !notif.isRead ? "bg-primary/5" : ""
                  }`}
                  onClick={() => {
                    if (!notif.isRead) markRead.mutate(notif.id);
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${colorClass}`}>
                      <IconComp className="h-3.5 w-3.5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-tight ${!notif.isRead ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                          {notif.title}
                        </p>
                        {!notif.isRead && (
                          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-muted-foreground/60">
                          {relativeTime(notif.createdAt)}
                        </span>
                        {notif.resourceUrl && (
                          <Link
                            href={notif.resourceUrl}
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onClose(); }}
                            className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                          >
                            View <ExternalLink className="h-2.5 w-2.5" />
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
