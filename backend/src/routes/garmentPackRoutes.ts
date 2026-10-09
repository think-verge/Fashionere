import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as packController from "../controllers/garmentPackController.js";

export const garmentPackRouter = Router();

garmentPackRouter.use(requireAuth);

// Section 03 (workspace-level). Registered before "/:packId/..." so the literal paths win.
garmentPackRouter.get("/", asyncHandler(packController.listGarmentConcepts));
garmentPackRouter.post("/move", asyncHandler(packController.moveToGarmentConcepts));
garmentPackRouter.get("/workspace/:workspaceId/stream", asyncHandler(packController.streamWorkspace));

garmentPackRouter.get("/:packId/stream", asyncHandler(packController.streamPack));
garmentPackRouter.post("/:packId/shots/:shotId/regenerate", asyncHandler(packController.regenerateShot));
garmentPackRouter.post("/:packId/shots/:shotId/select", asyncHandler(packController.selectShot));
garmentPackRouter.get("/:packId/shots/:shotId/image", asyncHandler(packController.getShotImage));
