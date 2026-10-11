import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as shootController from "../controllers/modelShootController.js";

// Stage 3 model shoots. A shoot is started per garment from /concepts/:conceptId/model-shoot.
export const modelShootRouter = Router();

modelShootRouter.use(requireAuth);

modelShootRouter.get("/", asyncHandler(shootController.listShoots));
modelShootRouter.get("/:shootId", asyncHandler(shootController.getShoot));
modelShootRouter.post("/:shootId/main", asyncHandler(shootController.regenerateMain));
modelShootRouter.post("/:shootId/main/:imageId/select", asyncHandler(shootController.selectMain));
modelShootRouter.post("/:shootId/shots", asyncHandler(shootController.generateShots));
modelShootRouter.delete("/:shootId/shots/:imageId", asyncHandler(shootController.deleteShot));
modelShootRouter.post("/:shootId/editorial", asyncHandler(shootController.writeEditorial));
modelShootRouter.get("/:shootId/images/:imageId", asyncHandler(shootController.getImage));
