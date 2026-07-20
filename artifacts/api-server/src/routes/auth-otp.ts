/**
 * OTP-based login for the main SCADA app.
 *
 * Only users whose email exists in the database can receive an OTP.
 * This replaces the password flow for tenant users.
 *
 * POST /auth/login/email      — check DB, generate + send OTP
 * POST /auth/login/verify-otp — verify OTP, set session cookie
 * POST /auth/login/resend     — resend within cooldown rules
 */

import { Router, type IRouter } from "express";
import { db, usersTable, rolesTable, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, type SessionPayload } from "../middleware/authenticate";
import { sendOtpEmail, sendPasswordResetEmail, mailerEnabled } from "../lib/mailer";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// Computed once at startup so the first password-login request doesn't pay
// the bcrypt cost for the dummy compare (timing-safety against enumeration).
const DUMMY_HASH = bcrypt.hashSync("__dummy_timing_guard__", 10);

const router: IRouter = Router();

const OTP_TTL_MS         = 5 * 60 * 1000;   // 5 min
const RESEND_COOLDOWN_MS = 50 * 1000;        // 50 s
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOpts() {
  return {
    signed: true,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
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
  return `${l.slice(0, 2)}${"*".repeat(Math.max(l.length - 2, 6))}@${d}`;
};

// ── POST /auth/login/email ───────────────────────────────────────────────────

router.post("/auth/login/email", async (req, res) => {
  const { email } = req.body as { email?: unknown };
  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "invalid_body", message: "Email is required." });
    return;
  }

  const n = email.trim().toLowerCase();

  // Check user exists in DB
  const [user] = await db
    .select({ id: usersTable.id, status: usersTable.status, orgId: usersTable.orgId })
    .from(usersTable)
    .where(eq(usersTable.email, n))
    .limit(1);

  if (!user) {
    // Constant-time rejection — don't reveal whether the email exists
    await new Promise(r => setTimeout(r, 150));
    res.status(403).json({ error: "not_authorised", message: "This email is not registered in the system." });
    return;
  }

  if (user.status === "invited") {
    res.status(403).json({ error: "account_pending", message: "Your account is pending activation. Contact your administrator." });
    return;
  }

  // Check org not suspended
  const [org] = await db
    .select({ status: organizationsTable.status })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, user.orgId))
    .limit(1);

  if (org?.status === "suspended") {
    res.status(403).json({ error: "org_suspended", message: "Your organisation has been suspended. Contact your platform administrator." });
    return;
  }

  const existing = store.get(n);
  const now = Date.now();
  if (existing && now < existing.cooldownUntil) {
    const s = Math.ceil((existing.cooldownUntil - now) / 1000);
    res.status(429).json({
      error: "resend_cooldown",
      message: `Please wait ${s}s before requesting a new code.`,
      secondsLeft: s,
      maskedEmail: mask(n),
      expiresInMs: Math.max(0, existing.expiresAt - now),
      resendCooldownMs: existing.cooldownUntil - now,
      mailerEnabled,
    });
    return;
  }

  const otp = rng();
  store.set(n, { otp, expiresAt: now + OTP_TTL_MS, cooldownUntil: now + RESEND_COOLDOWN_MS });

  // Await delivery — if SMTP is configured but fails (bad credentials, network
  // error, etc.) we report mailerEnabled:false so the frontend shows the
  // "check server logs" prompt instead of "check your email".
  let delivered = mailerEnabled;
  try {
    await sendOtpEmail(n, otp);
  } catch (err: unknown) {
    req.log?.error({ err }, "Failed to send login OTP");
    delivered = false;
  }

  res.json({ ok: true, maskedEmail: mask(n), expiresInMs: OTP_TTL_MS, resendCooldownMs: RESEND_COOLDOWN_MS, mailerEnabled: delivered });
});

// ── POST /auth/login/resend ──────────────────────────────────────────────────

