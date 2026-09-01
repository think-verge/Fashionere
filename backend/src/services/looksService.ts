import mongoose from "mongoose";
import { ApiError } from "../utils/api-error.js";

const RETAIL_SOURCES = new Set(["zara", "hm", "mango", "uniqlo", "cos", "asos"]);

function sourceType(doc: Record<string, unknown>): "retail" | "runway" {
  const srcType = (doc.source as Record<string, unknown> | undefined)?.type as string | undefined;
  if (srcType && RETAIL_SOURCES.has(srcType.toLowerCase())) return "retail";
  const brand = (
    (doc.context as Record<string, unknown> | undefined)?.brand_slug
    ?? (doc.context as Record<string, unknown> | undefined)?.brand
    ?? doc.brand
    ?? ""
  ) as string;
  return RETAIL_SOURCES.has(brand.toLowerCase()) ? "retail" : "runway";
}

function primaryImage(doc: Record<string, unknown>): string | undefined {
  const imgs = doc.images as Array<Record<string, unknown>> | undefined;
  if (!imgs?.length) return undefined;
  // prefer role=runway image, fall back to first
  const runway = imgs.find((i) => i.role === "runway");
  return ((runway ?? imgs[0])?.url ?? (runway ?? imgs[0])?.src) as string | undefined;
}

function allImageUrls(doc: Record<string, unknown>): string[] {
  const imgs = doc.images as Array<Record<string, unknown>> | undefined;
  if (!imgs?.length) return [];
  return imgs.map((i) => (i.url ?? i.src) as string).filter(Boolean);
}

function buildSummary(doc: Record<string, unknown>, garmentCount: number) {
  const ctx = (doc.context as Record<string, unknown> | undefined) ?? {};
  const nativeText = (doc.native_text as Record<string, unknown> | undefined) ?? {};
  return {
    id: String(doc._id),
    brand: (ctx.brand ?? doc.brand ?? "") as string,
    name: (nativeText.product_name ?? doc.name ?? "") as string,
    season: (ctx.season ?? doc.season ?? "") as string,
    year: ((ctx.year ?? doc.year ?? 0) as number),
    source_type: sourceType(doc),
    thumbnail: primaryImage(doc),
    garment_count: garmentCount,
    is_deconstructed: garmentCount > 0,
  };
}

const ASSET_BASE = process.env.ASSET_BASE_URL ?? "http://localhost:8001/api/v1/assets";

function assetUrl(gridfsId: unknown): string | null {
  return gridfsId ? `${ASSET_BASE}/${String(gridfsId)}` : null;
}

function buildGarment(g: Record<string, unknown>, lookId: string) {
  const rawFabrics = (g.fabrics ?? []) as Array<Record<string, unknown>>;
  const rawPatterns = (g.patterns ?? []) as Array<Record<string, unknown>>;
  const rawComposition = (g.composition ?? []) as Array<Record<string, unknown>>;
  const flat = g.flat as Record<string, unknown> | undefined;

  return {
    garment_id: (g.garment_id ?? g.id) as string,
    look_id: lookId,
    piece: g.piece as string,
    garment_type: g.garment_type as string,
    colors: (g.colors ?? []) as Array<{ hex: string; name?: string; role?: string; pantone?: string }>,
    fabrics: rawFabrics.map((f) => ({
      name:        (f.name ?? f.material ?? "") as string,
      material:    (f.material ?? f.name ?? "") as string,
      weight:      (f.weight ?? null) as string | null,
      finish:      (f.finish ?? null) as string | null,
      description: (f.description ?? null) as string | null,
      image_url:   assetUrl(f.gridfs_id),
    })),
    patterns: rawPatterns.map((p) => ({
      name:        (p.name ?? "") as string,
      motif:       (p.motif ?? null) as string | null,
      type:        (p.type ?? null) as string | null,
      scale:       (p.scale ?? null) as string | null,
      colors:      (p.colors ?? []) as string[],
      description: (p.description ?? null) as string | null,
      image_url:   assetUrl(p.gridfs_id),
    })),
    flat_url:    assetUrl(flat?.gridfs_id),
    composition: rawComposition.map((c) => ({
      fiber: (c.fiber ?? "") as string,
      pct:   (c.pct ?? null) as number | null,
    })),
  };
}

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64url").toString("utf8");
}

const looksCol = () => mongoose.connection.db!.collection("canonical_looks");
const deconCol = () => mongoose.connection.db!.collection("deconstructions");

export async function listLooksFilters(opts: { type?: string }) {
  const { type } = opts;

  const typeFilter: Record<string, unknown> = {};
  if (type === "retail") {
    typeFilter["source.type"] = { $in: [...RETAIL_SOURCES] };
  } else if (type === "runway") {
    typeFilter["source.type"] = { $nin: [...RETAIL_SOURCES] };
  }

  const [brandRaw, garmentTypeRaw] = await Promise.all([
    looksCol().distinct("context.brand", typeFilter),
    deconCol().distinct("garments.garment_type", {}),
  ]);

  const brands = (brandRaw as string[])
    .filter((b) => typeof b === "string" && b.length > 0)
    .sort();
  const garmentTypes = (garmentTypeRaw as string[])
    .filter((g) => typeof g === "string" && g.length > 0)
    .map((g) => g.charAt(0).toUpperCase() + g.slice(1).toLowerCase())
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();

  return { brands, garment_types: garmentTypes };
}

