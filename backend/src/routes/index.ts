import { Router } from "express";
import { authRouter } from "./authRoutes.js";
import { userRouter } from "./userRoutes.js";
import { trendsRouter } from "./trendsRoutes.js";
import { looksRouter } from "./looksRoutes.js";
import { projectRouter } from "./projectRoutes.js";
import { costRouter } from "./costRoutes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/trends", trendsRouter);
apiRouter.use("/looks", looksRouter);
apiRouter.use("/projects", projectRouter);
apiRouter.use("/cost", costRouter);
