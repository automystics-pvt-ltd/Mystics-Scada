import { useForm } from "react-hook-form";
import { Link, useLocation } from "wouter";
import { Zap, Shield, KeyRound } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock login - just redirect
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0 opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-status-normal/10 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl z-10 relative overflow-hidden">
        {/* Header strip */}
        <div className="h-2 w-full bg-gradient-to-r from-primary via-primary to-status-normal" />
        
        <div className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4 border border-border shadow-inner">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Solar SCADA</h1>
            <p className="text-sm text-muted-foreground mt-1">Automystics Technologies</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Operator ID / Email</label>
              <div className="relative">
                <Shield className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input 
                  type="text" 
                  defaultValue="operator@automystics.com"
                  className="w-full bg-input/50 border border-input rounded-md py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all text-foreground"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Access Key</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input 
                  type="password" 
                  defaultValue="••••••••"
                  className="w-full bg-input/50 border border-input rounded-md py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all text-foreground"
                />
              </div>
            </div>

            <button 
              type="submit"
              className="w-full mt-6 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 rounded-md transition-colors flex justify-center items-center shadow-sm"
            >
              Access Control Room
            </button>
          </form>
          
          <div className="mt-8 text-center text-xs text-muted-foreground border-t border-border pt-6">
            <p>Supervisory Control and Data Acquisition</p>
            <p className="mt-1">Version 2.4.1 (Build 890)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
