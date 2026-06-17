import { Router } from "express";
import { authRouter } from "./authRoutes.js";
import { userRouter } from "./userRoutes.js";
import { moodboardRouter } from "./moodboardRoutes.js";
import { trendsRouter } from "./trendsRoutes.js";
import { catalogueRouter } from "./catalogueRoutes.js";
import { projectRouter } from "./projectRoutes.js";
import { costRouter } from "./costRoutes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/moodboards", moodboardRouter);
apiRouter.use("/trends", trendsRouter);
apiRouter.use("/catalogue", catalogueRouter);
apiRouter.use("/projects", projectRouter);
apiRouter.use("/cost", costRouter);
