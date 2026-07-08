import { AppLayout } from "@/components/layout";
import { Settings as SettingsIcon, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export default function Settings() {
  const { theme, setTheme } = useTheme();

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center">
            <SettingsIcon className="w-6 h-6 mr-2 text-primary" />
            System Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure your control room interface preferences.</p>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Appearance</h2>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Theme</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setTheme("light")}
                  className={`flex flex-col items-center justify-center p-4 border rounded-md transition-colors ${
                    theme === "light" ? "border-primary bg-primary/5 text-primary" : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Sun className="w-6 h-6 mb-2" />
                  <span className="text-sm font-medium">Light</span>
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={`flex flex-col items-center justify-center p-4 border rounded-md transition-colors ${
                    theme === "dark" ? "border-primary bg-primary/5 text-primary" : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Moon className="w-6 h-6 mb-2" />
                  <span className="text-sm font-medium">Dark</span>
                </button>
                <button
                  onClick={() => setTheme("system")}
                  className={`flex flex-col items-center justify-center p-4 border rounded-md transition-colors ${
                    theme === "system" ? "border-primary bg-primary/5 text-primary" : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Monitor className="w-6 h-6 mb-2" />
                  <span className="text-sm font-medium">System</span>
                </button>
              </div>
            </div>
            
            <div className="pt-4 border-t border-border mt-4">
              <p className="text-sm text-muted-foreground">
                Note: The primary intended use for Solar SCADA is Dark Mode for low eye strain in control room environments.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
