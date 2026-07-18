/**
 * Mailer — thin nodemailer wrapper.
 *
 * Configure via environment variables:
 *   SMTP_HOST     e.g. smtp.gmail.com
 *   SMTP_PORT     e.g. 465 (SSL) or 587 (STARTTLS)
 *   SMTP_SECURE   "true" for port 465, leave unset/false for 587
 *   SMTP_USER     your Gmail / SMTP username
 *   SMTP_PASS     app-password or SMTP password
 *   SMTP_FROM     display name + address e.g. "Mystics Platform <noreply@automystics.com>"
 *
 * If SMTP_HOST is not set the mailer is disabled and sendMail() is a no-op
 * (the 666666 master passcode still allows login).
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
  if (!transport) {
    // SMTP not configured — log OTP in dev so it's visible in server logs
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] OTP for ${to}: ${otp}`);
    }
    return;
  }

  const from =
    process.env.SMTP_FROM ?? `"Mystics Platform" <${process.env.SMTP_USER}>`;

  await transport.sendMail({
    from,
    to,
    subject: "Your Mystics Platform admin verification code",
    text: `Your one-time verification code is: ${otp}\n\nThis code expires in 5 minutes.\n\nIf you did not request this, ignore this email.`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f1629;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px;text-align:center;">
            <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
              <span style="font-size:28px;">🛡️</span>
            </div>
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
            <p style="color:#6b7280;font-size:13px;margin:0;">This code expires in <strong>5 minutes</strong>. Do not share it with anyone.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">If you did not request this code, ignore this email. Your account remains secure.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
