/**
 * Mailer — nodemailer wrapper.
 *
 * OTP is ALWAYS logged to server console (check: journalctl -u solar-scada-api -n 50)
 * so it's retrievable even when SMTP is not configured.
 *
 * Env vars:
 *   SMTP_HOST     e.g. smtp.gmail.com
 *   SMTP_PORT     587 (STARTTLS) or 465 (SSL)
 *   SMTP_SECURE   "true" for port 465, omit for 587
 *   SMTP_USER     Gmail address
 *   SMTP_PASS     Gmail app-password (16 chars, no spaces)
 *   SMTP_FROM     e.g. "Mystics Platform <automystics.ai@gmail.com>"
 */

import nodemailer from "nodemailer";

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
  });
}

const transport = createTransport();

export const mailerEnabled = transport !== null;

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  // Always print to stdout — visible in journalctl even in production
  console.log(`[OTP] to=${to} code=${otp} smtp=${mailerEnabled ? "on" : "off"}`);

  if (!transport) {
    console.warn("[OTP] SMTP_HOST not set — OTP above is the only delivery method.");
    return;
  }

  const from = process.env.SMTP_FROM ?? `"Mystics Platform" <${process.env.SMTP_USER}>`;

  try {
    await transport.sendMail({
      from,
      to,
      subject: "Your Mystics Platform verification code",
      text: `Your one-time code: ${otp}\n\nExpires in 5 minutes. Do not share it.`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f1629;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:28px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Mystics Platform</h1>
          <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px;">Admin Console</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <p style="color:#374151;font-size:15px;margin:0 0 8px;">Your one-time verification code:</p>
          <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;margin:16px 0;">
            <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#4f46e5;font-family:monospace;">${otp}</span>
          </div>
          <p style="color:#6b7280;font-size:13px;margin:0;">Expires in <strong>5 minutes</strong>. Do not share this code.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">If you did not request this, ignore this email.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`,
    });
    console.log(`[OTP] Email delivered to ${to}`);
  } catch (err) {
    console.error(`[OTP] SMTP delivery failed to ${to}:`, err);
    // Don't re-throw — OTP was already logged above, so it's still usable
  }
}
