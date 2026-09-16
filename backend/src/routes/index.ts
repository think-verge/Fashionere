import { Router } from "express";
import { authRouter } from "./authRoutes.js";
import { userRouter } from "./userRoutes.js";
import { moodboardRouter } from "./moodboardRoutes.js";
import { trendsRouter } from "./trendsRoutes.js";
import { catalogueRouter } from "./catalogueRoutes.js";
import { projectRouter } from "./projectRoutes.js";
import { costRouter } from "./costRoutes.js";
import { looksRouter } from "./looksRoutes.js";
import { workspaceRouter } from "./workspaceRoutes.js";
import { inventoryRouter } from "./inventoryRoutes.js";
import { retailTrendsRouter } from "./retailTrendsRoutes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/moodboards", moodboardRouter);
apiRouter.use("/trends", trendsRouter);
apiRouter.use("/catalogue", catalogueRouter);
apiRouter.use("/projects", projectRouter);
apiRouter.use("/cost", costRouter);
apiRouter.use("/looks", looksRouter);
apiRouter.use("/workspace", workspaceRouter);
apiRouter.use("/inventory", inventoryRouter);
apiRouter.use("/retail-trends", retailTrendsRouter);
