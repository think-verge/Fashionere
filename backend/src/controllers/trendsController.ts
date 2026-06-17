import type { Request, Response } from "express";
import * as trendsService from "../services/trendsService.js";
import { ApiError } from "../utils/api-error.js";

export async function list(req: Request, res: Response) {
  const { category, lifecycle, season, market, type } = req.query as Record<
    string,
    string | undefined
  >;
  const trends = await trendsService.listTrends({ category, lifecycle, season, market, type });
  res.json(trends);
}

export async function getById(req: Request, res: Response) {
  const trend = await trendsService.getTrendById(String(req.params.id));
  if (!trend) throw new ApiError(404, "Trend not found");
  res.json(trend);
}
