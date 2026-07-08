/**
 * createNotification — persists an in-app notification, pushes it to SSE
 * clients in real-time, and asynchronously attempts email + webhook delivery.
 */

import { randomUUID, createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, notificationsTable, notificationConfigsTable } from "@workspace/db";
import { pushNotificationToOrg } from "./notificationRegistry";
import { validateWebhookUrlStructure, validateWebhookUrlDns, SsrfBlockedError } from "./webhookSsrf";
import { logger } from "./logger";

export interface NotificationPayload {
  orgId: string;
  /** e.g. "alarm.critical" | "alarm.major" | "work_order.status" | "device.offline" */
  type: string;
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string;
  /** Frontend path for click-through, e.g. "/alerts?id=…" */
  resourceUrl?: string;
}

/**
 * Write + push a notification.  Always fire-and-forget — errors are logged,
 * never thrown, so callers don't need try/catch.
 */
export function createNotification(payload: NotificationPayload): void {
  const id = randomUUID();
  const now = new Date();

  db
    .insert(notificationsTable)
    .values({
      id,
      orgId: payload.orgId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      resourceType: payload.resourceType ?? null,
      resourceId: payload.resourceId ?? null,
      resourceUrl: payload.resourceUrl ?? null,
      isRead: false,
      createdAt: now,
    })
    .then(() => {
      // Push real-time SSE event to all connected org clients
      pushNotificationToOrg(payload.orgId, {
        id,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        resourceType: payload.resourceType,
        resourceId: payload.resourceId,
        resourceUrl: payload.resourceUrl,
        isRead: false,
        createdAt: now.toISOString(),
      });

      // Async delivery (email + webhook) — never block the main response
      void deliverNotification(payload.orgId, payload.type, {
        id,
        ...payload,
        createdAt: now.toISOString(),
      });
    })
    .catch((err: unknown) =>
      logger.error({ err, payload }, "Failed to persist notification"),
    );
}

/* ── Delivery helpers ────────────────────────────────────────────────── */

interface WebhookConfig {
  url?: string;
  secret?: string;
  enabledEvents?: string[];
}

interface EmailEventConfig {
  enabled: boolean;
  email: string;
}

async function deliverNotification(
  orgId: string,
  eventType: string,
  notificationData: unknown,
): Promise<void> {
  try {
    const configs = await db
      .select()
      .from(notificationConfigsTable)
      .where(eq(notificationConfigsTable.orgId, orgId));

    for (const config of configs) {
      if (config.channel === "email") {
        const rules = config.rules as Record<string, EmailEventConfig>;
        const rule = rules[eventType];
        if (rule?.enabled && rule.email?.trim()) {
          // Email delivery stub — logs in dev; swap for nodemailer in prod
          logger.info(
            { orgId, eventType, recipients: rule.email },
            "[notify:email] Would send notification email",
          );
          // Example nodemailer stub (add SMTP config to env for real delivery):
          // await transporter.sendMail({
          //   from: process.env.SMTP_FROM ?? "noreply@solar-scada.io",
          //   to: rule.email,
          //   subject: `[Solar SCADA] ${(notificationData as any).title}`,
          //   text: (notificationData as any).message,
          // });
        }
      }

      if (config.channel === "webhook") {
        const wh = config.rules as WebhookConfig;
        if (
          wh.url &&
          (!wh.enabledEvents || wh.enabledEvents.includes(eventType))
        ) {
          await deliverWebhook(wh.url, wh.secret ?? "", notificationData);
        }
      }
    }
  } catch (err) {
    logger.error({ err, orgId, eventType }, "Notification delivery error");
  }
}

async function deliverWebhook(
  url: string,
  secret: string,
  payload: unknown,
): Promise<void> {
  // SSRF: structural check (protocol + bare-IP ranges) then DNS rebind check
  let parsedUrl: URL;
  try {
    parsedUrl = validateWebhookUrlStructure(url);
    await validateWebhookUrlDns(parsedUrl);
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      logger.warn({ url, reason: err.message }, "[notify:webhook] Blocked by SSRF guard");
      return;
    }
    throw err;
  }

  const body = JSON.stringify(payload);
  const ts = new Date().toISOString();

  // Only include an HMAC signature when the tenant has configured a secret.
  // Omitting the header for unsigned webhooks avoids creating a false
  // integrity signal with a predictable key.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-SCADA-Timestamp": ts,
  };
  if (secret) {
    const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    headers["X-SCADA-Signature"] = `sha256=${sig}`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    logger.info({ url, status: res.status, signed: !!secret }, "[notify:webhook] Delivered");
  } catch (err) {
    logger.warn({ url, err }, "[notify:webhook] Delivery failed");
  }
}