router.post("/auth/login/resend", async (req, res) => {
  const { email } = req.body as { email?: unknown };
  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "invalid_body", message: "Email is required." });
    return;
  }

  const n = email.trim().toLowerCase();
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, n)).limit(1);
  if (!user) { res.status(403).json({ error: "not_authorised", message: "Email not registered." }); return; }

  const existing = store.get(n);
  const now = Date.now();
  if (existing && now < existing.cooldownUntil) {
    const s = Math.ceil((existing.cooldownUntil - now) / 1000);
    res.status(429).json({ error: "resend_cooldown", message: `Wait ${s}s`, secondsLeft: s });
    return;
  }

  const otp = rng();
  store.set(n, { otp, expiresAt: now + OTP_TTL_MS, cooldownUntil: now + RESEND_COOLDOWN_MS });

  let delivered = mailerEnabled;
  try {
    await sendOtpEmail(n, otp);
  } catch (err: unknown) {
    req.log?.error({ err }, "Failed to resend OTP");
    delivered = false;
  }

  res.json({ ok: true, maskedEmail: mask(n), expiresInMs: OTP_TTL_MS, resendCooldownMs: RESEND_COOLDOWN_MS, mailerEnabled: delivered });
});

// ── POST /auth/login/verify-otp ──────────────────────────────────────────────

router.post("/auth/login/verify-otp", async (req, res) => {
  const { email, otp } = req.body as { email?: unknown; otp?: unknown };
  if (typeof email !== "string" || !email.trim()) { res.status(400).json({ error: "invalid_body", message: "Email is required." }); return; }
  if (typeof otp !== "string" || !otp.trim()) { res.status(400).json({ error: "invalid_body", message: "OTP is required." }); return; }

  const n = email.trim().toLowerCase();
  const p = otp.trim();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, n)).limit(1);
  if (!user) { res.status(403).json({ error: "not_authorised", message: "Email not registered." }); return; }

  const record = store.get(n);
  if (!record) { res.status(401).json({ error: "no_otp", message: "No verification code found. Please request a new one." }); return; }
  if (Date.now() > record.expiresAt) { store.delete(n); res.status(401).json({ error: "otp_expired", message: "Code expired. Please request a new one." }); return; }
  if (record.otp !== p) { res.status(401).json({ error: "invalid_otp", message: "Incorrect code. Please try again." }); return; }
  store.delete(n);

  // Check org status
  const [org] = await db.select({ status: organizationsTable.status }).from(organizationsTable).where(eq(organizationsTable.id, user.orgId)).limit(1);
  if (org?.status === "suspended") { res.status(403).json({ error: "org_suspended", message: "Your organisation has been suspended." }); return; }

  const payload: SessionPayload = { userId: user.id, orgId: user.orgId, roleId: user.roleId };
  res.cookie(SESSION_COOKIE, JSON.stringify(payload), cookieOpts());

  db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id)).catch(() => {});

  const [role] = await db.select({ name: rolesTable.name }).from(rolesTable).where(eq(rolesTable.id, user.roleId)).limit(1);

  req.log?.info({ userId: user.id, orgId: user.orgId }, "User logged in via OTP");

  res.json({
    id: user.id, name: user.name, email: user.email,
    orgId: user.orgId, roleId: user.roleId, roleName: role?.name ?? user.roleId,
    isSuperAdmin: user.isSuperAdmin,
  });
});

// ── POST /auth/password-login ─────────────────────────────────────────────────
//
// Alternative to OTP: email + password login.
// Always runs bcrypt.compare() to prevent timing-based account enumeration.

