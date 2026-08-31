import mongoose from "mongoose";
import { ApiError } from "../utils/api-error.js";

const RETAIL_SOURCES = new Set(["zara", "hm", "mango", "uniqlo", "cos", "asos"]);

function sourceType(doc: Record<string, unknown>): "retail" | "runway" {
  const src = (doc.source as Record<string, unknown> | undefined)?.type as string | undefined;
  if (src && RETAIL_SOURCES.has(src.toLowerCase())) return "retail";
  // fallback: check brand field
  const brand = (doc.brand as string | undefined)?.toLowerCase() ?? "";
  return RETAIL_SOURCES.has(brand) ? "retail" : "runway";
}

function thumbnail(doc: Record<string, unknown>): string | undefined {
  const imgs = doc.images as Array<Record<string, unknown>> | undefined;
  return (imgs?.[0]?.url ?? imgs?.[0]?.src) as string | undefined;
}

function buildSummary(doc: Record<string, unknown>, garmentCount: number) {
  const src = (doc.source as Record<string, unknown> | undefined) ?? {};
  return {
    id: String(doc._id),
    brand: (src.brand ?? doc.brand ?? "") as string,
    season: (src.season ?? doc.season ?? "") as string,
    year: ((src.year ?? doc.year ?? 0) as number),
    source_type: sourceType(doc),
    thumbnail: thumbnail(doc),
    garment_count: garmentCount,
    is_deconstructed: garmentCount > 0,
  };
}

function buildGarment(g: Record<string, unknown>, lookId: string) {
  return {
    id: (g.garment_id ?? g.id) as string,
    look_id: lookId,
    piece: g.piece as string,
    garment_type: g.garment_type as string,
    bbox: g.bbox,
    colors: g.colors ?? [],
    fabric: g.fabric ?? {},
    pattern: g.pattern ?? null,
    materials_candidates: g.materials_candidates ?? [],
  };
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64url").toString("utf8");
}

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

const looksCol = () => mongoose.connection.db!.collection("canonical_looks");
const deconCol = () => mongoose.connection.db!.collection("deconstructions");

export async function listLooks(opts: {
  type?: string;
  limit: number;
  cursor?: string;
}) {
  const { type, limit, cursor } = opts;

  const filter: Record<string, unknown> = {};
  if (type === "retail") {
    filter["source.type"] = { $in: [...RETAIL_SOURCES] };
  } else if (type === "runway") {
    filter["source.type"] = { $nin: [...RETAIL_SOURCES] };
  }
  if (cursor) {
    try {
      const id = new mongoose.Types.ObjectId(decodeCursor(cursor));
      filter._id = { $gt: id };
    } catch {}
  }

  const total = await looksCol().countDocuments(type ? { ...filter, _id: undefined } : {});
  const docs = await looksCol().find(filter).sort({ _id: 1 }).limit(limit + 1).toArray();

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  // Fetch decon garment counts for these look IDs
  const lookIds = page.map((d) => String(d._id));
  const deconDocs = await deconCol()
    .find({ look_id: { $in: lookIds } })
    .toArray();
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
    next_cursor: hasMore ? encodeCursor(String(page[page.length - 1]._id)) : undefined,
  };
}

export async function getLook(lookId: string) {
  // Look IDs are strings like "prada:prada-fall-2025-rtw:29" — query directly by string _id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = await looksCol().findOne({ _id: lookId as any }) as Record<string, unknown> | null;
  if (!d) throw new ApiError(404, "Look not found");

  const decon = await deconCol().findOne({ look_id: lookId });
  const garments = ((decon as Record<string, unknown> | null)?.garments as Array<Record<string, unknown>>) ?? [];

  const src = (d.source as Record<string, unknown> | undefined) ?? {};
  return {
    id: lookId,
    brand: (src.brand ?? d.brand ?? "") as string,
    season: (src.season ?? d.season ?? "") as string,
    year: ((src.year ?? d.year ?? 0) as number),
    source_type: sourceType(d),
    images: (d.images ?? []) as unknown[],
    tags: (d.tags ?? []) as unknown[],
    is_deconstructed: garments.length > 0,
    garments: garments.map((g) => buildGarment(g, lookId)),
  };
}

export async function getGarments(lookId: string) {
  const decon = await deconCol().findOne({ look_id: lookId });
  if (!decon) return [];
  const garments = ((decon as Record<string, unknown>).garments as Array<Record<string, unknown>>) ?? [];
  return garments.map((g) => buildGarment(g, lookId));
}

export async function getGarment(lookId: string, garmentId: string) {
  const garments = await getGarments(lookId);
  const g = garments.find((g) => g.id === garmentId);
  if (!g) throw new ApiError(404, "Garment not found");
  return g;
}
