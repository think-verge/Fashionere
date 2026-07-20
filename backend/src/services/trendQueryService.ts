import axios from "axios";
import { env } from "../config/env.js";

const trendAgent = axios.create({ baseURL: env.TREND_AGENT_URL, timeout: 120_000 });

export async function streamTrendQuery(query: string) {
  return trendAgent.post<NodeJS.ReadableStream>("/query/stream", { query }, { responseType: "stream" });
}
