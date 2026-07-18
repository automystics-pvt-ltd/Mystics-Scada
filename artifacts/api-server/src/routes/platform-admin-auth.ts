/**
 * Platform Admin Authentication — SMTP OTP + master passcode bypass
 *
 * Flow:
 *   1. POST /platform-admin/login/email    → validate whitelist, generate OTP, send email
 *   2. POST /platform-admin/login/verify-otp → verify OTP or master passcode (666666)
 *   3. POST /platform-admin/login/resend   → resend with 50s cooldown
 *   4. POST /platform-admin/login/logout   → clear session
 *
 * On success: sets the standard scada_session cookie as the platform super-admin.
 */

import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, type SessionPayload } from "../middleware/authenticate";
import { sendOtpEmail, mailerEnabled } from "../lib/mailer";
import crypto from "crypto";

const router: IRouter = Router();

// ── Config ─────────────────────────────────────────────────────────────────

const WHITELISTED_EMAILS = new Set([
  "automystics.com@gmail.com",
  "anandakumar.mani012@gmail.com",
]);

/** Master bypass — always works regardless of generated OTP */
const MASTER_PASSCODE = process.env.PLATFORM_ADMIN_PASSCODE ?? "666666";

const OTP_TTL_MS        = 5 * 60 * 1000;   // 5 minutes
const RESEND_COOLDOWN_MS = 50 * 1000;       // 50 seconds
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

// ── OTP store (in-memory, TTL purged every 10 min) ──────────────────────────

interface OtpRecord {
  otp: string;
  expiresAt: number;
  cooldownUntil: number;
}

const otpStore = new Map<string, OtpRecord>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otpStore) if (now > v.expiresAt) otpStore.delete(k);
}, 10 * 60 * 1000);

function newOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 2, 8))}@${domain}`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getSuperAdminSession(): Promise<SessionPayload | null> {
  const [admin] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.isSuperAdmin, true))
    .limit(1);
  if (!admin) return null;
  return { userId: admin.id, orgId: admin.orgId, roleId: admin.roleId };
}

function isMasterPasscode(provided: string): boolean {
  const a = Buffer.from(MASTER_PASSCODE.padEnd(32));
  const b = Buffer.from(provided.padEnd(32));
  return a.length === b.length && crypto.timingSafeEqual(a, b) && provided === MASTER_PASSCODE;
}

// ── POST /platform-admin/login/email ────────────────────────────────────────

router.post("/platform-admin/login/email", async (req, res) => {
  const { email } = req.body as { email?: unknown };

  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "invalid_body", message: "Email is required." });
    return;
  }

  const normalized = email.trim().toLowerCase();

  if (!WHITELISTED_EMAILS.has(normalized)) {
    res.status(403).json({
      error: "not_whitelisted",
      message: "This email address is not authorised for platform access.",
    });
    return;
  }

  const existing = otpStore.get(normalized);
  const now = Date.now();

  if (existing && now < existing.cooldownUntil) {
    const s = Math.ceil((existing.cooldownUntil - now) / 1000);
    res.status(429).json({
      error: "resend_cooldown",
      message: `Please wait ${s}s before requesting a new code.`,
      secondsLeft: s,
      maskedEmail: maskEmail(normalized),
      expiresInMs: Math.max(0, existing.expiresAt - now),
      resendCooldownMs: existing.cooldownUntil - now,
      mailerEnabled,
    });
    return;
  }

  const otp = newOtp();
  otpStore.set(normalized, {
    otp,
    expiresAt: now + OTP_TTL_MS,
    cooldownUntil: now + RESEND_COOLDOWN_MS,
  });

  // Fire-and-forget — don't block the response on SMTP
  sendOtpEmail(normalized, otp).catch((err: unknown) => {
    req.log?.error({ err, email: normalized }, "Failed to send platform admin OTP email");
  });

  req.log?.info({ email: normalized, mailerEnabled }, "Platform admin OTP generated");

  res.json({
    ok: true,
    maskedEmail: maskEmail(normalized),
    expiresInMs: OTP_TTL_MS,
    resendCooldownMs: RESEND_COOLDOWN_MS,
    mailerEnabled,
  });
});

// ── POST /platform-admin/login/resend ───────────────────────────────────────

router.post("/platform-admin/login/resend", async (req, res) => {
  const { email } = req.body as { email?: unknown };

  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "invalid_body", message: "Email is required." });
    return;
  }

  const normalized = email.trim().toLowerCase();

  if (!WHITELISTED_EMAILS.has(normalized)) {
    res.status(403).json({ error: "not_whitelisted", message: "Email not authorised." });
    return;
  }

  const existing = otpStore.get(normalized);
  const now = Date.now();

  if (existing && now < existing.cooldownUntil) {
    const s = Math.ceil((existing.cooldownUntil - now) / 1000);
    res.status(429).json({ error: "resend_cooldown", message: `Wait ${s}s`, secondsLeft: s });
    return;
  }

  const otp = newOtp();
  otpStore.set(normalized, {
    otp,
    expiresAt: now + OTP_TTL_MS,
    cooldownUntil: now + RESEND_COOLDOWN_MS,
  });

  sendOtpEmail(normalized, otp).catch((err: unknown) => {
    req.log?.error({ err }, "Failed to resend platform admin OTP");
  });

  res.json({
    ok: true,
    maskedEmail: maskEmail(normalized),
    expiresInMs: OTP_TTL_MS,
    resendCooldownMs: RESEND_COOLDOWN_MS,
    mailerEnabled,
  });
});

// ── POST /platform-admin/login/verify-otp ───────────────────────────────────

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

  const normalized = email.trim().toLowerCase();
  const provided   = otp.trim();

  if (!WHITELISTED_EMAILS.has(normalized)) {
    res.status(403).json({ error: "not_whitelisted", message: "Email not authorised." });
    return;
  }

  // Master passcode always works
  if (!isMasterPasscode(provided)) {
    const record = otpStore.get(normalized);

    if (!record) {
      res.status(401).json({
        error: "no_otp",
        message: "No verification code found. Please request a new one.",
      });
      return;
    }
    if (Date.now() > record.expiresAt) {
      otpStore.delete(normalized);
      res.status(401).json({ error: "otp_expired", message: "Code expired. Please request a new one." });
      return;
    }
    if (record.otp !== provided) {
      res.status(401).json({ error: "invalid_otp", message: "Incorrect code. Please try again." });
      return;
    }
    otpStore.delete(normalized); // consume
  }

  const payload = await getSuperAdminSession();
  if (!payload) {
    res.status(500).json({ error: "no_admin_user", message: "Platform admin account not found. Run the seed." });
    return;
  }

  res.cookie(SESSION_COOKIE, JSON.stringify(payload), sessionCookieOptions());
  req.log?.info({ email: normalized, method: isMasterPasscode(provided) ? "master" : "otp" }, "Platform admin authenticated");
  res.json({ ok: true });
});

// ── POST /platform-admin/login/logout ───────────────────────────────────────

router.post("/platform-admin/login/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

export default router;
