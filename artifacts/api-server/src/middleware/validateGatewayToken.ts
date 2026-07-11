/**
 * Edge Gateway Agent authentication.
 *
 * Gateway agents run outside the cloud API's session-cookie trust boundary —
 * they authenticate with a long-lived bearer token instead. This middleware
 * validates `Authorization: Bearer <token>` against the hashed tokens stored
 * in `gateway_tokens`, and attaches `req.gateway` on success.
 *
 * Tokens are never stored in plaintext (see routes/gateway.ts for issuance);
 * we hash the presented token the same way and compare hashes.
 */

import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db, gatewayTokensTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

export function hashGatewayToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export async function validateGatewayToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers["authorization"];
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: "unauthenticated", message: "Missing gateway bearer token" });
    return;
  }

  const tokenHash = hashGatewayToken(token);
  const [row] = await db
    .select()
    .from(gatewayTokensTable)
    .where(and(eq(gatewayTokensTable.tokenHash, tokenHash), isNull(gatewayTokensTable.revokedAt)))
    .limit(1);

  if (!row) {
    res.status(401).json({ error: "unauthenticated", message: "Invalid or revoked gateway token" });
    return;
  }

  req.gateway = { id: row.id, orgId: row.orgId, name: row.name };
  next();
}
