import { Link, useLocation } from "wouter";
import { Building2, Users, Bell, ScrollText, Router as RouterIcon } from "lucide-react";

const tabs = [
  { label: "Profile",       href: "/org",               icon: Building2 },
  { label: "Users",         href: "/org/users",          icon: Users     },
  { label: "Notifications", href: "/org/notifications",  icon: Bell      },
  { label: "Gateways",      href: "/org/gateways",       icon: RouterIcon },
  { label: "Audit Log",     href: "/org/audit-log",      icon: ScrollText },
];

export function OrgNav() {
  const [location] = useLocation();

  return (
    <div className="flex border-b border-border mb-6">
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/org"
            ? location === "/org" || location === "/org/"
            : location.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href}>
            <div
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
