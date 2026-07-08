import { Router, type IRouter } from "express";
import healthRouter from "./health";
import portfolioRouter from "./portfolio";
import plantsRouter from "./plants";
import invertersRouter from "./inverters";
import alertsRouter from "./alerts";
import workOrdersRouter from "./workOrders";
import reportsRouter from "./reports";
import usersRouter from "./users";
import streamRouter from "./stream";

const router: IRouter = Router();

router.use(healthRouter);
router.use(portfolioRouter);
router.use(plantsRouter);
router.use(invertersRouter);
router.use(alertsRouter);
router.use(workOrdersRouter);
router.use(reportsRouter);
router.use(usersRouter);
router.use(streamRouter);

export default router;
