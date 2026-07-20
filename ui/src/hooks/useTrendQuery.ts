import { useCallback, useState } from "react";
import { apiBaseUrl } from "../lib/api/http";

export interface TrendRecord {
  trend_id: string;
  label: string;
  type: string;
  confidence_score: number;
  lifecycle_stage: string;
  demand_direction: string;
  descriptor: string;
  context: {
    category: string | null;
    season: string | null;
    gender: string | null;
    market: string | null;
  };
  sources: string[];
}

interface MetaEvent {
  query: string;
  trends: TrendRecord[];
  total_matched: number;
  broadened: boolean;
  trend_count: number;
}

interface TrendQueryState {
  answer: string;
  trends: TrendRecord[];
  meta: MetaEvent | null;
  isStreaming: boolean;
  error: string | null;
}

export function useTrendQuery() {
  const [state, setState] = useState<TrendQueryState>({
    answer: "",
    trends: [],
    meta: null,
    isStreaming: false,
    error: null,
  });

  const submit = useCallback(async (query: string) => {
    setState({ answer: "", trends: [], meta: null, isStreaming: true, error: null });

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/trends/query/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || `Request failed with status ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as { type: string; [key: string]: unknown };
            if (event.type === "meta") {
              const meta = event as unknown as MetaEvent & { type: string };
              setState((prev) => ({ ...prev, meta, trends: meta.trends ?? [] }));
            } else if (event.type === "delta") {
              setState((prev) => ({ ...prev, answer: prev.answer + (event.text as string ?? "") }));
            } else if (event.type === "error") {
              setState((prev) => ({ ...prev, error: (event.detail as string) ?? "An error occurred" }));
            }
          } catch {
            // malformed NDJSON line — skip
          }
        }
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to connect to trend service",
      }));
    } finally {
      setState((prev) => ({ ...prev, isStreaming: false }));
    }
  }, []);

  return { ...state, submit };
}
