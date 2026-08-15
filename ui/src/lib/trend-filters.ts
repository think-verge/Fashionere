import type { TrendSheetSummary } from "./api/generated/model";

export interface TrendFilters {
  brands: string[];
  dims: string[];
  years: string[];
}

const EMPTY: TrendFilters = { brands: [], dims: [], years: [] };

function splitParam(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

export function parseTrendFilters(params: URLSearchParams): TrendFilters {
  return {
    brands: splitParam(params.get("brands")),
    dims: splitParam(params.get("dims")),
    years: splitParam(params.get("years")),
  };
}

export function serializeTrendFilters(filters: TrendFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.brands.length) params.set("brands", filters.brands.join(","));
  if (filters.dims.length) params.set("dims", filters.dims.join(","));
  if (filters.years.length) params.set("years", filters.years.join(","));
  return params;
}

export function applyTrendFilters(
  summaries: TrendSheetSummary[],
  filters: TrendFilters,
): TrendSheetSummary[] {
  return summaries.filter((s) => {
    if (filters.brands.length && !filters.brands.includes(s.brand_slug)) return false;
    if (filters.years.length && !s.window_years.some((y) => filters.years.includes(String(y)))) {
      return false;
    }
    return true;
  });
}

export const EMPTY_TREND_FILTERS = EMPTY;
