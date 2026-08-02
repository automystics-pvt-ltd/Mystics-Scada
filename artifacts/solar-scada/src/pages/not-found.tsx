import { Zap, AlertTriangle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      
      <div className="w-full max-w-[400px] z-10 flex flex-col items-center text-center animate-fade-up">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 bg-status-fault/10 border border-status-fault/20 shadow-[0_0_30px_hsl(var(--status-fault)/0.2)] ring-1 ring-status-fault/30">
          <AlertTriangle className="h-10 w-10 text-status-fault" strokeWidth={2} />
        </div>
        
        <h1 className="text-4xl font-bold text-foreground tracking-tight mb-2">404</h1>
        <h2 className="text-xl font-bold text-muted-foreground uppercase tracking-widest mb-6">System Not Found</h2>
        
        <p className="text-sm text-muted-foreground/80 mb-8 max-w-[300px] leading-relaxed">
          The requested interface or control module could not be located in the central SCADA registry.
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 font-semibold px-6 py-3 rounded-lg transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
          Return to Portfolio
        </Link>
      </div>
    </div>
  );
}
