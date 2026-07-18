import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, RotateCcw, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Step 1: Email entry ───────────────────────────────────────────────────────

function EmailStep({
  onSuccess,
}: {
  onSuccess: (email: string, masked: string, expiresInMs: number) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/platform-admin/login/email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await res.json() as {
        ok?: boolean; maskedEmail?: string; expiresInMs?: number;
        message?: string; error?: string;
      };
      if (!res.ok) {
        setError(body.message ?? "Access denied.");
        return;
      }
      onSuccess(email.trim().toLowerCase(), body.maskedEmail ?? email, body.expiresInMs ?? 300000);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Admin access</h2>
      <p className="text-sm text-gray-500 mb-6">
        Enter your authorised email address to receive a one-time code.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            placeholder="you@gmail.com"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !email}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-indigo-200"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Sending code…" : "Send verification code"}
        </button>
      </form>
    </div>
  );
}

// ── Step 2: OTP entry ─────────────────────────────────────────────────────────

function OtpStep({
  email,
  maskedEmail,
  expiresInMs,
  onBack,
}: {
  email: string;
  maskedEmail: string;
  expiresInMs: number;
  onBack: () => void;
}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Expiry countdown
  const [msLeft, setMsLeft] = useState(expiresInMs);
  useEffect(() => {
    if (msLeft <= 0) return;
    const id = setInterval(() => setMsLeft((prev) => Math.max(0, prev - 1000)), 1000);
    return () => clearInterval(id);
  }, [msLeft]);

  // Resend cooldown (50 s)
  const [resendMs, setResendMs] = useState(50000);
  useEffect(() => {
    if (resendMs <= 0) return;
    const id = setInterval(() => setResendMs((prev) => Math.max(0, prev - 1000)), 1000);
    return () => clearInterval(id);
  }, [resendMs]);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/platform-admin/login/verify-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otp.trim() }),
      });
      const body = await res.json() as { ok?: boolean; message?: string };
      if (!res.ok) {
        setError(body.message ?? "Incorrect code. Please try again.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setLocation("/");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendMs > 0) return;
    setError(null);
    try {
      const res = await fetch(`${BASE}api/platform-admin/login/resend`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json() as { ok?: boolean; expiresInMs?: number; message?: string };
      if (res.ok) {
        setMsLeft(body.expiresInMs ?? 300000);
        setResendMs(50000);
        setOtp("");
        setError(null);
      } else {
        setError(body.message ?? "Could not resend.");
      }
    } catch {
      setError("Could not reach the server.");
    }
  }

  // Format OTP digits with spaces for display (like the screenshot)
  const displayOtp = otp.split("").join(" ");

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Check your email</h2>
      <p className="text-sm text-gray-500 mb-1">We sent a 6-digit code to</p>
      <p className="text-sm font-semibold text-gray-800 mb-6">{maskedEmail}</p>

      <form onSubmit={handleVerify} className="space-y-4">
        {/* OTP label + expiry */}
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">One-Time Password</label>
          <span
            className={`text-xs font-mono font-semibold ${
              msLeft < 60000 ? "text-red-500" : "text-gray-400"
            }`}
          >
            {msLeft > 0 ? `Expires ${formatTime(msLeft)}` : "Expired"}
          </span>
        </div>

        {/* Single large OTP input — shows digits spaced like screenshot */}
        <div className="relative">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="• • • • • •"
            required
            autoComplete="one-time-code"
            disabled={msLeft === 0}
            className="w-full border-2 border-indigo-400 rounded-xl px-4 py-4 text-center text-2xl font-mono tracking-[0.5em] text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
          />
          {/* Invisible overlay that shows spaced digits */}
          {otp && (
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center text-2xl font-mono tracking-[0.5em] text-gray-900 pointer-events-none select-none pl-[0.5em]"
            >
              {displayOtp}
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || otp.length < 6 || msLeft === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-indigo-200"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
          {loading ? "Verifying…" : "Verify OTP"}
        </button>

        {/* Bottom actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Use different email
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resendMs > 0}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {resendMs > 0
              ? `Resend OTP (${Math.ceil(resendMs / 1000)}s)`
              : "Resend OTP"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlatformAdminLogin() {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [expiresInMs, setExpiresInMs] = useState(300000);

  function handleEmailSuccess(addr: string, masked: string, ttl: number) {
    setEmail(addr);
    setMaskedEmail(masked);
    setExpiresInMs(ttl);
    setStep("otp");
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "linear-gradient(135deg, #0f1629 0%, #151d35 60%, #1a1040 100%)" }}
    >
      {/* Header */}
      <div className="flex flex-col items-center mb-10 text-center">
        {/* Purple shield icon — rounded square like the screenshot */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
        >
          <ShieldCheck className="h-8 w-8 text-white" strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Mystics Platform</h1>
        <p className="text-sm text-slate-400 mt-1.5">Admin Console</p>
      </div>

      {/* Card */}
      {step === "email" ? (
        <EmailStep onSuccess={handleEmailSuccess} />
      ) : (
        <OtpStep
          email={email}
          maskedEmail={maskedEmail}
          expiresInMs={expiresInMs}
          onBack={() => setStep("email")}
        />
      )}

      <p className="text-xs text-slate-600 mt-8">
        Unauthorised access is prohibited and monitored.
      </p>
    </div>
  );
}
