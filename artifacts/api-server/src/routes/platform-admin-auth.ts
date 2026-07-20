/**
 * Platform Admin Authentication
 *
 * Whitelist is read from env var PLATFORM_ADMIN_EMAILS (comma-separated).
 * Falls back to two hardcoded emails if env var is not set.
 *
 * POST /platform-admin/login/email      — validate whitelist, send OTP
 * POST /platform-admin/login/resend     — resend OTP (cooldown enforced)
 * POST /platform-admin/login/verify-otp — verify OTP or master passcode
 * POST /platform-admin/login/logout     — clear session
 */

import { Router, type IRouter } from "express";
import { db, usersTable, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, type SessionPayload } from "../middleware/authenticate";
import { sendOtpEmail, mailerEnabled } from "../lib/mailer";
import crypto from "crypto";

const router: IRouter = Router();

// ── Config ───────────────────────────────────────────────────────────────────

function buildWhitelist(): Set<string> {
  const env = process.env.PLATFORM_ADMIN_EMAILS;
  if (env) {
    const emails = env.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
    console.log("[PlatformAdmin] Whitelist from env:", emails);
    return new Set(emails);
  }
  // Default fallback
  return new Set([
    "automystics.ai@gmail.com",
    "automystics.com@gmail.com",
    "anandakumar.mani012@gmail.com",
    "anand02.pm@gmail.com",
  ]);
}

const WHITELISTED = buildWhitelist();
const MASTER = process.env.PLATFORM_ADMIN_PASSCODE ?? "666666";

// Log on startup so it's visible in journalctl
console.log("[PlatformAdmin] Whitelisted emails:", [...WHITELISTED]);
console.log("[PlatformAdmin] Master passcode set:", MASTER.length > 0);

const OTP_TTL      = 5 * 60 * 1000;   // 5 min
const COOLDOWN     = 50 * 1000;        // 50 s
const SESS_MAX     = 7 * 24 * 60 * 60 * 1000;

function cookieOpts() {
  return {
    signed: true, httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESS_MAX, path: "/",
  };
}

interface Rec { otp: string; expiresAt: number; cooldownUntil: number; }
const store = new Map<string, Rec>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (now > v.expiresAt) store.delete(k);
}, 10 * 60 * 1000);

const rng  = () => String(crypto.randomInt(100_000, 999_999));
const mask = (e: string) => {
  const [l, d] = e.split("@");
  if (!l || !d) return e;
  return `${l.slice(0, 2)}${"*".repeat(Math.max(l.length - 2, 8))}@${d}`;
};
const isMaster = (p: string) => {
  try {
    const a = Buffer.alloc(64); const b = Buffer.alloc(64);
    a.write(MASTER); b.write(p);
    return crypto.timingSafeEqual(a, b) && p === MASTER;
  } catch { return false; }
};

async function adminSession(): Promise<SessionPayload | null> {
  const [u] = await db.select().from(usersTable)
    .where(eq(usersTable.isSuperAdmin, true)).limit(1);
  return u ? { userId: u.id, orgId: u.orgId, roleId: u.roleId } : null;
}

// ── POST /platform-admin/login/email ────────────────────────────────────────

