import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as catalogueController from "../controllers/catalogueController.js";

export const catalogueRouter = Router();

catalogueRouter.use(requireAuth);
catalogueRouter.get("/", asyncHandler(catalogueController.list));
