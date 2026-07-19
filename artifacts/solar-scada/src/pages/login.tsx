import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Zap, Mail, Loader2, CheckCircle2, RotateCcw,
  ArrowLeft, Clock, AlertTriangle, Terminal,
  Lock, Eye, EyeOff, KeyRound,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL;

// ── SMTP off banner ───────────────────────────────────────────────────────────
function SmtpOffBanner() {
  return (
    <div className="w-full max-w-md bg-amber-50 border border-amber-300 rounded-2xl px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800 mb-1">
            Email delivery is off — SMTP not configured
          </p>
          <p className="text-xs text-amber-700 mb-2">
            Your OTP was generated but not emailed. Get it from the server log:
          </p>
          <div className="flex items-center gap-2 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
            <Terminal className="h-3.5 w-3.5 text-amber-700 shrink-0" />
            <code className="text-xs text-amber-900 font-mono break-all">
              journalctl -u solar-scada-api -n 20 --no-pager | grep OTP
            </code>
          </div>
          <p className="text-xs text-amber-600 mt-2">
            Look for:{" "}
            <span className="font-mono font-semibold">[OTP] to=… code=123456</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Email (OTP flow) ──────────────────────────────────────────────────
function EmailStep({
  onSent,
  onSwitchToPassword,
}: {
  onSent: (email: string, masked: string, ttl: number, cooldown: number, smtpOn: boolean) => void;
  onSwitchToPassword: () => void;
}) {
  const [email, setEmail]     = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const r = await fetch(`${BASE}api/auth/login/email`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const text = await r.text();
      let b: { ok?: boolean; maskedEmail?: string; expiresInMs?: number; resendCooldownMs?: number; message?: string; mailerEnabled?: boolean } = {};
      try { b = JSON.parse(text); } catch {
        setError(r.status === 404
          ? "Login service not found — the server needs to be updated."
          : `Server error (${r.status}). Please try again.`);
        setLoading(false);
        return;
      }
      if (!r.ok) {
        setError(b.message ?? "Access denied.");
        setLoading(false);
        return;
      }
      onSent(
        email.trim().toLowerCase(),
        b.maskedEmail ?? email,
        b.expiresInMs ?? 300_000,
        b.resendCooldownMs ?? 50_000,
        b.mailerEnabled ?? false,
      );
    } catch {
      setError("Network error — could not reach the server.");
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h2>
      <p className="text-sm text-gray-500 mb-6">
        Enter your email address to receive a one-time password.
      </p>
      <form onSubmit={send} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Email address
          </label>
          <input
            type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            required autoFocus placeholder="you@example.com"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}
        <button
          type="submit" disabled={loading || !email.trim()}
          className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-sm"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {loading ? "Sending…" : "Send OTP"}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 font-medium">or</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <button
        type="button"
        onClick={onSwitchToPassword}
        className="w-full flex items-center justify-center gap-2 border border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 font-medium py-2.5 rounded-xl transition-all text-sm"
      >
        <Lock className="h-4 w-4" />
        Sign in with password
      </button>
    </div>
  );
}

// ── Password login step ───────────────────────────────────────────────────────
function PasswordStep({ onBack, defaultEmail = "", smtpOffRedirect = false }: {
  onBack: () => void;
  defaultEmail?: string;
  smtpOffRedirect?: boolean;
}) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [email, setEmail]         = useState(defaultEmail);
  const [password, setPassword]   = useState("");
  const [showPwd, setShowPwd]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const r = await fetch(`${BASE}api/auth/password-login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const b = await r.json() as { ok?: boolean; message?: string };
      if (!r.ok) {
        setError(b.message ?? "Incorrect email or password.");
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
    <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1.5 rounded-lg bg-indigo-50">
          <KeyRound className="h-5 w-5 text-indigo-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Sign in</h2>
      </div>
      {smtpOffRedirect ? (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            Email delivery is not configured on this server — sign in with your password instead.
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-6">Enter your email and password.</p>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Email address
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required autoFocus
            placeholder="you@example.com"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-11 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-sm"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 font-medium">or</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <button
        type="button"
        onClick={onBack}
        className="w-full flex items-center justify-center gap-2 border border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 font-medium py-2.5 rounded-xl transition-all text-sm"
      >
        <Mail className="h-4 w-4" />
        Sign in with OTP instead
      </button>
    </div>
  );
}

// ── Step 2: Sending animation ─────────────────────────────────────────────────
function SendingStep({
  masked, smtpOn, onReady,
}: { masked: string; smtpOn: boolean; onReady: () => void }) {
  const [countdown, setCountdown] = useState(3);
  const [progress, setProgress]   = useState(0);

  useEffect(() => {
    const start = Date.now(), total = 3000;
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(elapsed / total, 1);
      setProgress(pct);
      setCountdown(Math.max(0, Math.ceil((total - elapsed) / 1000)));
      if (pct >= 1) { clearInterval(tick); onReady(); }
    }, 50);
    return () => clearInterval(tick);
  }, [onReady]);

  const r = 36, circ = 2 * Math.PI * r, strokeOffset = circ * (1 - progress);

  return (
    <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md flex flex-col items-center text-center">
      <div className="relative mb-6">
        <svg width="96" height="96" className="-rotate-90">
          <circle cx="48" cy="48" r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          <circle
            cx="48" cy="48" r={r} fill="none"
            stroke={smtpOn ? "#6366f1" : "#f59e0b"} strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.05s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Clock className={`h-8 w-8 ${smtpOn ? "text-indigo-500" : "text-amber-500"}`} />
        </div>
      </div>

      {smtpOn ? (
        <>
          <h3 className="text-xl font-bold text-gray-900 mb-2">OTP sent!</h3>
          <p className="text-sm text-gray-500">
            Check your inbox at{" "}
            <span className="font-semibold text-gray-800">{masked}</span>
          </p>
        </>
      ) : (
        <>
          <h3 className="text-xl font-bold text-amber-700 mb-2">OTP generated</h3>
          <p className="text-sm text-gray-500">
            SMTP is off — code not sent to{" "}
            <span className="font-semibold text-gray-800">{masked}</span>
          </p>
        </>
      )}
      <p className="text-sm font-medium mt-3" style={{ color: smtpOn ? "#6366f1" : "#f59e0b" }}>
        OTP input available in {countdown}s
      </p>
    </div>
  );
}

// ── Step 3: OTP entry ─────────────────────────────────────────────────────────
function OtpStep({
  email, masked, expiresInMs, cooldownMs, smtpOn, onBack, onResent,
}: {
  email: string; masked: string; expiresInMs: number; cooldownMs: number;
  smtpOn: boolean; onBack: () => void;
  onResent: (ttl: number, cd: number, smtpOn: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [digits, setDigits]   = useState(["", "", "", "", "", ""]);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msLeft, setMsLeft]   = useState(expiresInMs);
  const [cdLeft, setCdLeft]   = useState(cooldownMs);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);
  useEffect(() => {
    if (msLeft <= 0) return;
    const id = setInterval(() => setMsLeft(p => Math.max(0, p - 1000)), 1000);
    return () => clearInterval(id);
  }, [msLeft]);
  useEffect(() => {
    if (cdLeft <= 0) return;
    const id = setInterval(() => setCdLeft(p => Math.max(0, p - 1000)), 1000);
    return () => clearInterval(id);
  }, [cdLeft]);

  const fmt = (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  };

  function handleDigit(i: number, val: string) {
    const d = val.replace(/\D/g, "").slice(-1);
    const next = [...digits]; next[i] = d; setDigits(next);
    if (d && i < 5) inputs.current[i + 1]?.focus();
  }
  function handleKey(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft"  && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) inputs.current[i + 1]?.focus();
  }
  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    inputs.current[Math.min(text.length, 5)]?.focus();
  }

  const otp = digits.join("");

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length < 6) return;
    setError(null); setLoading(true);
    try {
      const r = await fetch(`${BASE}api/auth/login/verify-otp`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const b = await r.json() as { ok?: boolean; message?: string };
      if (!r.ok) { setError(b.message ?? "Incorrect code."); setLoading(false); return; }
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      setLocation("/");
    } catch {
      setError("Could not reach the server.");
      setLoading(false);
    }
  }

  async function resend() {
    if (cdLeft > 0) return;
    try {
      const r = await fetch(`${BASE}api/auth/login/resend`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const b = await r.json() as {
        ok?: boolean; expiresInMs?: number;
        resendCooldownMs?: number; message?: string; mailerEnabled?: boolean;
      };
      if (r.ok) {
        setDigits(["", "", "", "", "", ""]); setError(null);
        onResent(b.expiresInMs ?? 300_000, b.resendCooldownMs ?? 50_000, b.mailerEnabled ?? false);
        setMsLeft(b.expiresInMs ?? 300_000); setCdLeft(b.resendCooldownMs ?? 50_000);
        inputs.current[0]?.focus();
      } else { setError(b.message ?? "Could not resend."); }
    } catch { setError("Could not reach the server."); }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
      {smtpOn ? (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 mb-5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <p className="text-xs text-green-700 font-medium">
            OTP emailed to <span className="font-semibold">{masked}</span>
          </p>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-800 mb-1">SMTP off — OTP not emailed</p>
              <p className="text-xs text-amber-700 mb-1.5">Get your code from the server:</p>
              <div className="bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <Terminal className="h-3 w-3 text-amber-700 shrink-0" />
                <code className="text-[10px] text-amber-900 font-mono break-all">
                  journalctl -u solar-scada-api -n 20 --no-pager | grep OTP
                </code>
              </div>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-xl font-bold text-gray-900 mb-1">Check your {smtpOn ? "email" : "server logs"}</h2>
      <p className="text-sm text-gray-500 mb-5">Enter the 6-digit code below.</p>

      <form onSubmit={verify} className="space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">One-Time Password</label>
            <span className={`text-xs font-mono font-semibold tabular-nums ${msLeft < 60_000 ? "text-red-500" : "text-indigo-500"}`}>
              {msLeft > 0 ? `Expires ${fmt(msLeft)}` : "Expired"}
            </span>
          </div>
          <div className="flex gap-2 justify-between" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => { inputs.current[i] = el; }}
                type="text" inputMode="numeric" maxLength={1}
                value={d}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKey(i, e)}
                disabled={msLeft === 0}
                className="w-12 h-14 text-center text-xl font-bold border-2 rounded-xl text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition disabled:opacity-40"
                style={{ borderColor: d ? "#6366f1" : "#d1d5db" }}
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit" disabled={loading || otp.length < 6 || msLeft === 0}
          className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-sm"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {loading ? "Verifying…" : "Verify OTP"}
        </button>

        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="h-3 w-3" /> Use different email
          </button>
          <button type="button" onClick={resend} disabled={cdLeft > 0}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <RotateCcw className="h-3 w-3" />
            {cdLeft > 0 ? `Resend OTP (${Math.ceil(cdLeft / 1000)}s)` : "Resend OTP"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
type Step = "email" | "password" | "sending" | "otp";

export default function Login() {
  const [step, setStep]               = useState<Step>("email");
  const [email, setEmail]             = useState("");
  const [masked, setMasked]           = useState("");
  const [ttl, setTtl]                 = useState(300_000);
  const [cooldown, setCooldown]       = useState(50_000);
  const [smtpOn, setSmtpOn]           = useState(false);
  const [smtpOffRedirect, setSmtpOffRedirect] = useState(false);

  const handleSent = (e: string, m: string, t: number, cd: number, smtp: boolean) => {
    setEmail(e); setMasked(m); setTtl(t); setCooldown(cd); setSmtpOn(smtp);
    if (!smtp) {
      // SMTP is disabled — skip the OTP flow entirely and go straight to password login
      setSmtpOffRedirect(true);
      setStep("password");
      return;
    }
    setStep("sending");
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 gap-6"
      style={{ background: "linear-gradient(160deg,#0f1629 0%,#131b36 50%,#191040 100%)" }}
    >
      {/* Brand header */}
      <div className="flex flex-col items-center text-center select-none">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
          style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
        >
          <Zap className="h-7 w-7 text-white" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Solar SCADA</h1>
        <p className="text-sm text-slate-400 mt-1">Automystics Technologies</p>
      </div>

      {step === "email" && (
        <EmailStep
          onSent={handleSent}
          onSwitchToPassword={() => setStep("password")}
        />
      )}

      {step === "password" && (
        <PasswordStep
          onBack={() => { setSmtpOffRedirect(false); setStep("email"); }}
          defaultEmail={email}
          smtpOffRedirect={smtpOffRedirect}
        />
      )}

      {step === "sending" && (
        <SendingStep masked={masked} smtpOn={smtpOn} onReady={() => setStep("otp")} />
      )}

      {step === "otp" && (
        <>
          {!smtpOn && <SmtpOffBanner />}
          <OtpStep
            email={email} masked={masked}
            expiresInMs={ttl} cooldownMs={cooldown}
            smtpOn={smtpOn}
            onBack={() => setStep("email")}
            onResent={(t, cd, smtp) => { setTtl(t); setCooldown(cd); setSmtpOn(smtp); }}
          />
        </>
      )}

      <p className="text-xs text-slate-600 text-center">
        Supervisory Control and Data Acquisition · Version 2.4.1
      </p>
    </div>
  );
}
