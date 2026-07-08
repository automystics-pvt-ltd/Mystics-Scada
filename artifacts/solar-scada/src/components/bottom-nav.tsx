import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  AlertTriangle,
  Wrench,
  Brain,
  MoreHorizontal,
} from "lucide-react";

const BOTTOM_NAV = [
  { name: "Portfolio",   href: "/",          icon: LayoutDashboard },
  { name: "Insights",    href: "/insights",   icon: Brain           },
  { name: "Alerts",      href: "/alerts",     icon: AlertTriangle   },
  { name: "Work Orders", href: "/maintenance",icon: Wrench          },
  { name: "More",        href: "/settings",   icon: MoreHorizontal  },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-sidebar-border safe-area-bottom">
      <div className="flex items-stretch">
        {BOTTOM_NAV.map((item) => {
          const isActive =
            location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.name} href={item.href} className="flex-1">
              <div
                className={`flex flex-col items-center justify-center min-h-[56px] py-2 px-1 gap-0.5 transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span className={`text-[10px] font-medium leading-none ${isActive ? "text-primary" : ""}`}>
                  {item.name}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
