import axios from "axios";
import type { IncomingMessage } from "http";
import { env } from "../config/env.js";

const trendEngine = axios.create({ baseURL: env.TREND_ENGINE_URL, timeout: 0 });
// timeout: 0 — a first-time brand generation can run several minutes (LLM
// tagging + narration); the axios default timeout would abort it mid-stream.

export async function generateTrendReportStream(brandSlug: string) {
  return trendEngine.post<IncomingMessage>(
    "/api/generate/stream",
    { brand_slug: brandSlug },
    { responseType: "stream" },
  );
}

// --- on-demand comparison (simple JSON GETs; fast, no LLM) ---
const trendEngineJson = axios.create({ baseURL: env.TREND_ENGINE_URL, timeout: 20000 });

export async function fetchCompareOptions() {
  return (await trendEngineJson.get("/api/compare/options")).data;
}

export async function fetchCompare(a: string, b: string) {
  return (await trendEngineJson.get("/api/compare", { params: { a, b } })).data;
}

export async function fetchSeasonOptions() {
  return (await trendEngineJson.get("/api/season/options")).data;
}

export async function fetchSeason(year: number, season: string, category: string) {
  return (await trendEngineJson.get("/api/season", { params: { year, season, category } })).data;
}
