import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as userController from "../controllers/userController.js";

export const userRouter = Router();

userRouter.use(requireAuth);
userRouter.patch("/me", asyncHandler(userController.updateProfile));
