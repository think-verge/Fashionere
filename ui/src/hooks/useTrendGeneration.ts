import { useCallback, useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "../lib/api/http";
import type { TrendSheet } from "../lib/api/generated/model";

export interface TrendStageEvent {
  type: "stage" | "progress";
  stage: string;
  [key: string]: unknown;
}

type GenerationStatus = "idle" | "streaming" | "done" | "error";

interface UseTrendGenerationState {
  status: GenerationStatus;
  events: TrendStageEvent[];
  sheet: TrendSheet | null;
  error: string | null;
}

const INITIAL_STATE: UseTrendGenerationState = { status: "idle", events: [], sheet: null, error: null };

export function useTrendGeneration() {
  const [state, setState] = useState<UseTrendGenerationState>(INITIAL_STATE);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const generate = useCallback(async (brandSlug: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({ status: "streaming", events: [], sheet: null, error: null });

    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/trends/generate/stream`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_slug: brandSlug }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed with status ${res.status}`);
      }

      const reader = res.body.getReader();
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
          const evt = JSON.parse(line) as { type: string; [key: string]: unknown };
          if (evt.type === "stage" || evt.type === "progress") {
            setState((prev) => ({ ...prev, events: [...prev.events, evt as TrendStageEvent] }));
          } else if (evt.type === "done") {
            setState((prev) => ({ ...prev, status: "done", sheet: evt.sheet as TrendSheet }));
          } else if (evt.type === "error") {
            setState((prev) => ({ ...prev, status: "error", error: (evt.detail as string) ?? "Generation failed" }));
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Generation failed",
      }));
      return;
    }

    setState((prev) => (prev.status === "streaming" ? { ...prev, status: "done" } : prev));
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { ...state, generate, reset };
}
