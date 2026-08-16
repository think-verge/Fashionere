import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as trendsController from "../controllers/trendsController.js";

export const trendsRouter = Router();

trendsRouter.use(requireAuth);
trendsRouter.get("/", asyncHandler(trendsController.list));
trendsRouter.post("/generate/stream", asyncHandler(trendsController.generateStream));
// on-demand comparison routes — MUST precede "/:brandSlug" (else "compare"/"season"
// would be captured as a brand slug).
trendsRouter.get("/compare/options", asyncHandler(trendsController.compareOptions));
trendsRouter.get("/compare", asyncHandler(trendsController.compare));
trendsRouter.get("/season/options", asyncHandler(trendsController.seasonOptions));
trendsRouter.get("/season", asyncHandler(trendsController.season));
trendsRouter.get("/:brandSlug", asyncHandler(trendsController.getByBrandSlug));
