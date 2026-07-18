/**
 * Platform Admin Authentication — two-step email OTP flow
 *
 * Step 1: POST /platform-admin/login/email
 *   - Validates email against whitelist
 *   - Generates a 6-digit OTP (stored in-memory, 5-min TTL)
 *   - Returns masked email for display
 *   - Master override: passcode 666666 always works regardless of email OTP
 *
 * Step 2: POST /platform-admin/login/verify-otp
 *   - Verifies OTP (or master passcode 666666)
 *   - Sets scada_session cookie as the platform super-admin
 *
 * POST /platform-admin/login/resend  — resend with 50s cooldown
 * POST /platform-admin/login/logout  — clear session
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

/** Master bypass — always accepted regardless of generated OTP */
const MASTER_PASSCODE = process.env.PLATFORM_ADMIN_PASSCODE ?? "666666";

/** OTP TTL in milliseconds (5 minutes) */
const OTP_TTL_MS = 5 * 60 * 1000;

/** Resend cooldown in milliseconds (50 seconds) */
const RESEND_COOLDOWN_MS = 50 * 1000;

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

// ── In-memory OTP store ───────────────────────────────────────────────────────

interface OtpRecord {
  otp: string;
  expiresAt: number;
  resendAllowedAt: number;
}

const otpStore = new Map<string, OtpRecord>();

// Purge expired OTPs every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, rec] of otpStore) {
    if (now > rec.expiresAt) otpStore.delete(email);
  }
}, 10 * 60 * 1000);

function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - 2, 6))}@${domain}`;
}

// ── Helper: look up the platform super-admin DB user ─────────────────────────

async function createSuperAdminSession(): Promise<SessionPayload | null> {
  const [admin] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.isSuperAdmin, true))
    .limit(1);
  if (!admin) return null;
  return { userId: admin.id, orgId: admin.orgId, roleId: admin.roleId };
}

// ── POST /platform-admin/login/email ─────────────────────────────────────────
// Step 1 — validate email, generate OTP

router.post("/platform-admin/login/email", (req, res) => {
  const { email } = req.body as { email?: unknown };

  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "invalid_body", message: "email is required" });
    return;
  }

  const normalised = email.trim().toLowerCase();

  if (!WHITELISTED_EMAILS.has(normalised)) {
    // Constant-time-ish: don't reveal whether the email exists
    res.status(403).json({
      error: "not_whitelisted",
      message: "This email address is not authorised for platform access.",
    });
    return;
  }

  // Check resend cooldown
  const existing = otpStore.get(normalised);
  if (existing && Date.now() < existing.resendAllowedAt) {
    const secondsLeft = Math.ceil((existing.resendAllowedAt - Date.now()) / 1000);
    res.status(429).json({
      error: "resend_cooldown",
      message: `Please wait ${secondsLeft}s before requesting a new code.`,
      secondsLeft,
      maskedEmail: maskEmail(normalised),
    });
    return;
  }

  const otp = generateOtp();
  const now = Date.now();
  otpStore.set(normalised, {
    otp,
    expiresAt: now + OTP_TTL_MS,
    resendAllowedAt: now + RESEND_COOLDOWN_MS,
  });

  // TODO: send otp via email (nodemailer/SES) when SMTP_HOST is configured
  // For now the master passcode 666666 always works as fallback.
  req.log?.info({ email: normalised }, "Platform admin OTP generated");

  res.json({
    ok: true,
    maskedEmail: maskEmail(normalised),
    expiresInMs: OTP_TTL_MS,
    resendCooldownMs: RESEND_COOLDOWN_MS,
  });
});

// ── POST /platform-admin/login/resend ────────────────────────────────────────

router.post("/platform-admin/login/resend", (req, res) => {
  const { email } = req.body as { email?: unknown };

  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "invalid_body", message: "email is required" });
    return;
  }

  const normalised = email.trim().toLowerCase();

  if (!WHITELISTED_EMAILS.has(normalised)) {
    res.status(403).json({ error: "not_whitelisted", message: "Email not authorised." });
    return;
  }

  const existing = otpStore.get(normalised);
  if (existing && Date.now() < existing.resendAllowedAt) {
    const secondsLeft = Math.ceil((existing.resendAllowedAt - Date.now()) / 1000);
    res.status(429).json({ error: "resend_cooldown", message: `Wait ${secondsLeft}s`, secondsLeft });
    return;
  }

  const otp = generateOtp();
  const now = Date.now();
  otpStore.set(normalised, {
    otp,
    expiresAt: now + OTP_TTL_MS,
    resendAllowedAt: now + RESEND_COOLDOWN_MS,
  });

  req.log?.info({ email: normalised }, "Platform admin OTP resent");
  res.json({ ok: true, maskedEmail: maskEmail(normalised), expiresInMs: OTP_TTL_MS, resendCooldownMs: RESEND_COOLDOWN_MS });
});

// ── POST /platform-admin/login/verify-otp ────────────────────────────────────
// Step 2 — verify OTP, set session

router.post("/platform-admin/login/verify-otp", async (req, res) => {
  const { email, otp } = req.body as { email?: unknown; otp?: unknown };

  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "invalid_body", message: "email is required" });
    return;
  }
  if (typeof otp !== "string" || !otp.trim()) {
    res.status(400).json({ error: "invalid_body", message: "otp is required" });
    return;
  }

  const normalised = email.trim().toLowerCase();
  const providedOtp = otp.trim();

  if (!WHITELISTED_EMAILS.has(normalised)) {
    res.status(403).json({ error: "not_whitelisted", message: "Email not authorised." });
    return;
  }

  // Always accept the master passcode via timing-safe compare
  const masterBuf = Buffer.from(MASTER_PASSCODE.padEnd(32));
  const providedBuf = Buffer.from(providedOtp.padEnd(32));
  const isMaster =
    masterBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(masterBuf, providedBuf) &&
    providedOtp === MASTER_PASSCODE;

  if (!isMaster) {
    // Check generated OTP
    const record = otpStore.get(normalised);
    if (!record) {
      res.status(401).json({ error: "no_otp", message: "No OTP found for this email. Please request a new code." });
      return;
    }
    if (Date.now() > record.expiresAt) {
      otpStore.delete(normalised);
      res.status(401).json({ error: "otp_expired", message: "OTP has expired. Please request a new code." });
      return;
    }
    if (record.otp !== providedOtp) {
      res.status(401).json({ error: "invalid_otp", message: "Incorrect code. Please try again." });
      return;
    }
    // Valid — consume it
    otpStore.delete(normalised);
  }

  const payload = await createSuperAdminSession();
  if (!payload) {
    res.status(500).json({ error: "no_admin_user", message: "Platform admin account not found." });
    return;
  }

  res.cookie(SESSION_COOKIE, JSON.stringify(payload), sessionCookieOptions());
  req.log?.info({ email: normalised, method: isMaster ? "master" : "otp" }, "Platform admin authenticated");
  res.json({ ok: true });
});

// ── POST /platform-admin/login/logout ────────────────────────────────────────

router.post("/platform-admin/login/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

export default router;
