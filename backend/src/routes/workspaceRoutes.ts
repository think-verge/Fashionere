import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import * as workspaceController from "../controllers/workspaceController.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const wsId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const dir = path.join(__dirname, "../../uploads/workspace-elements", wsId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

export const workspaceRouter = Router();

workspaceRouter.use(requireAuth);

workspaceRouter.get("/", asyncHandler(workspaceController.listWorkspaces));
workspaceRouter.post("/", asyncHandler(workspaceController.createWorkspace));
workspaceRouter.get("/:id", asyncHandler(workspaceController.getWorkspace));
workspaceRouter.patch("/:id", asyncHandler(workspaceController.renameWorkspace));
workspaceRouter.delete("/:id", asyncHandler(workspaceController.deleteWorkspace));
workspaceRouter.post("/:id/elements", asyncHandler(workspaceController.appendElement));
workspaceRouter.put("/:id/elements", asyncHandler(workspaceController.replaceElements));
workspaceRouter.delete("/:id/elements/:elementId", asyncHandler(workspaceController.removeElement));
workspaceRouter.post("/:id/elements/upload", upload.single("file"), asyncHandler(workspaceController.uploadElement));
workspaceRouter.post("/:id/generate", asyncHandler(workspaceController.generate));
workspaceRouter.get("/:id/variants", asyncHandler(workspaceController.getVariants));
workspaceRouter.post("/:id/variants/:variantId/edit", asyncHandler(workspaceController.editVariant));
workspaceRouter.post("/:id/variants/:variantId/inventory", asyncHandler(workspaceController.attachInventory));
