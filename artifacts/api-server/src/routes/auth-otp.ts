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
import { sendOtpEmail, mailerEnabled } from "../lib/mailer";
import crypto from "crypto";

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

  sendOtpEmail(n, otp).catch((err: unknown) => {
    req.log?.error({ err }, "Failed to send login OTP");
  });

  res.json({ ok: true, maskedEmail: mask(n), expiresInMs: OTP_TTL_MS, resendCooldownMs: RESEND_COOLDOWN_MS, mailerEnabled });
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
  sendOtpEmail(n, otp).catch((err: unknown) => { req.log?.error({ err }, "Failed to resend OTP"); });

  res.json({ ok: true, maskedEmail: mask(n), expiresInMs: OTP_TTL_MS, resendCooldownMs: RESEND_COOLDOWN_MS, mailerEnabled });
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

export default router;
