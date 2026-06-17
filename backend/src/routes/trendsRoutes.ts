import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as trendsController from "../controllers/trendsController.js";

export const trendsRouter = Router();

trendsRouter.use(requireAuth);
trendsRouter.get("/", asyncHandler(trendsController.list));
trendsRouter.get("/:id", asyncHandler(trendsController.getById));
