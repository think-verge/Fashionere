import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as moodboardController from "../controllers/moodboardController.js";

export const moodboardRouter = Router();

moodboardRouter.use(requireAuth);
moodboardRouter.get("/", asyncHandler(moodboardController.list));
moodboardRouter.post("/from-query", asyncHandler(moodboardController.createFromQuery));
moodboardRouter.post("/from-catalogue", asyncHandler(moodboardController.createFromCatalogue));
moodboardRouter.post("/from-image", asyncHandler(moodboardController.createFromImage));
moodboardRouter.get("/:id", asyncHandler(moodboardController.getById));
moodboardRouter.patch("/:id", asyncHandler(moodboardController.updateName));
moodboardRouter.delete("/:id", asyncHandler(moodboardController.deleteById));
