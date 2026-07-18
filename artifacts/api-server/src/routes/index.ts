import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import authOtpRouter from "./auth-otp";
import platformAdminAuthRouter from "./platform-admin-auth";
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
import ftpSourcesRouter from "./ftpSources";
import { gatewayAdminRouter, gatewayAgentRouter } from "./gateway";
import { authenticate } from "../middleware/authenticate";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";
import { resolveOrgId } from "../lib/orgScope";

const router: IRouter = Router();

// Always-public routes (no auth required)
router.use(healthRouter);
router.use(authRouter);
router.use(authOtpRouter);
router.use(platformAdminAuthRouter);

// Temporary: serve deploy.sh so the VPS can curl it without GitHub access
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
router.get("/deploy.sh", (_req, res) => {
  // Try workspace root (two levels up from artifacts/api-server)
  const candidates = [
    resolve(process.cwd(), "../../deploy.sh"),
    resolve(process.cwd(), "deploy.sh"),
    "/home/automystics-scada/htdocs/scada.automystics.tech/deploy.sh",
  ];
  const p = candidates.find(existsSync);
  if (!p) { res.status(404).end("deploy.sh not found"); return; }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(readFileSync(p, "utf8"));
});

// Edge Gateway Agent ingest routes — authenticate via bearer gateway token,
// not a browser session cookie, so they must sit outside `authenticate`.
router.use(gatewayAgentRouter);

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

export default router;
