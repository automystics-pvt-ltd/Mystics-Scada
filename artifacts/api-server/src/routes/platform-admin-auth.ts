/**
 * Platform Admin Authentication
 *
 * Two login methods:
 *   1. Google OAuth — only whitelisted Gmail addresses are accepted.
 *   2. Emergency passcode — a 6-digit PIN (default 666666) that bypasses OAuth.
 *
 * On success both methods set the standard scada_session cookie as the
 * platform super-admin user, giving access to the full super-admin portal.
 *
 * Routes (all public — mounted before the authenticate middleware):
 *   GET  /platform-admin/login/google            → redirect to Google consent
 *   GET  /platform-admin/login/google/callback   → exchange code, set session
 *   POST /platform-admin/login/passcode          → { passcode } → set session
 *   POST /platform-admin/login/logout            → clear session
 */

import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, type SessionPayload } from "../middleware/authenticate";
import crypto from "crypto";

const router: IRouter = Router();

// ── Config ────────────────────────────────────────────────────────────────────

const WHITELISTED_EMAILS = new Set([
  "automystics.com@gmail.com",
  "anandakumar.mani012@gmail.com",
]);

const PLATFORM_ADMIN_PASSCODE =
  process.env.PLATFORM_ADMIN_PASSCODE ?? "666666";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

// Callback URL registered in Google Cloud Console
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ??
  "https://scada.automystics.tech/api/platform-admin/login/google/callback";

/** 7-day session — same as regular login */
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sessionCookieOptions() {
  return {
    signed: true,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  };
}

// ── CSRF state store (in-memory, TTL 10 min) ─────────────────────────────────

const pendingStates = new Map<string, number>();

function generateState(): string {
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now() + 10 * 60 * 1000);
  return state;
}

function consumeState(state: string): boolean {
  const expiry = pendingStates.get(state);
  if (!expiry || Date.now() > expiry) return false;
  pendingStates.delete(state);
  return true;
}

// Purge expired states every 15 min
setInterval(() => {
  const now = Date.now();
  for (const [s, exp] of pendingStates) {
    if (now > exp) pendingStates.delete(s);
  }
}, 15 * 60 * 1000);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Find the platform super-admin user and build a session for them. */
async function createSuperAdminSession(): Promise<SessionPayload | null> {
  // Look for the seeded super-admin (isSuperAdmin = true)
  const [admin] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.isSuperAdmin, true))
    .limit(1);

  if (!admin) return null;

  return {
    userId: admin.id,
    orgId: admin.orgId,
    roleId: admin.roleId,
  };
}

// ── GET /platform-admin/login/google ─────────────────────────────────────────

router.get("/platform-admin/login/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(503).json({
      error: "google_not_configured",
      message: "Google OAuth is not configured on this server. Use the passcode login.",
    });
    return;
  }

  const state = generateState();
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ── GET /platform-admin/login/google/callback ─────────────────────────────────

router.get("/platform-admin/login/google/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  // User denied consent
  if (error) {
    res.redirect("/#/platform-admin?error=access_denied");
    return;
  }

  if (!code || !state || !consumeState(state)) {
    res.redirect("/platform-admin?error=invalid_state");
    return;
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      req.log?.warn({ status: tokenRes.status }, "Google token exchange failed");
      res.redirect("/platform-admin?error=token_exchange_failed");
      return;
    }

    const tokenData = await tokenRes.json() as { access_token?: string };
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      res.redirect("/platform-admin?error=no_access_token");
      return;
    }

    // Fetch user info
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      res.redirect("/platform-admin?error=userinfo_failed");
      return;
    }

    const userInfo = await userInfoRes.json() as { email?: string; name?: string };
    const email = userInfo.email?.toLowerCase();

    if (!email || !WHITELISTED_EMAILS.has(email)) {
      req.log?.warn({ email }, "Platform admin login: email not whitelisted");
      res.redirect(`/platform-admin?error=not_whitelisted&email=${encodeURIComponent(email ?? "")}`);
      return;
    }

    const payload = await createSuperAdminSession();
    if (!payload) {
      res.redirect("/platform-admin?error=no_admin_user");
      return;
    }

    res.cookie(SESSION_COOKIE, JSON.stringify(payload), sessionCookieOptions());
    req.log?.info({ email }, "Platform admin logged in via Google");
    res.redirect("/");
  } catch (err) {
    req.log?.error({ err }, "Platform admin Google OAuth error");
    res.redirect("/platform-admin?error=oauth_error");
  }
});

// ── POST /platform-admin/login/passcode ──────────────────────────────────────

router.post("/platform-admin/login/passcode", async (req, res) => {
  const { passcode } = req.body as { passcode?: unknown };

  if (typeof passcode !== "string" || !passcode.trim()) {
    res.status(400).json({ error: "invalid_body", message: "passcode is required" });
    return;
  }

  // Constant-time compare to prevent timing attacks
  const expected = Buffer.from(PLATFORM_ADMIN_PASSCODE.padEnd(32));
  const provided = Buffer.from(passcode.trim().padEnd(32));
  const matches =
    expected.length === provided.length &&
    crypto.timingSafeEqual(expected, provided) &&
    passcode.trim() === PLATFORM_ADMIN_PASSCODE;

  if (!matches) {
    req.log?.warn("Platform admin login: wrong passcode");
    res.status(401).json({ error: "invalid_passcode", message: "Incorrect passcode" });
    return;
  }

  const payload = await createSuperAdminSession();
  if (!payload) {
    res.status(500).json({ error: "no_admin_user", message: "No platform admin account found" });
    return;
  }

  res.cookie(SESSION_COOKIE, JSON.stringify(payload), sessionCookieOptions());
  req.log?.info("Platform admin logged in via passcode");
  res.json({ ok: true });
});

// ── POST /platform-admin/login/logout ────────────────────────────────────────

router.post("/platform-admin/login/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

export default router;
