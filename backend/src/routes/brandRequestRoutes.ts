import { Router } from "express";
import * as brandRequestController from "../controllers/brandRequestController.js";
import { requireAuth, requireTenant } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";

export const brandRequestRouter = Router();

// Protect all brand request routes with authentication and tenant context
brandRequestRouter.use(requireAuth, requireTenant);

brandRequestRouter.post("/", asyncHandler(brandRequestController.createBrandRequest));
brandRequestRouter.get("/my", asyncHandler(brandRequestController.listMyBrandRequests));
