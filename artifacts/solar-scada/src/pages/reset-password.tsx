import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Zap, Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff, KeyRound } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

export default function ResetPassword() {
  const [, setLocation] = useLocation();

  // Read token from ?token= query param
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!token) setError("Invalid or missing reset token. Please request a new link.");
  }, [token]);

  const mismatch = confirm && password !== confirm;
  const weak = password.length > 0 && password.length < 8;
  const canSubmit = !!token && !!password && password === confirm && !weak && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      let b: { ok?: boolean; message?: string } = {};
      try { b = await r.json(); } catch { /* */ }
      if (!r.ok) {
        setError(b.message ?? "Reset failed. The link may have expired.");
        setLoading(false);
        return;
      }
      setDone(true);
      setTimeout(() => setLocation("/login"), 3000);
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

        <div className="bg-card/40 backdrop-blur-xl border border-card-border rounded-xl shadow-2xl p-8 w-full animate-fade-up" style={{ animationDelay: '100ms' }}>
          {done ? (
            <div className="text-center py-4">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-status-normal/10 border border-status-normal/20 flex items-center justify-center shadow-[0_0_15px_hsl(var(--status-normal)/0.15)]">
                  <CheckCircle2 className="h-8 w-8 text-status-normal" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Password updated</h2>
              <p className="text-sm text-muted-foreground">
                Your password has been changed. Redirecting you to sign in…
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-1">
                <KeyRound className="h-5 w-5 text-accent-brand" />
                <h2 className="text-xl font-bold text-foreground">New password</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-8">Choose a strong password (at least 8 characters).</p>

              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">New password</label>
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoFocus
                      placeholder="••••••••"
                      className={`w-full bg-background/50 border rounded-lg px-4 py-2.5 pr-11 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 transition-all ${weak ? "border-status-warning focus:border-status-warning focus:ring-status-warning" : "border-border focus:border-accent-brand focus:ring-accent-brand"}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {weak && <p className="text-xs text-status-warning font-medium mt-1.5">Password must be at least 8 characters.</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Confirm password</label>
                  <input
                    type={showPwd ? "text" : "password"}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    placeholder="••••••••"
                    className={`w-full bg-background/50 border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 transition-all ${mismatch ? "border-status-fault focus:border-status-fault focus:ring-status-fault" : "border-border focus:border-accent-brand focus:ring-accent-brand"}`}
                  />
                  {mismatch && <p className="text-xs text-status-fault font-medium mt-1.5">Passwords don't match.</p>}
                </div>

                {error && (
                  <div className="flex items-start gap-2 bg-status-fault/10 border border-status-fault/20 rounded-lg px-3 py-2 animate-fade-up">
                    <AlertTriangle className="h-4 w-4 text-status-fault mt-0.5 shrink-0" />
                    <p className="text-sm text-status-fault font-medium">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-2.5 rounded-lg transition-all"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {loading ? "Updating…" : "Set new password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
