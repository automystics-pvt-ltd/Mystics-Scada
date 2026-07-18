import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, Loader2, Send, LogIn } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL;

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function PlatformAdminLogin() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [email, setEmail]     = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [info, setInfo]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [sending, setSending]   = useState(false);
  const [otpSent, setOtpSent]   = useState(false);
  const [msLeft, setMsLeft]     = useState(0);
  const [cooldownMs, setCooldownMs] = useState(0);

  // Countdown timer
  useEffect(() => {
    if (msLeft <= 0) return;
    const id = setInterval(() => setMsLeft(p => Math.max(0, p - 1000)), 1000);
    return () => clearInterval(id);
  }, [msLeft]);

  useEffect(() => {
    if (cooldownMs <= 0) return;
    const id = setInterval(() => setCooldownMs(p => Math.max(0, p - 1000)), 1000);
    return () => clearInterval(id);
  }, [cooldownMs]);

  async function sendOtp() {
    if (!email.trim()) { setError("Enter your email first."); return; }
    setError(null); setInfo(null); setSending(true);
    try {
      const r = await fetch(`${BASE}api/platform-admin/login/email`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const b = await r.json() as {
        ok?: boolean; maskedEmail?: string; expiresInMs?: number;
        resendCooldownMs?: number; mailerEnabled?: boolean; message?: string;
        secondsLeft?: number;
      };
      if (!r.ok) {
        if (r.status === 429) {
          setInfo(`Code already sent. Wait ${b.secondsLeft ?? "?"}s to resend.`);
          setCooldownMs(b.resendCooldownMs ?? 50_000);
          setMsLeft(b.expiresInMs ?? 300_000);
          setOtpSent(true);
        } else {
          setError(b.message ?? "Request failed.");
        }
        return;
      }
      setOtpSent(true);
      setMsLeft(b.expiresInMs ?? 300_000);
      setCooldownMs(b.resendCooldownMs ?? 50_000);
      if (b.mailerEnabled) {
        setInfo(`Code sent to ${b.maskedEmail}. Check your inbox.`);
      } else {
        setInfo("Email delivery not configured — use bypass passcode 666666.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSending(false);
    }
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Email is required."); return; }
    if (!passcode.trim()) { setError("Passcode is required."); return; }
    setError(null); setLoading(true);
    try {
      const r = await fetch(`${BASE}api/platform-admin/login/verify-otp`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: passcode.trim() }),
      });
      const b = await r.json() as { ok?: boolean; message?: string };
      if (!r.ok) { setError(b.message ?? "Incorrect passcode."); return; }
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      setLocation("/");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "linear-gradient(135deg,#0f1629 0%,#151d35 60%,#1a1040 100%)" }}
    >
      {/* Header */}
      <div className="flex flex-col items-center mb-10 text-center select-none">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg"
          style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
        >
          <ShieldCheck className="h-8 w-8 text-white" strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Mystics Platform</h1>
        <p className="text-sm text-slate-400 mt-1.5">Admin Console</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h2>
        <p className="text-sm text-gray-500 mb-6">
          Enter your authorised email and passcode.
        </p>

        <form onSubmit={login} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="admin@example.com"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          {/* Passcode */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Passcode / OTP
              </label>
              {otpSent && msLeft > 0 && (
                <span className={`text-xs font-mono font-semibold tabular-nums ${msLeft < 60_000 ? "text-red-500" : "text-gray-400"}`}>
                  Expires {fmt(msLeft)}
                </span>
              )}
            </div>
            <input
              type="password"
              inputMode="numeric"
              value={passcode}
              onChange={e => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              placeholder="Enter 6-digit code"
              autoComplete="one-time-code"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition font-mono tracking-widest"
            />
            <p className="mt-1.5 text-xs text-gray-400">
              Use OTP sent to your email, or the bypass code if provided.
            </p>
          </div>

          {/* Info / error banners */}
          {info && (
            <p className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5">
              {info}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          {/* Sign in button */}
          <button
            type="submit"
            disabled={loading || !email || !passcode}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-indigo-200 mt-1"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {loading ? "Signing in…" : "Sign in"}
          </button>

          {/* Send OTP (secondary) */}
          <button
            type="button"
            onClick={sendOtp}
            disabled={sending || cooldownMs > 0}
            className="w-full border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 hover:text-indigo-600 text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {sending
              ? "Sending…"
              : cooldownMs > 0
              ? `Resend OTP in ${Math.ceil(cooldownMs / 1000)}s`
              : otpSent
              ? "Resend OTP to email"
              : "Send OTP to email"}
          </button>
        </form>
      </div>

      <p className="text-xs text-slate-600 mt-8 text-center">
        Unauthorised access is prohibited and monitored.
      </p>
    </div>
  );
}
