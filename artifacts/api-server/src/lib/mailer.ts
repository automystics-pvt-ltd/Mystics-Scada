/**
 * Mailer — nodemailer wrapper with startup verification.
 *
 * Env vars:
 *   SMTP_HOST     smtp.gmail.com
 *   SMTP_PORT     587 (STARTTLS) or 465 (SSL)
 *   SMTP_SECURE   "true" for port 465, omit/false for 587
 *   SMTP_USER     your Gmail address
 *   SMTP_PASS     Gmail App Password — spaces are stripped automatically
 *   SMTP_FROM     "Display Name <email>"  (optional, defaults to SMTP_USER)
 */

import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_USER = process.env.SMTP_USER?.trim() ?? "";
// Gmail App Passwords are 16 chars; spaces are only for readability — strip them
const SMTP_PASS = (process.env.SMTP_PASS ?? "").replace(/\s+/g, "");
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";

function createTransport() {
  if (!SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const transport = createTransport();
export const mailerEnabled = transport !== null;

// Verify SMTP connection on startup — errors appear in journalctl immediately
if (transport) {
  transport.verify().then(() => {
    console.log(`[SMTP] ✅ Connected to ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER}`);
  }).catch((err: Error) => {
    console.error(`[SMTP] ❌ Connection failed — ${err.message}`);
    console.error("[SMTP] Check SMTP_HOST / SMTP_USER / SMTP_PASS in .env");
  });
} else {
  console.warn("[SMTP] Disabled — SMTP_HOST not set in .env");
}

export async function sendTestEmail(to: string): Promise<void> {
  if (!transport) throw new Error("SMTP not configured");
  const from = process.env.SMTP_FROM?.trim() ?? `"Mystics Platform" <${SMTP_USER}>`;
  await transport.sendMail({
    from, to,
    subject: "Mystics Platform — SMTP Test",
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
      <h2 style="color:#7c3aed">✅ SMTP Test Successful</h2>
      <p>This test email confirms your SMTP configuration is working correctly.</p>
      <p style="color:#6b7280;font-size:13px">Sent from: ${from}<br>Sent at: ${new Date().toISOString()}</p>
    </div>`,
    text: `Mystics Platform SMTP Test — Your email configuration is working. Sent at ${new Date().toISOString()}`,
  });
  console.log(`[SMTP] ✅ Test email sent to ${to}`);
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  // Always log — visible in: journalctl -u solar-scada-api -n 30 | grep OTP
  console.log(`[OTP] to=${to}  code=${otp}  smtp=${mailerEnabled ? "on" : "OFF"}`);

  if (!transport) {
    console.warn("[OTP] No SMTP transport — add SMTP_HOST to .env and restart");
    return;
  }

  const from = process.env.SMTP_FROM?.trim() ?? `"Mystics Platform" <${SMTP_USER}>`;

  try {
    const info = await transport.sendMail({
      from, to,
      subject: "Your Mystics Platform verification code",
      text: `Your one-time code: ${otp}\n\nExpires in 5 minutes. Do not share it.`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f1629;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:28px;text-align:center;">
  <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Mystics Platform</h1>
  <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px;">Admin Console</p>
</td></tr>
<tr><td style="padding:32px;">
  <p style="color:#374151;font-size:15px;margin:0 0 8px;">Your one-time verification code:</p>
  <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;margin:16px 0;">
    <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#4f46e5;font-family:monospace;">${otp}</span>
  </div>
  <p style="color:#6b7280;font-size:13px;margin:0;">Expires in <strong>5 minutes</strong>. Do not share this code.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <p style="color:#9ca3af;font-size:12px;margin:0;">If you did not request this, ignore this email.</p>
</td></tr>
</table></td></tr></table></body></html>`,
    });
    console.log(`[OTP] ✅ Email delivered to ${to} (messageId: ${info.messageId})`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[OTP] ❌ SMTP failed to ${to}: ${msg}`);
    // Throw so caller knows delivery failed, but OTP is still in logs above
    throw err;
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  console.log(`[RESET] to=${to}  url=${resetUrl}  smtp=${mailerEnabled ? "on" : "OFF"}`);
  if (!transport) throw new Error("SMTP not configured — cannot send password reset email.");

  const from = process.env.SMTP_FROM?.trim() ?? `"Solar SCADA" <${SMTP_USER}>`;
  try {
    const info = await transport.sendMail({
      from, to,
      subject: "Solar SCADA — Password reset link",
      text: `Reset your password by visiting the link below (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f1629;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:28px;text-align:center;">
  <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Solar SCADA</h1>
  <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px;">Automystics Technologies</p>
</td></tr>
<tr><td style="padding:32px;">
  <p style="color:#374151;font-size:15px;margin:0 0 16px;">We received a request to reset the password for your account (<strong>${to}</strong>).</p>
  <div style="text-align:center;margin:24px 0;">
    <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:12px;">Reset password</a>
  </div>
  <p style="color:#6b7280;font-size:13px;margin:0;">This link expires in <strong>1 hour</strong>. If you did not request a reset, ignore this email.</p>
  <p style="color:#9ca3af;font-size:11px;margin:16px 0 0;">Or copy this URL into your browser:<br><span style="color:#6366f1;word-break:break-all;">${resetUrl}</span></p>
</td></tr>
</table></td></tr></table></body></html>`,
    });
    console.log(`[RESET] ✅ Email delivered to ${to} (messageId: ${info.messageId})`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[RESET] ❌ SMTP failed to ${to}: ${msg}`);
    throw err;
  }
}

// ── SMTP diagnostics — used by /api/smtp-test ─────────────────────────────
export async function smtpDiagnostics(): Promise<{
  configured: boolean; host: string; port: number; user: string;
  passLength: number; connected?: boolean; error?: string;
}> {
  const base = {
    configured: !!SMTP_HOST,
    host: SMTP_HOST ?? "(not set)",
    port: SMTP_PORT,
    user: SMTP_USER || "(not set)",
    passLength: SMTP_PASS.length,
  };
  if (!transport) return base;
  try {
    await transport.verify();
    return { ...base, connected: true };
  } catch (err: unknown) {
    return { ...base, connected: false, error: err instanceof Error ? err.message : String(err) };
  }
}
