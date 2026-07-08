import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { logger } from "./logger";

export interface AuditLogEntry {
  orgId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Write an immutable audit log entry.
 * Fire-and-forget — errors are logged but never bubble up to the caller.
 */
export function writeAuditLog(entry: AuditLogEntry): void {
  db
    .insert(auditLogsTable)
    .values({
      id: randomUUID(),
      orgId: entry.orgId,
      userId: entry.userId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: (entry.metadata ?? {}) as Record<string, unknown>,
      createdAt: new Date(),
    })
    .then(() => {/* ok */})
    .catch((err: unknown) => logger.error({ err, entry }, "Failed to write audit log entry"));
}

/**
 * Convenience wrapper that reads orgId and userId from the Express request.
 */
export function auditLog(
  req: Request,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, unknown>,
): void {
  writeAuditLog({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    action,
    resourceType,
    resourceId,
    metadata,
  });
}
