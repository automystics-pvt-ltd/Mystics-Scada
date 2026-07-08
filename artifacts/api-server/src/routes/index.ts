import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import portfolioRouter from "./portfolio";
import plantsRouter from "./plants";
import invertersRouter from "./inverters";
import alertsRouter from "./alerts";
import workOrdersRouter from "./workOrders";
import reportsRouter from "./reports";
import rolesRouter from "./roles";
import usersRouter from "./users";
import streamRouter from "./stream";
import faultInjectRouter from "./faultInject";
import { authenticate } from "../middleware/authenticate";

const router: IRouter = Router();

// Always-public routes (no auth required)
router.use(healthRouter);
router.use(authRouter);

// All routes below this line require a valid session cookie.
router.use(authenticate);

router.use(portfolioRouter);
router.use(plantsRouter);
router.use(invertersRouter);
router.use(alertsRouter);
router.use(workOrdersRouter);
router.use(reportsRouter);
router.use(rolesRouter);
router.use(usersRouter);
router.use(streamRouter);
router.use(faultInjectRouter);

export default router;
