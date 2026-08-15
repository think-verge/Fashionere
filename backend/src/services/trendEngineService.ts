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
