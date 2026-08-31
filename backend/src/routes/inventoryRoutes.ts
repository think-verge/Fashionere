import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as inventoryController from "../controllers/inventoryController.js";

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);
inventoryRouter.get("/garments", asyncHandler(inventoryController.getGarmentInventory));
