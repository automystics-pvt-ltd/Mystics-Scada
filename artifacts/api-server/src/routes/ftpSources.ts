/**
 * FTP / SFTP data source CRUD routes
 * GET    /ftp-sources          — list all for org
 * POST   /ftp-sources          — create
 * PATCH  /ftp-sources/:id      — update
 * DELETE /ftp-sources/:id      — delete
 * POST   /ftp-sources/:id/test — test connection
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import { ftpSourcesTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "../middleware/requirePermission";
import { resolveOrgId } from "../lib/orgScope";
import { encryptCredential, decryptCredential } from "../lib/credentialCrypto";

const router = Router();

const FtpSourceBody = z.object({
  name:            z.string().min(1).max(100),
  host:            z.string().min(1),
  port:            z.number().int().min(1).max(65535).default(21),
  protocol:        z.enum(["ftp", "ftps", "sftp"]).default("ftp"),
  username:        z.string().min(1),
  password:        z.string().min(1),
  remotePath:      z.string().default("/"),
  filePattern:     z.string().default("*.csv"),
  intervalMinutes: z.number().int().min(1).max(1440).default(60),
  deviceId:        z.string().optional(),
  active:          z.boolean().default(true),
});

// ── GET /ftp-sources ──────────────────────────────────────────────────────────

router.get("/ftp-sources", requirePermission("device.view"), async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) { res.status(400).json({ error: "org_required" }); return; }

  const rows = await db
    .select()
    .from(ftpSourcesTable)
    .where(eq(ftpSourcesTable.orgId, orgId))
    .orderBy(ftpSourcesTable.name);

  // Strip encrypted password from response
  res.json(rows.map(({ passwordEnc: _, ...r }) => r));
});

// ── POST /ftp-sources ────────────────────────────────────────────────────────

router.post("/ftp-sources", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) { res.status(400).json({ error: "org_required" }); return; }

  const body = FtpSourceBody.parse(req.body);
  const now = new Date();
  const [created] = await db.insert(ftpSourcesTable).values({
    id:              randomUUID(),
    orgId,
    name:            body.name,
    host:            body.host,
    port:            body.port,
    protocol:        body.protocol,
    username:        body.username,
    passwordEnc:     encryptCredential(body.password),
    remotePath:      body.remotePath,
    filePattern:     body.filePattern,
    intervalMinutes: body.intervalMinutes,
    deviceId:        body.deviceId ?? null,
    active:          body.active,
    createdAt:       now,
    updatedAt:       now,
  }).returning();

  const { passwordEnc: _, ...safe } = created!;
  res.status(201).json(safe);
});

// ── PATCH /ftp-sources/:id ───────────────────────────────────────────────────

router.patch("/ftp-sources/:id", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const id = String(req.params["id"] ?? "");
  const [existing] = await db.select().from(ftpSourcesTable).where(eq(ftpSourcesTable.id, id));
  if (!existing || (orgId && existing.orgId !== orgId)) {
    res.status(404).json({ error: "not_found" }); return;
  }

  const body = FtpSourceBody.partial().parse(req.body);
  const updates: Partial<typeof ftpSourcesTable.$inferInsert> = {
    updatedAt: new Date(),
    ...(body.name !== undefined            && { name: body.name }),
    ...(body.host !== undefined            && { host: body.host }),
    ...(body.port !== undefined            && { port: body.port }),
    ...(body.protocol !== undefined        && { protocol: body.protocol }),
    ...(body.username !== undefined        && { username: body.username }),
    ...(body.password !== undefined        && body.password !== "" && { passwordEnc: encryptCredential(body.password) }),
    ...(body.remotePath !== undefined      && { remotePath: body.remotePath }),
    ...(body.filePattern !== undefined     && { filePattern: body.filePattern }),
    ...(body.intervalMinutes !== undefined && { intervalMinutes: body.intervalMinutes }),
    ...(body.active !== undefined          && { active: body.active }),
    ...(body.deviceId !== undefined        && { deviceId: body.deviceId ?? null }),
  };

  const [updated] = await db.update(ftpSourcesTable).set(updates).where(eq(ftpSourcesTable.id, id)).returning();
  const { passwordEnc: _, ...safe } = updated!;
  res.json(safe);
});

// ── DELETE /ftp-sources/:id ──────────────────────────────────────────────────

router.delete("/ftp-sources/:id", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const id = String(req.params["id"] ?? "");
  const [existing] = await db.select().from(ftpSourcesTable).where(eq(ftpSourcesTable.id, id));
  if (!existing || (orgId && existing.orgId !== orgId)) {
    res.status(404).json({ error: "not_found" }); return;
  }
  await db.delete(ftpSourcesTable).where(and(eq(ftpSourcesTable.id, id), eq(ftpSourcesTable.orgId, orgId ?? existing.orgId)));
  res.json({ ok: true });
});

// ── POST /ftp-sources/:id/test ───────────────────────────────────────────────

router.post("/ftp-sources/:id/test", requirePermission("device.manage"), async (req, res) => {
  const orgId = resolveOrgId(req);
  const id = String(req.params["id"] ?? "");
  const [row] = await db.select().from(ftpSourcesTable).where(eq(ftpSourcesTable.id, id));
  if (!row || (orgId && row.orgId !== orgId)) {
    res.status(404).json({ error: "not_found" }); return;
  }

  const t0 = Date.now();
  try {
    if (row.protocol === "sftp") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SftpClient = (await import("ssh2-sftp-client")).default as new() => { connect(opts: object): Promise<void>; list(path: string): Promise<unknown[]>; end(): Promise<void> };
      const sftp = new SftpClient();
      await sftp.connect({ host: row.host, port: row.port, username: row.username, password: decryptCredential(row.passwordEnc) });
      const list = await sftp.list(row.remotePath);
      await sftp.end();
      res.json({ ok: true, latencyMs: Date.now() - t0, fileCount: list.length });
    } else {
      const ftp = await import("basic-ftp");
      const client = new ftp.Client(8000);
      await client.access({ host: row.host, port: row.port, user: row.username, password: decryptCredential(row.passwordEnc), secure: row.protocol === "ftps" });
      await client.cd(row.remotePath);
      const list = await client.list();
      client.close();
      res.json({ ok: true, latencyMs: Date.now() - t0, fileCount: list.length });
    }
  } catch (err) {
    res.json({ ok: false, latencyMs: Date.now() - t0, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
