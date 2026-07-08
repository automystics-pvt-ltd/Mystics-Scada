import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Activity, 
  AlertTriangle, 
  Wrench, 
  FileText, 
  Settings, 
  Users, 
  Sun,
  Menu,
  Zap,
  Cpu,
  Power
} from "lucide-react";
import { useState } from "react";
import { useHealthCheck } from "@workspace/api-client-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck({ query: { refetchInterval: 30000, queryKey: ["health"] } });

  const navigation = [
    { name: "Portfolio", href: "/", icon: LayoutDashboard },
    { name: "Alert Center", href: "/alerts", icon: AlertTriangle },
    { name: "Work Orders", href: "/maintenance", icon: Wrench },
    { name: "Reports", href: "/reports", icon: FileText },
  ];

  const adminNav = [
    { name: "Users & Roles", href: "/admin/users", icon: Users },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
          <Zap className="h-6 w-6 text-primary mr-2" />
          <span className="font-bold text-lg tracking-tight">Solar SCADA</span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-2">
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2 px-2">Operations</div>
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <item.icon
                    className={`mr-3 h-5 w-5 flex-shrink-0 ${
                      isActive ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                    }`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <nav className="space-y-1 px-2 mt-8">
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2 px-2">Administration</div>
            {adminNav.map((item) => {
              const isActive = location.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <item.icon
                    className={`mr-3 h-5 w-5 flex-shrink-0 ${
                      isActive ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                    }`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* System Status Footer */}
        <div className="p-4 border-t border-sidebar-border bg-sidebar text-xs">
          <div className="flex items-center justify-between text-sidebar-foreground/70 mb-1">
            <span>System Status</span>
            <div className="flex items-center">
              {health?.status === "ok" ? (
                <><span className="h-2 w-2 rounded-full bg-status-normal mr-1.5 animate-pulse-subtle" /> Online</>
              ) : (
                <><span className="h-2 w-2 rounded-full bg-status-warning mr-1.5" /> Degraded</>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-sidebar-foreground/50">
            <span>Last sync</span>
            <span>Just now</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-background focus:outline-none">
        <div className="py-6 px-8 h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
