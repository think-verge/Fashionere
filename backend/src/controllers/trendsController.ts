import type { Request, Response } from "express";
import * as trendsService from "../services/trendsService.js";
import * as trendEngineService from "../services/trendEngineService.js";
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

export async function generateStream(req: Request, res: Response) {
  const { brand_slug } = req.body as { brand_slug?: unknown };
  if (typeof brand_slug !== "string" || !brand_slug.trim()) {
    throw new ApiError(400, "brand_slug is required");
  }

  let upstream;
  try {
    upstream = await trendEngineService.generateTrendReportStream(brand_slug.trim());
  } catch {
    throw new ApiError(503, "Trend engine unavailable");
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");

  upstream.data.on("error", () => res.end());
  req.on("close", () => upstream.data.destroy());
  upstream.data.pipe(res);
}
