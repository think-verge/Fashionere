import { Router } from "express";
import * as inviteController from "../controllers/tenantInviteController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";

export const inviteRouter = Router();

inviteRouter.get("/:token/preview", asyncHandler(inviteController.previewInvite));
inviteRouter.post("/:token/accept", requireAuth, asyncHandler(inviteController.acceptInvite));
