import { getFashionaireDb } from "../config/fashionaireDb.js";

export interface MomentumInfo {
  yoy_delta: number | null;
  kind: string;
  trustworthy: boolean;
  by_year: Record<string, number>;
  like_season: Record<string, number>;
}

export interface EvidenceRef {
  collection_id: string;
  look_number: number;
  hex?: string | null;
  image?: string | null;
}

export interface RankedValue {
  value: string;
  share: number;
  looks: number;
  signature_score?: number | null;
  momentum?: MomentumInfo | null;
  evidence: EvidenceRef[];
}

export interface PaletteSwatch {
  hex: string;
  family: string;
  share: number;
  pantone?: string | null;
}

export interface DimensionAggregate {
  dimension: string;
  total_looks: number;
  by_year: Record<string, number>;
  ranked: RankedValue[];
  palette: PaletteSwatch[];
  omitted_count: number;
}

export interface TrendSheet {
  brand: string;
  brand_slug: string;
  report_type: string;
  window_years: number[];
  collections: number;
  total_looks: number;
  dimensions: Record<string, DimensionAggregate>;
  generated: Record<string, unknown>;
}

export interface TrendSheetSummary {
  brand: string;
  brand_slug: string;
  window_years: number[];
  total_looks: number;
}

async function trendSheetsCollection() {
  const db = await getFashionaireDb();
  return db.collection<TrendSheet & { _id: string }>("trend_sheets");
}

export async function listTrendSheets(): Promise<TrendSheetSummary[]> {
  const coll = await trendSheetsCollection();
  const docs = await coll
    .find({}, { projection: { brand: 1, brand_slug: 1, window_years: 1, total_looks: 1 } })
    .sort({ brand: 1 })
    .toArray();
  return docs.map((d) => ({
    brand: d.brand,
    brand_slug: d.brand_slug,
    window_years: d.window_years,
    total_looks: d.total_looks,
  }));
}

export async function getTrendSheet(brandSlug: string): Promise<TrendSheet | null> {
  const coll = await trendSheetsCollection();
  const doc = await coll.findOne({ _id: brandSlug });
  if (!doc) return null;
  const { _id, ...sheet } = doc;
  return sheet;
}
