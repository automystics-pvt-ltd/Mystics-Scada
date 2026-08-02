import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import {
  Zap, Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff, Activity,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";

const BASE = import.meta.env.BASE_URL;

export default function Login() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  // If already authenticated (e.g. AUTH_BYPASS active), skip login
  useEffect(() => {
    if (!isLoading && user) setLocation("/");
  }, [isLoading, user, setLocation]);

  // Show spinner while auth resolves — never flash the form
  if (isLoading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3 bg-black">
        <Activity className="h-5 w-5 text-accent-brand animate-pulse" />
        <span className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Initialising Secure Session…</span>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}api/auth/password-login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      let b: { ok?: boolean; message?: string } = {};
      try { b = await r.json(); } catch { /* non-JSON body (e.g. 404 HTML) */ }
      if (!r.ok) {
        setError(b.message ?? `Server error ${r.status} — try again or contact your administrator.`);
        setLoading(false);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      setLocation("/");
    } catch {
      setError("Network error — could not reach the server.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-black relative overflow-hidden">
      {/* Background grid/noise */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-accent-brand/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[400px] z-10 flex flex-col">
        {/* Brand header */}
        <div className="flex flex-col items-start mb-8 select-none animate-fade-up">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-5 bg-card border border-card-border shadow-[0_0_20px_rgba(20,205,230,0.15)] ring-1 ring-accent-brand/20">
            <Zap className="h-6 w-6 text-accent-brand" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Solar SCADA</h1>
          <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest mt-2">Automystics Technologies</p>
        </div>

        {/* Login card */}
        <div className="bg-card/40 backdrop-blur-xl border border-card-border rounded-xl shadow-2xl p-8 w-full animate-fade-up" style={{ animationDelay: '100ms' }}>
          <h2 className="text-xl font-bold text-foreground mb-1">Operator Login</h2>
          <p className="text-sm text-muted-foreground mb-8">Authenticate to access control systems.</p>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="operator@automystics.com"
                className="w-full bg-background/50 border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent-brand focus:border-accent-brand transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-accent-brand hover:text-accent-brand/80 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-background/50 border border-border rounded-lg px-4 py-2.5 pr-11 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent-brand focus:border-accent-brand transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-status-fault/10 border border-status-fault/20 rounded-lg px-3 py-2 animate-fade-up">
                <AlertTriangle className="h-4 w-4 text-status-fault mt-0.5 shrink-0" />
                <p className="text-sm text-status-fault font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-2.5 rounded-lg transition-all"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {loading ? "Authenticating…" : "Access System"}
            </button>
          </form>
        </div>

        <div className="mt-8 flex justify-between items-center text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest animate-fade-up" style={{ animationDelay: '200ms' }}>
          <span>SCADA.SYS V2.4.1</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-subtle" />
            System Online
          </span>
        </div>
      </div>
    </div>
  );
}