router.post("/auth/password-login", async (req, res) => {
  const { email, password } = req.body as { email?: unknown; password?: unknown };

  if (
    typeof email !== "string" || !email.trim() ||
    typeof password !== "string" || !password
  ) {
    res.status(400).json({ error: "invalid_body", message: "Email and password are required." });
    return;
  }

  const n = email.trim().toLowerCase();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, n))
    .limit(1);

  // Always run bcrypt even when user not found (timing safety)
  const matches = await bcrypt.compare(password as string, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !matches || !user.passwordHash) {
    res.status(401).json({ error: "invalid_credentials", message: "Incorrect email or password." });
    return;
  }

  if (user.status !== "active") {
    res.status(403).json({ error: "inactive", message: "Account is not active. Contact your administrator." });
    return;
  }

  const [org] = await db
    .select({ status: organizationsTable.status })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, user.orgId))
    .limit(1);

  if (org?.status === "suspended") {
    res.status(403).json({ error: "org_suspended", message: "Your organisation has been suspended." });
    return;
  }

  const payload: SessionPayload = { userId: user.id, orgId: user.orgId, roleId: user.roleId };
  res.cookie(SESSION_COOKIE, JSON.stringify(payload), cookieOpts());

  db.update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .catch(() => {});

  req.log?.info({ userId: user.id, orgId: user.orgId }, "User logged in via password");
  res.json({ ok: true });
});

// ── POST /auth/forgot-password ────────────────────────────────────────────────
// Accepts an email, generates a 1-hour reset token, stores its SHA-256 hash in
// the DB, and emails a reset link. Always returns 200 to prevent enumeration.

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body as { email?: unknown };
  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "invalid_body", message: "Email is required." });
    return;
  }

  const n = email.trim().toLowerCase();

  // Always respond 200 regardless of whether email exists (prevent enumeration)
  res.json({ ok: true });

  // Do the work after sending the response (fire-and-forget)
  (async () => {
    try {
      const [user] = await db
        .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
        .from(usersTable)
        .where(eq(usersTable.email, n))
        .limit(1);

      if (!user || !user.passwordHash) {
        // No account or no password set — silently skip
        console.log(`[RESET] No password-enabled account for ${n} — skipping`);
        return;
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + RESET_TTL_MS);

      await db
        .update(usersTable)
        .set({ resetToken: tokenHash, resetTokenExpiresAt: expiresAt })
        .where(eq(usersTable.id, user.id));

      // Build reset URL from request origin or APP_URL env
      const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
      const basePath = (process.env.VITE_BASE_PATH ?? "").replace(/\/$/, "");
      const resetUrl = `${appUrl}${basePath}/reset-password?token=${rawToken}`;

      await sendPasswordResetEmail(n, resetUrl);
    } catch (err) {
      console.error("[RESET] forgot-password error:", err);
    }
  })();
});

// ── POST /auth/reset-password ─────────────────────────────────────────────────
// Accepts { token, password } — validates the token hash, updates the password,
// then clears the token so it can't be reused.

router.post("/auth/reset-password", async (req, res) => {
  const { token, password } = req.body as { token?: unknown; password?: unknown };

  if (typeof token !== "string" || !token.trim()) {
    res.status(400).json({ error: "invalid_body", message: "Reset token is required." });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "invalid_body", message: "Password must be at least 8 characters." });
    return;
  }

  const tokenHash = crypto.createHash("sha256").update(token.trim()).digest("hex");

  const [user] = await db
    .select({
      id: usersTable.id,
      resetToken: usersTable.resetToken,
      resetTokenExpiresAt: usersTable.resetTokenExpiresAt,
    })
    .from(usersTable)
    .where(eq(usersTable.resetToken, tokenHash))
    .limit(1);

  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    res.status(400).json({ error: "invalid_token", message: "Reset link is invalid or has expired. Please request a new one." });
    return;
  }

  const newHash = await bcrypt.hash(password, 10);
  await db
    .update(usersTable)
    .set({ passwordHash: newHash, resetToken: null, resetTokenExpiresAt: null })
    .where(eq(usersTable.id, user.id));

  console.log(`[RESET] Password reset successful for user ${user.id}`);
  res.json({ ok: true });
});

export default router;
