import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignsRouter from "./campaigns";
import shoppingCentersRouter from "./shopping-centers";
import gridRouter from "./grid";
import statisticsRouter from "./statistics";
import importRouter from "./import";
import eventsRouter from "./events";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eventsRouter);
router.use(campaignsRouter);
router.use(shoppingCentersRouter);
router.use(gridRouter);
router.use(statisticsRouter);
router.use(importRouter);

export default router;
