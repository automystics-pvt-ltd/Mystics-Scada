import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, Mail, Loader2, CheckCircle2, RotateCcw, ArrowLeft, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL;

// ── Step 1: Email ─────────────────────────────────────────────────────────────
function EmailStep({ onSent }: {
  onSent: (email: string, masked: string, ttl: number, cooldown: number) => void;
}) {
  const [email, setEmail]     = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}api/platform-admin/login/email`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const b = await r.json() as {
        ok?: boolean; maskedEmail?: string; expiresInMs?: number;
        resendCooldownMs?: number; message?: string; secondsLeft?: number;
        expiresInMs_remaining?: number;
      };
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
      );
    } catch {
      setError("Could not reach the server. Please try again.");
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
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            placeholder="you@example.com"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-sm"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {loading ? "Sending…" : "Send OTP"}
        </button>
      </form>
    </div>
  );
}

// ── Step 2: Sending animation ─────────────────────────────────────────────────
function SendingStep({ masked, onReady }: { masked: string; onReady: () => void }) {
  const [countdown, setCountdown] = useState(3);
  const [progress, setProgress]   = useState(0);

  useEffect(() => {
    const start = Date.now();
    const total = 3000;
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(elapsed / total, 1);
      setProgress(pct);
      setCountdown(Math.max(0, Math.ceil((total - elapsed) / 1000)));
      if (pct >= 1) { clearInterval(tick); onReady(); }
    }, 50);
    return () => clearInterval(tick);
  }, [onReady]);

  // SVG ring progress
  const r = 36, circ = 2 * Math.PI * r;
  const stroke = circ * (1 - progress);

  return (
    <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md flex flex-col items-center text-center">
      {/* Animated ring */}
      <div className="relative mb-6">
        <svg width="96" height="96" className="-rotate-90">
          <circle cx="48" cy="48" r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          <circle
            cx="48" cy="48" r={r} fill="none"
            stroke="#6366f1" strokeWidth="6"
            strokeDasharray={circ}
            strokeDashoffset={stroke}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.05s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Clock className="h-8 w-8 text-indigo-500" />
        </div>
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">OTP sent!</h3>
      <p className="text-sm text-gray-500">
        Check your inbox at{" "}
        <span className="font-semibold text-gray-800">{masked}</span>
      </p>
      <p className="text-sm text-indigo-600 font-medium mt-2">
        OTP input available in {countdown}s
      </p>
    </div>
  );
}

// ── Step 3: OTP entry ─────────────────────────────────────────────────────────
function OtpStep({
  email, masked, expiresInMs, cooldownMs, onBack, onResent,
}: {
  email: string; masked: string; expiresInMs: number; cooldownMs: number;
  onBack: () => void;
  onResent: (ttl: number, cd: number) => void;
}) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError]   = useState<string | null>(null);
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

  function fmtExpiry(ms: number) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  }

  function handleDigit(i: number, val: string) {
    const d = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 5) inputs.current[i + 1]?.focus();
  }

  function handleKey(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
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
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}api/platform-admin/login/verify-otp`, {
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
      const r = await fetch(`${BASE}api/platform-admin/login/resend`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const b = await r.json() as { ok?: boolean; expiresInMs?: number; resendCooldownMs?: number; message?: string };
      if (r.ok) {
        setDigits(["", "", "", "", "", ""]);
        setError(null);
        onResent(b.expiresInMs ?? 300_000, b.resendCooldownMs ?? 50_000);
        setMsLeft(b.expiresInMs ?? 300_000);
        setCdLeft(b.resendCooldownMs ?? 50_000);
        inputs.current[0]?.focus();
      } else {
        setError(b.message ?? "Could not resend.");
      }
    } catch {
      setError("Could not reach the server.");
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Check your email</h2>
      <p className="text-sm text-gray-500 mb-1">We sent a 6-digit code to</p>
      <p className="text-sm font-semibold text-gray-800 mb-6">{masked}</p>

      <form onSubmit={verify} className="space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">One-Time Password</label>
            <span className={`text-xs font-mono font-semibold tabular-nums ${msLeft < 60_000 ? "text-red-500" : "text-indigo-500"}`}>
              {msLeft > 0 ? `Expires ${fmtExpiry(msLeft)}` : "Expired"}
            </span>
          </div>

          {/* 6 individual digit boxes */}
          <div className="flex gap-2 justify-between" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => { inputs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKey(i, e)}
                disabled={msLeft === 0}
                className="w-12 h-14 text-center text-xl font-bold border-2 rounded-xl text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
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
          type="submit"
          disabled={loading || otp.length < 6 || msLeft === 0}
          className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-sm"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {loading ? "Verifying…" : "Verify OTP"}
        </button>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Use different email
          </button>
          <button
            type="button"
            onClick={resend}
            disabled={cdLeft > 0}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            {cdLeft > 0 ? `Resend OTP (${Math.ceil(cdLeft / 1000)}s)` : "Resend OTP"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PlatformAdminLogin() {
  const [step, setStep]       = useState<"email" | "sending" | "otp">("email");
  const [email, setEmail]     = useState("");
  const [masked, setMasked]   = useState("");
  const [ttl, setTtl]         = useState(300_000);
  const [cooldown, setCooldown] = useState(50_000);

  const handleSent = (e: string, m: string, t: number, cd: number) => {
    setEmail(e); setMasked(m); setTtl(t); setCooldown(cd);
    setStep("sending");
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 gap-8"
      style={{ background: "linear-gradient(160deg,#0f1629 0%,#131b36 50%,#191040 100%)" }}
    >
      {/* Header — always visible */}
      <div className="flex flex-col items-center text-center select-none">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
          style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
        >
          <ShieldCheck className="h-7 w-7 text-white" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Mystics Platform</h1>
        <p className="text-sm text-slate-400 mt-1">Admin Console</p>
      </div>

      {/* Card */}
      {step === "email" && (
        <EmailStep onSent={handleSent} />
      )}
      {step === "sending" && (
        <SendingStep masked={masked} onReady={() => setStep("otp")} />
      )}
      {step === "otp" && (
        <OtpStep
          email={email}
          masked={masked}
          expiresInMs={ttl}
          cooldownMs={cooldown}
          onBack={() => setStep("email")}
          onResent={(t, cd) => { setTtl(t); setCooldown(cd); }}
        />
      )}

      <p className="text-xs text-slate-600 text-center">
        Unauthorised access is prohibited and monitored.
      </p>
    </div>
  );
}
