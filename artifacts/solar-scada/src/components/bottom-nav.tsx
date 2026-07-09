import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, AlertTriangle, Wrench, Brain, MoreHorizontal,
  Cpu, BookOpen, Activity, Database, FileText, Building2,
  Settings, Users, Shield, X, ChevronRight,
} from "lucide-react";

// Primary 4 items always visible
const PRIMARY_NAV = [
  { name: "Portfolio",   href: "/",           icon: LayoutDashboard },
  { name: "Alerts",      href: "/alerts",      icon: AlertTriangle   },
  { name: "Work Orders", href: "/maintenance", icon: Wrench          },
  { name: "Insights",    href: "/insights",    icon: Brain           },
];

// All remaining items shown in the "More" drawer
const MORE_NAV = [
  { name: "Devices",        href: "/devices",             icon: Cpu      },
  { name: "Dev Templates",  href: "/device-templates",    icon: BookOpen },
  { name: "Driver Health",  href: "/driver-health",       icon: Activity },
  { name: "Connect Source", href: "/connect-data-source", icon: Database },
  { name: "Reports",        href: "/reports",             icon: FileText },
  { name: "Organisation",   href: "/org",                 icon: Building2 },
  { name: "Settings",       href: "/settings",            icon: Settings  },
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
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More drawer — slides up from bottom */}
      <div
        className={`md:hidden fixed bottom-[57px] left-0 right-0 z-50 bg-sidebar border-t border-sidebar-border rounded-t-2xl shadow-2xl transition-transform duration-300 ${
          moreOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-sidebar-border">
          <span className="text-sm font-semibold text-sidebar-foreground">All Pages</span>
          <button
            onClick={() => setMoreOpen(false)}
            className="h-7 w-7 flex items-center justify-center rounded-full bg-muted/30 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 py-2 grid grid-cols-2 gap-1 max-h-[60vh] overflow-y-auto pb-safe">
          {MORE_NAV.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href} onClick={() => setMoreOpen(false)}>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground/70 hover:bg-muted/20 hover:text-sidebar-foreground"
                }`}>
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-40" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-sidebar-border">
        <div className="flex items-stretch">
          {PRIMARY_NAV.map((item) => {
            const isActive =
              location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href} className="flex-1">
                <div className={`flex flex-col items-center justify-center min-h-[57px] py-2 px-1 gap-0.5 transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
                }`}>
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-[10px] font-medium leading-none">{item.name}</span>
                </div>
              </Link>
            );
          })}

          {/* More button */}
          <button className="flex-1" onClick={() => setMoreOpen((o) => !o)}>
            <div className={`flex flex-col items-center justify-center min-h-[57px] py-2 px-1 gap-0.5 transition-colors ${
              moreActive || moreOpen
                ? "text-primary"
                : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
            }`}>
              <MoreHorizontal className="h-5 w-5 flex-shrink-0" />
              <span className="text-[10px] font-medium leading-none">More</span>
            </div>
          </button>
        </div>
      </nav>
    </>
  );
}
