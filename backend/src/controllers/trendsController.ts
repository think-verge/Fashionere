import type { Request, Response } from "express";
import * as trendsService from "../services/trendsService.js";
import { ApiError } from "../utils/api-error.js";

export async function list(_req: Request, res: Response) {
  const sheets = await trendsService.listTrendSheets();
  res.json(sheets);
}

export async function getByBrandSlug(req: Request, res: Response) {
  const sheet = await trendsService.getTrendSheet(String(req.params.brandSlug));
  if (!sheet) throw new ApiError(404, "Trend sheet not found for this brand");
  res.json(sheet);
}
