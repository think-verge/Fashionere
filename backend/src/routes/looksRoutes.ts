import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as looksController from "../controllers/looksController.js";

export const looksRouter = Router();

looksRouter.use(requireAuth);

// Order matters — most specific first
looksRouter.get("/:lookId/garments/:garmentId", asyncHandler(looksController.getGarment));
looksRouter.get("/:lookId/garments", asyncHandler(looksController.getGarments));
looksRouter.get("/:lookId", asyncHandler(looksController.getLook));
looksRouter.get("/", asyncHandler(looksController.listLooks));
