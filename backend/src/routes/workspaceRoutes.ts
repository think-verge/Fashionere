import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as workspaceController from "../controllers/workspaceController.js";

export const workspaceRouter = Router();

workspaceRouter.use(requireAuth);

workspaceRouter.get("/", asyncHandler(workspaceController.listWorkspaces));
workspaceRouter.post("/", asyncHandler(workspaceController.createWorkspace));
workspaceRouter.get("/:id", asyncHandler(workspaceController.getWorkspace));
workspaceRouter.patch("/:id", asyncHandler(workspaceController.renameWorkspace));
workspaceRouter.delete("/:id", asyncHandler(workspaceController.deleteWorkspace));
workspaceRouter.post("/:id/elements", asyncHandler(workspaceController.appendElement));
workspaceRouter.put("/:id/elements", asyncHandler(workspaceController.replaceElements));
workspaceRouter.delete("/:id/elements/:elementId", asyncHandler(workspaceController.removeElement));
workspaceRouter.post("/:id/generate", asyncHandler(workspaceController.generate));
