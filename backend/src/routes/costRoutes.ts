import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as costController from "../controllers/costController.js";

export const costRouter = Router();

costRouter.use(requireAuth);
costRouter.post("/estimate", asyncHandler(costController.estimate));
