import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as looksController from "../controllers/looksController.js";

export const looksRouter = Router();

looksRouter.use(requireAuth);
looksRouter.get("/", asyncHandler(looksController.list));
looksRouter.get("/assets/:gridfsId", asyncHandler(looksController.getAsset));
looksRouter.get("/:lookId", asyncHandler(looksController.getById));
