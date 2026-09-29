import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as conceptController from "../controllers/conceptController.js";

export const conceptRouter = Router();

conceptRouter.use(requireAuth);

conceptRouter.post("/generate", asyncHandler(conceptController.generate));
conceptRouter.get("/generate/:jobId", asyncHandler(conceptController.getJob));
conceptRouter.get("/generate/:jobId/stream", asyncHandler(conceptController.streamJob));
conceptRouter.post("/generate/:jobId/override", asyncHandler(conceptController.overrideCombos));
conceptRouter.get("/", asyncHandler(conceptController.listConcepts));
conceptRouter.get("/:conceptId", asyncHandler(conceptController.getConcept));
conceptRouter.patch("/:conceptId", asyncHandler(conceptController.updateConcept));
conceptRouter.get("/:conceptId/image", asyncHandler(conceptController.getConceptImage));
conceptRouter.post("/:conceptId/refine", asyncHandler(conceptController.refine));
conceptRouter.get("/:conceptId/variants", asyncHandler(conceptController.getVariants));
