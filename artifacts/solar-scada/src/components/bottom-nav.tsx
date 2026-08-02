import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, AlertTriangle, Wrench, Brain, MoreHorizontal,
  Cpu, BookOpen, Activity, Database, FileText, Building2,
  Settings, X, ChevronRight, Server, FolderDown,
} from "lucide-react";

// Primary 4 items always visible
const PRIMARY_NAV = [
  { name: "PORTFOLIO",   href: "/",           icon: LayoutDashboard },
  { name: "ALERTS",      href: "/alerts",      icon: AlertTriangle   },
  { name: "WORK ORDERS", href: "/maintenance", icon: Wrench          },
  { name: "DIAGNOSTICS", href: "/insights",    icon: Brain           },
];

// All remaining items shown in the "More" drawer
const MORE_NAV = [
  { name: "DEV TEMPLATES",   href: "/device-templates",    icon: BookOpen   },
  { name: "DRIVER HEALTH",   href: "/driver-health",       icon: Activity   },
  { name: "CONNECT SOURCE",  href: "/connect-data-source", icon: Database   },
  { name: "FTP PIPELINES",   href: "/ftp-sources",         icon: Server     },
  { name: "AUTO-PROVISION",  href: "/autoprovision",       icon: FolderDown },
  { name: "REPORTS",         href: "/reports",             icon: FileText   },
  { name: "ORGANISATION",    href: "/org",                 icon: Building2  },
  { name: "SETTINGS",        href: "/settings",            icon: Settings   },
];

export function BottomNav() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = MORE_NAV.some(
    (item) => location === item.href || (item.href !== "/" && location.startsWith(item.href)),
  );

  return (
    <>
      {/* Backdrop */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-card/80 backdrop-blur-sm"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More drawer — slides up from bottom */}
      <div
        className={`md:hidden fixed bottom-[57px] left-0 right-0 z-50 bg-card/95 border-t border-brand/50 shadow-[0_-10px_30px_rgba(0,255,170,0.1)] transition-transform duration-300 ${
          moreOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-brand">EXTENDED MENUS</span>
          <button
            onClick={() => setMoreOpen(false)}
            className="p-1 border border-transparent text-muted-foreground hover:text-brand hover:border-brand/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 py-2 grid grid-cols-2 gap-1 max-h-[60vh] overflow-y-auto pb-safe custom-scrollbar">
          {MORE_NAV.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href} onClick={() => setMoreOpen(false)} className="group">
                <div className={`flex items-center gap-2 px-3 py-3 border transition-colors ${
                  isActive
                    ? "bg-brand/10 border-brand text-brand shadow-[inset_0_0_10px_rgba(0,255,170,0.2)]"
                    : "bg-card/40 border-border/50 text-muted-foreground group-hover:bg-brand/5 group-hover:border-brand/50 group-hover:text-brand"
                }`}>
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="font-mono text-[9px] font-bold tracking-widest uppercase">{item.name}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 border-t border-brand/50 backdrop-blur-md">
        <div className="flex items-stretch">
          {PRIMARY_NAV.map((item) => {
            const isActive =
              location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href} className="flex-1">
                <div className={`flex flex-col items-center justify-center min-h-[57px] py-2 px-1 gap-1 transition-colors relative ${
                  isActive
                    ? "text-brand"
                    : "text-muted-foreground hover:text-foreground"
                }`}>
                  {isActive && <div className="absolute top-0 left-0 w-full h-0.5 bg-brand shadow-[0_0_10px_rgba(0,255,170,0.5)]" />}
                  <item.icon className={`h-5 w-5 flex-shrink-0 ${isActive ? "drop-shadow-[0_0_8px_rgba(0,255,170,0.8)]" : ""}`} />
                  <span className="font-mono text-[8px] uppercase tracking-widest font-bold leading-none">{item.name}</span>
                </div>
              </Link>
            );
          })}

          {/* More button */}
          <button className="flex-1" onClick={() => setMoreOpen((o) => !o)}>
            <div className={`flex flex-col items-center justify-center min-h-[57px] py-2 px-1 gap-1 transition-colors relative ${
              moreActive || moreOpen
                ? "text-brand"
                : "text-muted-foreground hover:text-foreground"
            }`}>
              {(moreActive || moreOpen) && <div className="absolute top-0 left-0 w-full h-0.5 bg-brand shadow-[0_0_10px_rgba(0,255,170,0.5)]" />}
              <MoreHorizontal className={`h-5 w-5 flex-shrink-0 ${(moreActive || moreOpen) ? "drop-shadow-[0_0_8px_rgba(0,255,170,0.8)]" : ""}`} />
              <span className="font-mono text-[8px] uppercase tracking-widest font-bold leading-none">MORE</span>
            </div>
          </button>
        </div>
      </nav>
    </>
  );
}
