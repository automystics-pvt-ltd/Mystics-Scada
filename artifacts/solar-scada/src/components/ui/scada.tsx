import { HealthState, AlertSeverity, AlertStatus } from "@workspace/api-client-react";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Activity } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function HealthBadge({ status, className }: { status: HealthState; className?: string }) {
  switch (status) {
    case "normal":
      return (
        <div className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-normal/10 text-status-normal border border-status-normal/20", className)}>
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Normal
        </div>
      );
    case "warning":
      return (
        <div className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-warning/10 text-status-warning border border-status-warning/20", className)}>
          <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Warning
        </div>
      );
    case "fault":
      return (
        <div className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-fault/10 text-status-fault border border-status-fault/20", className)}>
          <XCircle className="w-3.5 h-3.5 mr-1" /> Fault
        </div>
      );
    case "offline":
      return (
        <div className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-offline/10 text-status-offline border border-status-offline/20", className)}>
          <HelpCircle className="w-3.5 h-3.5 mr-1" /> Offline
        </div>
      );
  }
}

export function SeverityBadge({ severity, className }: { severity: AlertSeverity; className?: string }) {
  switch (severity) {
    case "critical":
      return <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-fault/10 text-status-fault border border-status-fault/20", className)}>Critical</span>;
    case "major":
      return <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-warning/10 text-[#e67e22] border border-[#e67e22]/20", className)}>Major</span>;
    case "minor":
      return <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-status-warning/10 text-status-warning border border-status-warning/20", className)}>Minor</span>;
    case "informational":
      return <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20", className)}>Info</span>;
  }
}

export function LiveValue({ 
  value, 
  unit, 
  precision = 1,
  className,
  valueClassName
}: { 
  value: number | undefined | null; 
  unit: string; 
  precision?: number;
  className?: string;
  valueClassName?: string;
}) {
  if (value === undefined || value === null) return <span className={cn("text-muted-foreground", className)}>-- {unit}</span>;
  
  return (
    <div className={cn("inline-flex items-baseline font-mono", className)}>
      <span className={cn("font-medium tracking-tight text-foreground", valueClassName)}>
        {value.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}
      </span>
      <span className="ml-1 text-xs text-muted-foreground font-sans">{unit}</span>
    </div>
  );
}

export function KpiCard({
  title,
  value,
  unit,
  precision = 1,
  icon: Icon,
  trend,
  className,
  loading = false,
}: {
  title: string;
  value?: number;
  unit: string;
  precision?: number;
  icon?: any;
  trend?: { value: number; label: string; positive: boolean };
  className?: string;
  loading?: boolean;
}) {
  return (
    <div className={cn("bg-card border border-card-border rounded-lg p-4 flex flex-col", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground/50" />}
      </div>
      {loading ? (
        <div className="h-8 w-24 bg-muted animate-pulse rounded mt-1"></div>
      ) : (
        <div className="flex flex-col">
          <LiveValue value={value} unit={unit} precision={precision} valueClassName="text-2xl" />
          {trend && (
            <div className="mt-2 flex items-center text-xs">
              <span className={cn("font-medium", trend.positive ? "text-status-normal" : "text-status-fault")}>
                {trend.value > 0 ? "+" : ""}{trend.value}%
              </span>
              <span className="ml-1.5 text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
