import { Router } from "express";
import * as shopifyController from "../controllers/shopifyController.js";
import { requireAuth, requireTenant } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";

export const shopifyRouter = Router();

// Public endpoints hit directly by Shopify
shopifyRouter.get("/callback", asyncHandler(shopifyController.handleCallback));
shopifyRouter.post("/webhooks", asyncHandler(shopifyController.handleWebhook));

// Tenant-authenticated routes
shopifyRouter.get("/auth", requireAuth, requireTenant, asyncHandler(shopifyController.initiateAuth));
shopifyRouter.get("/status", requireAuth, requireTenant, asyncHandler(shopifyController.getStatus));
shopifyRouter.post("/sync", requireAuth, requireTenant, asyncHandler(shopifyController.syncCatalog));
shopifyRouter.post("/disconnect", requireAuth, requireTenant, asyncHandler(shopifyController.disconnect));

