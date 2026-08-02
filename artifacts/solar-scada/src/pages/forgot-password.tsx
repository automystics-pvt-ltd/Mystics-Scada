import { useState } from "react";
import { Link } from "wouter";
import { Zap, Loader2, Mail, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

export default function ForgotPassword() {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Always show success — never leak whether an email exists
      if (r.ok || r.status === 404) {
        setSent(true);
      } else {
        let b: { message?: string } = {};
        try { b = await r.json(); } catch { /* */ }
        setError(b.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error — could not reach the server.");
    }
    setLoading(false);
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
          {sent ? (
            <div className="text-center py-4">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-status-normal/10 border border-status-normal/20 flex items-center justify-center shadow-[0_0_15px_hsl(var(--status-normal)/0.15)]">
                  <CheckCircle2 className="h-8 w-8 text-status-normal" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Check your email</h2>
              <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
                If <strong className="text-foreground font-mono">{email}</strong> has an account, a password reset link has been sent. Check your inbox (and spam folder).
              </p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full bg-muted/30 hover:bg-muted/50 border border-border text-foreground font-semibold py-2.5 rounded-lg transition-all"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-1">
                <Mail className="h-5 w-5 text-accent-brand" />
                <h2 className="text-xl font-bold text-foreground">Reset password</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-8">
                Enter your email and we'll send you a reset link.
              </p>

              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Email address
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

                {error && (
                  <div className="flex items-start gap-2 bg-status-fault/10 border border-status-fault/20 rounded-lg px-3 py-2 animate-fade-up">
                    <AlertTriangle className="h-4 w-4 text-status-fault mt-0.5 shrink-0" />
                    <p className="text-sm text-status-fault font-medium">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-2.5 rounded-lg transition-all"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {loading ? "Sending…" : "Send reset link"}
                </button>

                <div className="text-center pt-2">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-accent-brand transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to sign in
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
