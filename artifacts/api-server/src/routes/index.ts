import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import authOtpRouter from "./auth-otp";
import platformAdminAuthRouter from "./platform-admin-auth";
import smtpTestRouter from "./smtp-test";
import portfolioRouter from "./portfolio";
import plantsRouter from "./plants";
import invertersRouter from "./inverters";
import alertsRouter from "./alerts";
import workOrdersRouter from "./workOrders";
import reportsRouter from "./reports";
import insightsRouter from "./insights";
import rolesRouter from "./roles";
import usersRouter from "./users";
import streamRouter from "./stream";
import faultInjectRouter from "./faultInject";
import devicesRouter from "./devices";
import deviceTemplatesRouter from "./deviceTemplates";
import orgRouter from "./org";
import notificationsRouter from "./notifications";
import superadminRouter from "./superadmin";
import superadminDbRouter from "./superadmin-db";
import ftpSourcesRouter from "./ftpSources";
import { gatewayAdminRouter, gatewayAgentRouter } from "./gateway";
import ingestRouter from "./ingest";
import { authenticate } from "../middleware/authenticate";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";
import { resolveOrgId } from "../lib/orgScope";

const router: IRouter = Router();

// Always-public routes (no auth required)
router.use(healthRouter);
router.use(authRouter);
router.use(authOtpRouter);
router.use(platformAdminAuthRouter);
router.use(smtpTestRouter);

// ── File delivery endpoints — VPS uses wget to pull latest source files ──────
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { DEPLOY_SCRIPT } from "../lib/deploy-script";

// Resolve a path relative to the monorepo root (2 levels up from api-server CWD)
function repoFile(...parts: string[]): string {
  return resolve(process.cwd(), "../..", ...parts);
}

function serveFile(filePath: string, res: import("express").Response): void {
  if (!existsSync(filePath)) { res.status(404).end(`Not found: ${filePath}`); return; }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(readFileSync(filePath, "utf8"));
}

// deploy.sh is embedded inline — always works, even when the file doesn't exist on disk
router.get("/deploy.sh", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(DEPLOY_SCRIPT);
});
router.get("/src/auth-otp",           (_req, res) => serveFile(repoFile("artifacts/api-server/src/routes/auth-otp.ts"), res));
router.get("/src/platform-admin-auth",(_req, res) => serveFile(repoFile("artifacts/api-server/src/routes/platform-admin-auth.ts"), res));
router.get("/src/mailer",             (_req, res) => serveFile(repoFile("artifacts/api-server/src/lib/mailer.ts"), res));
router.get("/src/routes-index",       (_req, res) => serveFile(repoFile("artifacts/api-server/src/routes/index.ts"), res));
router.get("/src/app-tsx",            (_req, res) => serveFile(repoFile("artifacts/solar-scada/src/App.tsx"), res));
router.get("/src/login-tsx",          (_req, res) => serveFile(repoFile("artifacts/solar-scada/src/pages/login.tsx"), res));
router.get("/src/platform-admin-tsx", (_req, res) => serveFile(repoFile("artifacts/solar-scada/src/pages/platform-admin-login.tsx"), res));

// Full DB schema SQL — VPS runs this to create all tables
router.get("/dist/schema.sql", (_req, res) => {
  const p = repoFile("lib/db/drizzle/schema_clean.sql");
  if (!existsSync(p)) { res.status(404).end("schema not generated"); return; }
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(p);
});

// Pre-built dist — VPS downloads and replaces, no build step needed.
// Uses createReadStream instead of res.sendFile so Express never sets ETag /
// Last-Modified, preventing Replit's CDN from caching stale binaries.
import { createReadStream } from "node:fs";
router.get("/dist/api.mjs", (_req, res) => {
  const p = resolve(process.cwd(), "dist/index.mjs");
  if (!existsSync(p)) { res.status(404).end("dist not built"); return; }
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  createReadStream(p).pipe(res);
});
router.get("/dist/frontend.tar.gz", (_req, res) => {
  const p = repoFile("artifacts/solar-scada/dist/frontend.tar.gz");
  if (!existsSync(p)) { res.status(404).end("frontend tarball not found"); return; }
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  createReadStream(p).pipe(res);
});

// Edge Gateway Agent ingest routes — authenticate via bearer gateway token,
// not a browser session cookie, so they must sit outside `authenticate`.
router.use(gatewayAgentRouter);

// HTTP Push device ingest — authenticated via per-device ingest token in URL path.
// Must be outside `authenticate` so devices can POST without a session cookie.
router.use(ingestRouter);

// All routes below this line require a valid session cookie.
router.use(authenticate);

/**
 * Write-scope guard for super admins.
 *
 * A super admin browsing in "all orgs" mode (no orgOverride, no ?orgId=) would
 * get resolveOrgId() → null, meaning writes have no tenant scope — they could
 * silently land on the wrong org. Instead we require them to impersonate a
 * specific org before making any state-changing request outside /superadmin/**.
 *
 * /superadmin/** routes are excluded because they carry their own org context
 * (URL param or explicit body) and are served by a dedicated router.
 */
function requireOrgScopeForWrites(req: Request, res: Response, next: NextFunction): void {
  const isMutation = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method);
  // /superadmin/** carries its own org context; /org/** and /gateway/** always
  // operate on req.user.orgId (the admin gateway endpoints never accept a
  // separate org param — they're always scoped to the caller's own org).
  const isScopedRoute = req.path.startsWith("/superadmin") || req.path.startsWith("/org") || req.path.startsWith("/gateway");
  if (isMutation && !isScopedRoute && req.user?.isSuperAdmin && !resolveOrgId(req)) {
    res.status(400).json({
      error: "org_required",
      message: "Impersonate a specific organisation before making changes",
    });
    return;
  }
  next();
}

router.use(requireOrgScopeForWrites);

router.use(portfolioRouter);
router.use(plantsRouter);
router.use(invertersRouter);
router.use(alertsRouter);
router.use(workOrdersRouter);
router.use(reportsRouter);
router.use(insightsRouter);
router.use(rolesRouter);
router.use(usersRouter);
router.use(streamRouter);
router.use(faultInjectRouter);
router.use(devicesRouter);
router.use(deviceTemplatesRouter);
router.use(orgRouter);
router.use(notificationsRouter);
router.use(ftpSourcesRouter);
router.use(gatewayAdminRouter);

// Super admin portal — requires authenticated + isSuperAdmin
router.use(requireSuperAdmin, superadminRouter);
router.use(requireSuperAdmin, superadminDbRouter);

export default router;
