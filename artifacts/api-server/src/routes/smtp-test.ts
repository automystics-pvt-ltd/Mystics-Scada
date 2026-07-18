/**
 * SMTP diagnostics + test-send endpoint (no auth required).
 * GET  /api/smtp-test          — returns SMTP config status
 * POST /api/smtp-test/send     — sends a real test email
 */
import { Router } from "express";
import { sendOtpEmail, smtpDiagnostics, mailerEnabled } from "../lib/mailer";

const router = Router();

router.get("/smtp-test", async (_req, res) => {
  const d = await smtpDiagnostics();
  res.json({ ok: true, mailerEnabled, ...d });
});

router.post("/smtp-test/send", async (req, res) => {
  const { to } = req.body as { to?: string };
  if (!to) { res.status(400).json({ error: "to email required" }); return; }
  if (!mailerEnabled) {
    res.status(503).json({
      ok: false,
      error: "SMTP not configured",
      fix: "Add SMTP_HOST, SMTP_USER, SMTP_PASS to .env then restart solar-scada-api",
    });
    return;
  }
  try {
    await sendOtpEmail(to.trim(), "123456");
    res.json({ ok: true, message: `Test OTP sent to ${to}` });
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
