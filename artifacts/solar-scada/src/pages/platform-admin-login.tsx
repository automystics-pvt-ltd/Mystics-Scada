import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { ShieldCheck, KeyRound, AlertCircle, Loader2, Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL;

// Google "G" SVG logo
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function PlatformAdminLogin() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();

  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Pick up OAuth error redirected back from the backend
  useEffect(() => {
    const params = new URLSearchParams(search);
    const err = params.get("error");
    if (!err) return;
    const messages: Record<string, string> = {
      not_whitelisted: `Google account "${params.get("email") ?? ""}" is not authorised. Only approved Automystics addresses can access this portal.`,
      access_denied: "Google sign-in was cancelled.",
      invalid_state: "Session expired. Please try again.",
      token_exchange_failed: "Google authentication failed. Please retry.",
      no_admin_user: "Platform admin account not found. Contact support.",
      oauth_error: "An unexpected OAuth error occurred. Please retry.",
    };
    setError(messages[err] ?? `Authentication error: ${err}`);
  }, [search]);

  async function handlePasscode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${BASE}api/platform-admin/login/passcode`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setError(body.message ?? "Incorrect passcode.");
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

  function handleGoogleLogin() {
    setGoogleLoading(true);
    // Full-page redirect — backend handles the OAuth dance
    window.location.href = `${BASE}api/platform-admin/login/google`;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #64748b 1px, transparent 1px), linear-gradient(to bottom, #64748b 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      {/* Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm z-10 relative">
        {/* Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center mb-4 shadow-lg shadow-blue-900/20">
            <ShieldCheck className="h-8 w-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Platform Administration</h1>
          <p className="text-sm text-slate-400 mt-1">Automystics Technologies · Restricted Access</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          {/* Top accent */}
          <div className="h-0.5 w-full bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600" />

          <div className="p-6 space-y-5">
            {/* Google Sign-In */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-900 font-medium py-2.5 px-4 rounded-lg transition-colors shadow-sm border border-slate-200"
            >
              {googleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
              ) : (
                <GoogleIcon />
              )}
              <span>{googleLoading ? "Redirecting…" : "Sign in with Google"}</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Passcode */}
            <form onSubmit={handlePasscode} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  Emergency Passcode
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ""))}
                    placeholder="6-digit code"
                    required
                    autoComplete="off"
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all tracking-widest font-mono"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || googleLoading || passcode.length < 6}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm shadow-blue-900/40"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Verifying…" : "Authenticate"}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Unauthorised access is prohibited and monitored.
        </p>
      </div>
    </div>
  );
}
