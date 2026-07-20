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
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 gap-6"
      style={{ background: "linear-gradient(160deg,#0f1629 0%,#131b36 50%,#191040 100%)" }}
    >
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

      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        {done ? (
          <div className="text-center py-4">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Password updated</h2>
            <p className="text-sm text-gray-500">
              Your password has been changed. Redirecting you to sign in…
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-1">
              <KeyRound className="h-5 w-5 text-indigo-500" />
              <h2 className="text-2xl font-bold text-gray-900">New password</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">Choose a strong password (at least 8 characters).</p>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">New password</label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoFocus
                    placeholder="At least 8 characters"
                    className={`w-full border rounded-xl px-4 py-3 pr-11 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition ${weak ? "border-amber-400" : "border-gray-300"}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {weak && <p className="text-xs text-amber-600 mt-1">Password must be at least 8 characters.</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm password</label>
                <input
                  type={showPwd ? "text" : "password"}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  placeholder="Repeat your password"
                  className={`w-full border rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition ${mismatch ? "border-red-400" : "border-gray-300"}`}
                />
                {mismatch && <p className="text-xs text-red-600 mt-1">Passwords don't match.</p>}
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-sm"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {loading ? "Updating…" : "Set new password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
