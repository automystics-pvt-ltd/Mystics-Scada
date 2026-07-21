import { useState } from "react";
import { useLocation } from "wouter";
import {
  ShieldCheck, Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL;

export default function PlatformAdminLogin() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [email, setEmail]       = useState("");
  const [passcode, setPasscode] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}api/platform-admin/login/passcode`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), passcode }),
      });
      let b: { ok?: boolean; message?: string } = {};
      try { b = await r.json(); } catch { /* non-JSON body (e.g. 404 HTML) */ }
      if (!r.ok) {
        setError(b.message ?? `Server error ${r.status} — check that the latest API is deployed and running.`);
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
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 gap-6"
      style={{ background: "linear-gradient(160deg,#0f1629 0%,#131b36 50%,#191040 100%)" }}
    >
      {/* Header */}
      <div className="flex flex-col items-center text-center select-none">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
          style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
        >
          <ShieldCheck className="h-7 w-7 text-white" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Mystics Platform</h1>
        <p className="text-sm text-slate-400 mt-1">Admin Console</p>
      </div>

      {/* Login card */}
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h2>
        <p className="text-sm text-gray-500 mb-6">
          Enter your whitelisted email and admin passcode.
        </p>

        <form onSubmit={submit} className="space-y-4">
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

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Admin passcode
            </label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={passcode}
                onChange={e => setPasscode(e.target.value)}
                required
                placeholder="••••••"
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
            disabled={loading || !email.trim() || !passcode}
            className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>

      <p className="text-xs text-slate-600 text-center">
        Mystics Platform · Automystics Technologies
      </p>
    </div>
  );
}
