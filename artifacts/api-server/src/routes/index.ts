import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import ridersRouter from "./riders";
import stagesRouter from "./stages";
import teamRouter from "./team";
import leaderboardRouter from "./leaderboard";
import pointsRouter from "./points";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(ridersRouter);
router.use(stagesRouter);
router.use(teamRouter);
router.use(leaderboardRouter);
router.use(pointsRouter);
router.use(adminRouter);

export default router;
