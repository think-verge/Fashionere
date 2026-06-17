import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const trendsPath = resolve(__dirname, "../../../agent/data/mock_trends.json");

interface Trend {
  trend_id: string;
  type: string;
  label: string;
  descriptor: string;
  lifecycle_stage: string;
  confidence_score: number;
  context: {
    category: string;
    season?: string;
    market?: string;
    gender?: string;
  };
  attributes: Record<string, unknown>;
  sources: string[];
}

let cachedTrends: Trend[] | null = null;

async function loadTrends(): Promise<Trend[]> {
  if (cachedTrends) return cachedTrends;
  const raw = await readFile(trendsPath, "utf-8");
  cachedTrends = JSON.parse(raw) as Trend[];
  return cachedTrends;
}

export async function listTrends(filters: {
  category?: string;
  lifecycle?: string;
  season?: string;
  market?: string;
  type?: string;
}) {
  const trends = await loadTrends();
  return trends.filter((t) => {
    if (filters.category && t.context.category !== filters.category) return false;
    if (filters.lifecycle && t.lifecycle_stage !== filters.lifecycle) return false;
    if (filters.season && t.context.season !== filters.season) return false;
    if (filters.market && t.context.market !== filters.market) return false;
    if (filters.type && t.type !== filters.type) return false;
    return true;
  });
}

export async function getTrendById(trendId: string) {
  const trends = await loadTrends();
  return trends.find((t) => t.trend_id === trendId) ?? null;
}
