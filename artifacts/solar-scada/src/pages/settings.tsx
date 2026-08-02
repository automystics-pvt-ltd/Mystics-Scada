import { AppLayout } from "@/components/layout";
import { Settings as SettingsIcon, Monitor, Moon, Sun, Shield, Lock, Bell, User } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export default function Settings() {
  const { theme, setTheme } = useTheme();

  return (
    <AppLayout>
      <div className="flex flex-col h-full space-y-6 max-w-4xl mx-auto">
        
        <div className="flex items-start justify-between animate-fade-up">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <SettingsIcon className="w-7 h-7 text-accent-brand" />
              Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Manage your operator profile and terminal preferences
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-fade-up" style={{ animationDelay: '50ms' }}>
          
          {/* Sidebar Nav */}
          <div className="flex flex-col space-y-1">
            <button className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-bold bg-accent-brand/10 text-accent-brand border border-accent-brand/20">
              <Monitor className="w-4 h-4" /> Appearance
            </button>
            <button className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-card hover:text-foreground transition-colors">
              <User className="w-4 h-4" /> Profile
            </button>
            <button className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-card hover:text-foreground transition-colors">
              <Lock className="w-4 h-4" /> Security
            </button>
            <button className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-card hover:text-foreground transition-colors">
              <Bell className="w-4 h-4" /> Notifications
            </button>
          </div>

          {/* Main Content Area */}
          <div className="md:col-span-3 space-y-6">
            <div className="bg-card/40 backdrop-blur-md border border-card-border rounded-xl shadow-sm p-8">
              <div className="mb-6 border-b border-border/50 pb-6">
                <h2 className="text-lg font-bold text-foreground">Theme Preference</h2>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1.5">
                  Select the visual appearance of the SCADA terminal
                </p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  onClick={() => setTheme("light")}
                  className={`flex flex-col items-center justify-center p-6 border rounded-xl transition-all ${
                    theme === "light" ? "border-accent-brand bg-accent-brand/5 text-accent-brand ring-1 ring-accent-brand/20 shadow-sm" : "border-card-border bg-card/50 text-muted-foreground hover:bg-card hover:border-border"
                  }`}
                >
                  <Sun className="w-8 h-8 mb-3" />
                  <span className="text-xs font-bold uppercase tracking-widest">Light</span>
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={`flex flex-col items-center justify-center p-6 border rounded-xl transition-all ${
                    theme === "dark" ? "border-accent-brand bg-accent-brand/5 text-accent-brand ring-1 ring-accent-brand/20 shadow-[0_0_15px_hsl(var(--accent-brand)/0.1)]" : "border-card-border bg-card/50 text-muted-foreground hover:bg-card hover:border-border"
                  }`}
                >
                  <Moon className="w-8 h-8 mb-3" />
                  <span className="text-xs font-bold uppercase tracking-widest">Dark (Default)</span>
                </button>
                <button
                  onClick={() => setTheme("system")}
                  className={`flex flex-col items-center justify-center p-6 border rounded-xl transition-all ${
                    theme === "system" ? "border-accent-brand bg-accent-brand/5 text-accent-brand ring-1 ring-accent-brand/20 shadow-sm" : "border-card-border bg-card/50 text-muted-foreground hover:bg-card hover:border-border"
                  }`}
                >
                  <Monitor className="w-8 h-8 mb-3" />
                  <span className="text-xs font-bold uppercase tracking-widest">System</span>
                </button>
              </div>
              
              <div className="mt-8 bg-accent-brand/5 border border-accent-brand/20 rounded-lg p-4 flex items-start gap-3">
                <Shield className="w-5 h-5 text-accent-brand shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-foreground">Control Room Standard</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Solar SCADA is designed primarily for dark mode to reduce eye strain in low-light control room environments during extended monitoring sessions.
                  </p>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
