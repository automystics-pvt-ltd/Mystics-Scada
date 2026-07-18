import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Zap, RotateCcw, ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL;

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

// ── Step 1: Email ────────────────────────────────────────────────────────────

function EmailStep({ onSuccess }: {
  onSuccess: (email: string, masked: string, ttl: number, smtp: boolean) => void;
}) {
  const [email, setEmail]   = useState("");
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}api/auth/login/email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const b = await r.json() as {
        ok?: boolean; maskedEmail?: string; expiresInMs?: number;
        mailerEnabled?: boolean; message?: string;
      };
      if (!r.ok) { setError(b.message ?? "Access denied."); return; }
      onSuccess(email.trim().toLowerCase(), b.maskedEmail ?? email, b.expiresInMs ?? 300_000, b.mailerEnabled ?? false);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={go} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Operator Email</label>
        <div className="relative">
          <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
            placeholder="operator@example.com"
            className="w-full bg-input/50 border border-input rounded-md py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email}
        className="w-full mt-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-medium py-2.5 rounded-md transition-colors flex justify-center items-center gap-2 shadow-sm"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Sending code…" : "Send verification code"}
      </button>
    </form>
  );
}

// ── Step 2: OTP ──────────────────────────────────────────────────────────────

function OtpStep({ email, maskedEmail, expiresInMs, smtpEnabled, onBack }: {
  email: string; maskedEmail: string; expiresInMs: number; smtpEnabled: boolean; onBack: () => void;
}) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [otp, setOtp]       = useState("");
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msLeft, setMsLeft]   = useState(expiresInMs);
  const [resendMs, setResendMs] = useState(50_000);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  useEffect(() => {
    if (msLeft <= 0) return;
    const id = setInterval(() => setMsLeft(p => Math.max(0, p - 1000)), 1000);
    return () => clearInterval(id);
  }, [msLeft]);

  useEffect(() => {
    if (resendMs <= 0) return;
    const id = setInterval(() => setResendMs(p => Math.max(0, p - 1000)), 1000);
    return () => clearInterval(id);
  }, [resendMs]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}api/auth/login/verify-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otp.trim() }),
      });
      const b = await r.json() as { ok?: boolean; message?: string };
      if (!r.ok) { setError(b.message ?? "Incorrect code. Please try again."); return; }
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      setLocation("/");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (resendMs > 0) return;
    setError(null);
    try {
      const r = await fetch(`${BASE}api/auth/login/resend`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const b = await r.json() as { ok?: boolean; expiresInMs?: number; message?: string };
      if (r.ok) { setMsLeft(b.expiresInMs ?? 300_000); setResendMs(50_000); setOtp(""); }
      else setError(b.message ?? "Could not resend.");
    } catch {
      setError("Could not reach the server.");
    }
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          We sent a 6-digit code to{" "}
          <span className="font-semibold text-foreground">{maskedEmail}</span>
        </p>
        {!smtpEnabled && (
          <p className="mt-2 text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-1.5">
            Email delivery not configured — contact your administrator for the code.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Verification Code</label>
          <span className={`text-xs font-mono tabular-nums font-semibold ${msLeft < 60_000 ? "text-destructive" : "text-muted-foreground"}`}>
            {msLeft > 0 ? `Expires ${fmt(msLeft)}` : "Expired"}
          </span>
        </div>
        <input
          ref={ref}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={otp}
          onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="• • • • • •"
          required
          autoComplete="one-time-code"
          disabled={msLeft === 0}
          className="w-full bg-input/50 border-2 border-primary/40 focus:border-primary rounded-md py-3 text-center text-2xl font-mono tracking-[0.5em] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        />
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || otp.length < 6 || msLeft === 0}
        className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-medium py-2.5 rounded-md transition-colors flex justify-center items-center gap-2 shadow-sm"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {loading ? "Verifying…" : "Access Control Room"}
      </button>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> Use different email
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={resendMs > 0}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          {resendMs > 0 ? `Resend (${Math.ceil(resendMs / 1000)}s)` : "Resend code"}
        </button>
      </div>
    </form>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Login() {
  const [step, setStep]     = useState<"email" | "otp">("email");
  const [email, setEmail]   = useState("");
  const [masked, setMasked] = useState("");
  const [ttl, setTtl]       = useState(300_000);
  const [smtp, setSmtp]     = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl z-10 relative overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-primary/80 to-primary/40" />

        <div className="p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4 border border-border shadow-inner">
              <Zap className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Solar SCADA</h1>
            <p className="text-sm text-muted-foreground mt-1">Automystics Technologies</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className="flex items-center gap-1.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${step === "email" ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"}`}>
                {step === "otp" ? "✓" : "1"}
              </div>
              <span className="text-xs text-muted-foreground">Email</span>
            </div>
            <div className="flex-1 h-px bg-border" />
            <div className="flex items-center gap-1.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${step === "otp" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                2
              </div>
              <span className="text-xs text-muted-foreground">Verify</span>
            </div>
          </div>

          {step === "email"
            ? <EmailStep onSuccess={(e, m, t, s) => { setEmail(e); setMasked(m); setTtl(t); setSmtp(s); setStep("otp"); }} />
            : <OtpStep email={email} maskedEmail={masked} expiresInMs={ttl} smtpEnabled={smtp} onBack={() => setStep("email")} />
          }

          <div className="mt-8 text-center text-xs text-muted-foreground border-t border-border pt-5">
            <p>Supervisory Control and Data Acquisition</p>
            <p className="mt-1">Version 2.4.1 · Secure OTP Login</p>
          </div>
        </div>
      </div>
    </div>
  );
}
