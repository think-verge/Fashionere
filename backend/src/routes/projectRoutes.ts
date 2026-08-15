import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as projectController from "../controllers/projectController.js";

export const projectRouter = Router();

projectRouter.use(requireAuth);
projectRouter.get("/", asyncHandler(projectController.list));
projectRouter.post("/", asyncHandler(projectController.create));
projectRouter.get("/:id", asyncHandler(projectController.getById));
projectRouter.patch("/:id", asyncHandler(projectController.update));
projectRouter.delete("/:id", asyncHandler(projectController.remove));
