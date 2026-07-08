import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
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
import orgRouter from "./org";
import superadminRouter from "./superadmin";
import { authenticate } from "../middleware/authenticate";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";
import { resolveOrgId } from "../lib/orgScope";

const router: IRouter = Router();

// Always-public routes (no auth required)
router.use(healthRouter);
router.use(authRouter);

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
  // /superadmin/** carries its own org context; /org/** always operates on req.user.orgId
  const isScopedRoute = req.path.startsWith("/superadmin") || req.path.startsWith("/org");
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
router.use(orgRouter);

// Super admin portal — requires authenticated + isSuperAdmin
router.use(requireSuperAdmin, superadminRouter);

export default router;
