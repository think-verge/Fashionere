import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as ctrl from "../controllers/retailTrendsController.js";

export const retailTrendsRouter = Router();

retailTrendsRouter.use(requireAuth);
retailTrendsRouter.get("/garment-types", asyncHandler(ctrl.garmentTypes));
retailTrendsRouter.get("/overview/:garmentType", asyncHandler(ctrl.overview));
retailTrendsRouter.get("/element", asyncHandler(ctrl.element));
retailTrendsRouter.get("/garment/:lookId/:garmentId", asyncHandler(ctrl.garmentTrends));
