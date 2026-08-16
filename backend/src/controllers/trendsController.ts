import axios from "axios";
import type { Request, Response } from "express";
import * as trendsService from "../services/trendsService.js";
import * as trendEngineService from "../services/trendEngineService.js";
import { ApiError } from "../utils/api-error.js";

// Map a trend-engine failure to an ApiError: forward 404/400 (with the engine's
// detail), otherwise treat it as the engine being unavailable.
function mapEngineError(e: unknown): never {
  if (axios.isAxiosError(e) && e.response) {
    const status = e.response.status;
    const detail = (e.response.data as { detail?: unknown } | undefined)?.detail;
    const msg = typeof detail === "string" ? detail : undefined;
    if (status === 404) throw new ApiError(404, msg ?? "Not found");
    if (status === 400 || status === 422) throw new ApiError(400, msg ?? "Invalid parameters");
  }
  throw new ApiError(503, "Trend engine unavailable");
}

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

// --- on-demand comparisons (proxy the trend engine; computed live there) ---
export async function compareOptions(_req: Request, res: Response) {
  try {
    res.json(await trendEngineService.fetchCompareOptions());
  } catch (e) {
    mapEngineError(e);
  }
}

export async function compare(req: Request, res: Response) {
  const a = String(req.query.a ?? "").trim();
  const b = String(req.query.b ?? "").trim();
  if (!a || !b) throw new ApiError(400, "query params 'a' and 'b' (brand slugs) are required");
  try {
    res.json(await trendEngineService.fetchCompare(a, b));
  } catch (e) {
    mapEngineError(e);
  }
}

export async function seasonOptions(_req: Request, res: Response) {
  try {
    res.json(await trendEngineService.fetchSeasonOptions());
  } catch (e) {
    mapEngineError(e);
  }
}

export async function season(req: Request, res: Response) {
  const year = Number(req.query.year);
  const seasonName = String(req.query.season ?? "").trim();
  const category = String(req.query.category ?? "rtw").trim();
  if (!Number.isFinite(year) || !seasonName) {
    throw new ApiError(400, "query params 'year' (number) and 'season' are required");
  }
  try {
    res.json(await trendEngineService.fetchSeason(year, seasonName, category));
  } catch (e) {
    mapEngineError(e);
  }
}
