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
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#090b10] relative overflow-hidden">
      {/* Darker/cooler background grid for platform admin */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-slate-400/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[400px] z-10 flex flex-col">
        {/* Header */}
        <div className="flex flex-col items-start mb-8 select-none animate-fade-up">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-5 bg-[#0e121b] border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/20">
            <ShieldCheck className="h-6 w-6 text-blue-400" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Mystics Platform</h1>
          <p className="text-sm font-mono text-blue-400 uppercase tracking-widest mt-2">Admin Console</p>
        </div>

        {/* Login card */}
        <div className="bg-[#0e121b]/80 backdrop-blur-xl border border-slate-800 rounded-xl shadow-2xl p-8 w-full animate-fade-up" style={{ animationDelay: '100ms' }}>
          <h2 className="text-xl font-bold text-white mb-1">Platform Sign In</h2>
          <p className="text-sm text-slate-400 mb-8">Enter your whitelisted email and admin passcode.</p>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@automystics.com"
                className="w-full bg-[#090b10] border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Admin Passcode
              </label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                  required
                  placeholder="••••••"
                  className="w-full bg-[#090b10] border border-slate-800 rounded-lg px-4 py-2.5 pr-11 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2 animate-fade-up">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-400 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !passcode}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-2.5 rounded-lg transition-all shadow-[0_0_15px_rgba(37,99,235,0.2)]"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {loading ? "Authenticating…" : "Access Console"}
            </button>
          </form>
        </div>

        <p className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest text-center mt-8">
          Mystics Platform · Automystics Technologies
        </p>
      </div>
    </div>
  );
}