export async function listLooks(opts: {
  type?: string;
  limit: number;
  cursor?: string;
  brand?: string;
  garment_type?: string;
}) {
  const { type, limit, cursor, brand, garment_type } = opts;

  // Base type filter (used for total count too)
  const typeFilter: Record<string, unknown> = {};
  if (type === "retail") {
    typeFilter["source.type"] = { $in: [...RETAIL_SOURCES] };
  } else if (type === "runway") {
    typeFilter["source.type"] = { $nin: [...RETAIL_SOURCES] };
  }
  if (brand) typeFilter["context.brand"] = brand;

  // If garment_type filter is set, find look_ids from deconstructions first
  let garmentTypeIds: string[] | undefined;
  if (garment_type) {
    const normalised = garment_type.toLowerCase();
    const matching = await deconCol()
      .find({ "garments.garment_type": { $regex: new RegExp(`^${normalised}$`, "i") } })
      .project({ look_id: 1 })
      .toArray();
    garmentTypeIds = matching.map((d) => String(d.look_id));
    typeFilter._id = { $in: garmentTypeIds };
  }

  // Page filter adds cursor for pagination
  const pageFilter: Record<string, unknown> = { ...typeFilter };
  if (cursor) {
    const decodedId = decodeCursor(cursor);
    // _id is a string in canonical_looks — use string $gt for cursor pagination
    if (garmentTypeIds) {
      pageFilter._id = { $in: garmentTypeIds, $gt: decodedId };
    } else {
      pageFilter._id = { $gt: decodedId };
    }
  }

  const [total, docs] = await Promise.all([
    looksCol().countDocuments(typeFilter),
    looksCol().find(pageFilter).sort({ _id: 1 }).limit(limit + 1).toArray(),
  ]);

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  // Fetch decon garment counts for this page
  const lookIds = page.map((d) => String(d._id));
  const deconDocs = await deconCol().find({ look_id: { $in: lookIds } }).toArray();
  const garmentCountMap = new Map<string, number>();
  for (const d of deconDocs) {
    const lid = String(d.look_id);
    const garments = (d.garments as unknown[] | undefined) ?? [];
    garmentCountMap.set(lid, garments.length);
  }

  const looks = page.map((d) =>
    buildSummary(d as Record<string, unknown>, garmentCountMap.get(String(d._id)) ?? 0)
  );

  return {
    looks,
    total,
    next_cursor: hasMore ? encodeCursor(String(page[page.length - 1]._id)) : null,
  };
}

export async function getLook(lookId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = await looksCol().findOne({ _id: lookId as any }) as Record<string, unknown> | null;
  if (!d) throw new ApiError(404, "Look not found");

  const decon = await deconCol().findOne({ look_id: lookId });
  const garments = ((decon as Record<string, unknown> | null)?.garments as Array<Record<string, unknown>>) ?? [];
  const ctx = (d.context as Record<string, unknown> | undefined) ?? {};

  const nativeText = (d.native_text as Record<string, unknown> | undefined) ?? {};

  // tags can be a string[] (runway keywords) or an object (retail structured analysis)
  const rawTags = d.tags as Record<string, unknown> | string[] | undefined;
  const isStructuredAnalysis = rawTags && !Array.isArray(rawTags) && typeof rawTags === "object";
  const keywords = isStructuredAnalysis
    ? (nativeText.keywords as string[] ?? [])
    : (rawTags as string[] | undefined) ?? (nativeText.keywords as string[] ?? []);
  const categoryPath = (ctx.category_path as string[] | undefined);

  return {
    id: lookId,
    brand: (ctx.brand ?? d.brand ?? "") as string,
    season: (ctx.season ?? d.season ?? "") as string,
    year: ((ctx.year ?? d.year ?? 0) as number),
    category: (categoryPath?.[categoryPath.length - 1] ?? ctx.category ?? "") as string,
    name: (nativeText.product_name ?? d.name ?? "") as string,
    source_type: sourceType(d),
    images: allImageUrls(d),
    tags: keywords,
    analysis: isStructuredAnalysis ? (rawTags as Record<string, unknown>) : null,
    is_deconstructed: garments.length > 0,
  };
}

export async function getGarments(lookId: string) {
  const decon = await deconCol().findOne({ look_id: lookId });
  if (!decon) return [];
  const garments = ((decon as Record<string, unknown>).garments as Array<Record<string, unknown>>) ?? [];
  return garments.map((g) => buildGarment(g, lookId));
}

export async function getGarment(lookId: string, garmentId: string) {
  const decon = await deconCol().findOne({ look_id: lookId });
  if (!decon) throw new ApiError(404, "Garment not found");
  const garments = ((decon as Record<string, unknown>).garments as Array<Record<string, unknown>>) ?? [];
  const raw = garments.find((g) => (g.garment_id ?? g.id) === garmentId);
  if (!raw) throw new ApiError(404, "Garment not found");
  return buildGarment(raw, lookId);
}