router.post("/platform-admin/login/email", async (req, res) => {
  const { email } = req.body as { email?: unknown };
  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "invalid_body", message: "Email is required." });
    return;
  }

  const n = email.trim().toLowerCase();
  console.log(`[PlatformAdmin] Login attempt: ${n} | whitelisted: ${WHITELISTED.has(n)}`);

  if (!WHITELISTED.has(n)) {
    res.status(403).json({ error: "not_whitelisted", message: "This email is not authorised for platform access." });
    return;
  }

  const ex = store.get(n); const now = Date.now();
  if (ex && now < ex.cooldownUntil) {
    const s = Math.ceil((ex.cooldownUntil - now) / 1000);
    res.status(429).json({
      error: "resend_cooldown",
      message: `Please wait ${s}s before requesting a new code.`,
      secondsLeft: s,
      maskedEmail: mask(n),
      expiresInMs: Math.max(0, ex.expiresAt - now),
      resendCooldownMs: ex.cooldownUntil - now,
      mailerEnabled,
    });
    return;
  }

  const otp = rng();
  store.set(n, { otp, expiresAt: now + OTP_TTL, cooldownUntil: now + COOLDOWN });

  let delivered = mailerEnabled;
  try {
    await sendOtpEmail(n, otp);
  } catch (err: unknown) {
    console.error("[PlatformAdmin] sendOtpEmail error:", err);
    delivered = false;
  }

  res.json({ ok: true, maskedEmail: mask(n), expiresInMs: OTP_TTL, resendCooldownMs: COOLDOWN, mailerEnabled: delivered });
});

// ── POST /platform-admin/login/resend ────────────────────────────────────────

router.post("/platform-admin/login/resend", async (req, res) => {
  const { email } = req.body as { email?: unknown };
  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "invalid_body", message: "Email is required." });
    return;
  }
  const n = email.trim().toLowerCase();
  if (!WHITELISTED.has(n)) {
    res.status(403).json({ error: "not_whitelisted", message: "Email not authorised." });
    return;
  }
  const ex = store.get(n); const now = Date.now();
  if (ex && now < ex.cooldownUntil) {
    res.status(429).json({ error: "resend_cooldown", message: `Wait ${Math.ceil((ex.cooldownUntil - now) / 1000)}s` });
    return;
  }
  const otp = rng();
  store.set(n, { otp, expiresAt: now + OTP_TTL, cooldownUntil: now + COOLDOWN });

  let delivered = mailerEnabled;
  try {
    await sendOtpEmail(n, otp);
  } catch (err: unknown) {
    console.error("[PlatformAdmin] resend error:", err);
    delivered = false;
  }

  res.json({ ok: true, maskedEmail: mask(n), expiresInMs: OTP_TTL, resendCooldownMs: COOLDOWN, mailerEnabled: delivered });
});

// ── POST /platform-admin/login/verify-otp ────────────────────────────────────

router.post("/platform-admin/login/verify-otp", async (req, res) => {
  const { email, otp } = req.body as { email?: unknown; otp?: unknown };
  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "invalid_body", message: "Email is required." });
    return;
  }
  if (typeof otp !== "string" || !otp.trim()) {
    res.status(400).json({ error: "invalid_body", message: "OTP is required." });
    return;
  }

  const n = email.trim().toLowerCase();
  const p = otp.trim();

  if (!WHITELISTED.has(n)) {
    res.status(403).json({ error: "not_whitelisted", message: "Email not authorised." });
    return;
  }

  // Master passcode bypass
  if (!isMaster(p)) {
    const r = store.get(n);
    if (!r) {
      res.status(401).json({ error: "no_otp", message: "No code found. Please request a new one." });
      return;
    }
    if (Date.now() > r.expiresAt) {
      store.delete(n);
      res.status(401).json({ error: "otp_expired", message: "Code expired. Please request a new one." });
      return;
    }
    if (r.otp !== p) {
      console.log(`[PlatformAdmin] Invalid OTP attempt for ${n}: got ${p}, expected ${r.otp}`);
      res.status(401).json({ error: "invalid_otp", message: "Incorrect code. Please try again." });
      return;
    }
    store.delete(n);
  } else {
    console.log(`[PlatformAdmin] Master passcode used by ${n}`);
  }

  const payload = await adminSession();
  if (!payload) {
    res.status(500).json({ error: "no_admin_user", message: "Platform admin account not found in database." });
    return;
  }

  res.cookie(SESSION_COOKIE, JSON.stringify(payload), cookieOpts());
  console.log(`[PlatformAdmin] Login successful: ${n}`);
  res.json({ ok: true });
});

// ── POST /platform-admin/login/logout ────────────────────────────────────────

router.post("/platform-admin/login/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

export default router;
