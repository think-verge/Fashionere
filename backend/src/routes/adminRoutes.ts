import { Router } from "express";
import * as inviteController from "../controllers/tenantInviteController.js";
import * as brandRequestController from "../controllers/brandRequestController.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";

export const adminRouter = Router();

// Protect all admin routes with authentication and admin role requirement
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/tenants", asyncHandler(inviteController.getAdminTenants));
adminRouter.get("/invites", asyncHandler(inviteController.listAdminInvites));
adminRouter.post("/invites", asyncHandler(inviteController.createAdminInvite));
adminRouter.delete("/invites/:id", asyncHandler(inviteController.revokeAdminInvite));

adminRouter.get("/brand-requests", asyncHandler(brandRequestController.listAdminBrandRequests));
adminRouter.patch("/brand-requests/:id", asyncHandler(brandRequestController.updateBrandRequestStatus));
