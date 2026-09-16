import type { Request, Response } from "express";
import * as svc from "../services/retailTrendsService.js";
import { ApiError } from "../utils/api-error.js";

export async function overview(req: Request, res: Response) {
  const garmentType = req.params.garmentType;
  if (!garmentType) throw new ApiError(400, "garmentType is required");
  const data = await svc.getCategoryOverview(garmentType);
  res.json(data);
}

export async function element(req: Request, res: Response) {
  const { kind, family, garment_type } = req.query as Record<string, string | undefined>;
  if (!kind || !family || !garment_type) {
    throw new ApiError(400, "kind, family, and garment_type are required");
  }
  if (!["color", "fabric", "pattern"].includes(kind)) {
    throw new ApiError(400, "kind must be color, fabric, or pattern");
  }
  const data = await svc.getElementTrend(kind as "color" | "fabric" | "pattern", family, garment_type);
  if (!data) throw new ApiError(404, "Element trend not found");
  res.json(data);
}

export async function garmentTrends(req: Request, res: Response) {
  const { lookId, garmentId } = req.params;
  const data = await svc.getElementTrendForGarment(lookId, garmentId);
  res.json(data);
}

export async function garmentTypes(_req: Request, res: Response) {
  const types = await svc.getAvailableGarmentTypes();
  res.json({ garment_types: types });
}
