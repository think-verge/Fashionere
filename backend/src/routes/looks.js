import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const RETAIL_SOURCES = new Set(["zara", "hm", "mango", "uniqlo", "cos", "asos"]);

function sourceType(doc) {
  const t = ((doc?.source?.type) || "").toLowerCase();
  return RETAIL_SOURCES.has(t) ? "retail" : "runway";
}

function thumbnail(doc) {
  const imgs = doc.images || [];
  for (const img of imgs) {
    if (img.role === "product_front" || (img.image_id || "").endsWith("_img0")) return img.url;
  }
  return imgs[0]?.url || null;
}

function dominantColor(tags) {
  const colors = (tags || {}).colors || [];
  return colors.find((c) => c.role === "dominant") || colors[0] || null;
}

function buildSummary(doc, isDeconstructed) {
  const tags = doc.tags || {};
  const ctx = doc.context || {};
  return {
    look_id: doc.look_id || String(doc._id),
    brand: ctx.brand || doc.brand || "",
    brand_slug: ctx.brand_slug || doc.brand_slug || "",
    source_type: sourceType(doc),
    is_deconstructed: !!isDeconstructed,
    thumbnail_url: thumbnail(doc),
    dominant_color: dominantColor(tags),
    season: ctx.season || null,
    year: ctx.year || null,
    garment_count: (doc.extraction?.garments || []).length || null,
  };
}

function buildCard(doc, decon) {
  const tags = doc.tags || {};
  const ctx = doc.context || {};
  return {
    look_id: doc.look_id || String(doc._id),
    brand: ctx.brand || "",
    brand_slug: ctx.brand_slug || "",
    source_type: sourceType(doc),
    is_deconstructed: !!decon,
    colors: (tags.colors || []).map((c) => ({
      name: c.name, hex: c.hex, pantone: c.pantone, family: c.family, role: c.role,
    })),
    fabrics: (tags.fabrics || []).map((f) => ({ value: f.value, material: f.material })),
    patterns: (tags.patterns || []).map((p) => ({ value: p.value, motif: p.motif })),
    silhouettes: (tags.silhouettes || []).map((s) => ({ value: s.value })),
    images: (doc.images || []).map((img) => ({
      image_id: img.image_id, role: img.role, url: img.url, description: img.description,
    })),
    garments: decon
      ? (decon.garments || []).map((g) => ({
          garment_id: g.garment_id, piece: g.piece, garment_type: g.garment_type,
          bbox: g.bbox, colors: g.colors || [], materials_candidates: g.materials_candidates || [],
          fabric: g.fabric || null, pattern: g.pattern || null,
        }))
      : [],
    season: ctx.season || null,
    year: ctx.year || null,
    source_url: (doc.source || {}).source_url || null,
    description: (doc.native_text || {}).description || null,
  };
}

function cursorEncode(id) {
  return Buffer.from(String(id)).toString("base64url");
}
function cursorDecode(cursor) {
  try { return Buffer.from(cursor, "base64url").toString("utf8"); } catch { return null; }
}

function extractTrend(trendDoc, garmentType) {
  const ranked = ((trendDoc?.dimensions?.garment_types) || (trendDoc?.dimensions?.garments) || {}).ranked || [];
  const match = ranked.find((r) => r.value === garmentType);
  return match ? { value: match.value, share: match.share, looks: match.looks, momentum: match.momentum || null } : null;
}

// GET /looks
router.get("/", async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const col = db.collection("canonical_looks");
    const deconCol = db.collection("deconstructions");

    const { type, brand, source, garment, color, fabric, season, year, cursor, limit = 24 } = req.query;

    const q = { tags: { $exists: true } };
    if (type === "runway") q["source.type"] = { $nin: [...RETAIL_SOURCES] };
    else if (type === "retail") q["source.type"] = { $in: [...RETAIL_SOURCES] };
    if (source) q["source.type"] = { $in: source.split(",").map((s) => s.trim()).filter(Boolean) };
    if (brand) q["context.brand_slug"] = brand;
    if (garment) q["extraction.garments.garment_type"] = garment;
    if (color) q["tags.colors.family"] = color;
    if (fabric) q["tags.fabrics.value"] = fabric;
    if (season) q["context.season"] = season;
    if (year) q["context.year"] = parseInt(year, 10);

    if (cursor) {
      const decoded = cursorDecode(cursor);
      if (decoded) {
        try { q._id = { $gt: new mongoose.Types.ObjectId(decoded) }; } catch {}
      }
    }

    const lim = Math.min(parseInt(limit, 10) || 24, 100);
    const total = await col.countDocuments(q);
    const docs = await col.find(q).sort({ _id: 1 }).limit(lim + 1).toArray();
    const hasMore = docs.length > lim;
    const page = docs.slice(0, lim);

    const lookIds = page.map((d) => d.look_id || String(d._id));
    const deconDocs = await deconCol
      .find({ look_id: { $in: lookIds }, status: "complete" }, { projection: { look_id: 1 } })
      .toArray();
    const deconSet = new Set(deconDocs.map((d) => d.look_id));

    res.json({
      items: page.map((d) => buildSummary(d, deconSet.has(d.look_id || String(d._id)))),
      total,
      next_cursor: hasMore && page.length ? cursorEncode(String(page[page.length - 1]._id)) : null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /looks/:lookId/garments/:garmentId  — must be before /:lookId/garments
router.get("/:lookId/garments/:garmentId", async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const decon = await db.collection("deconstructions").findOne({
      look_id: req.params.lookId, status: "complete",
    });
    if (!decon) return res.status(404).json({ error: "Deconstruction not found" });

    const garment = (decon.garments || []).find((g) => g.garment_id === req.params.garmentId);
    if (!garment) return res.status(404).json({ error: "Garment not found" });

    const trendDoc = await db.collection("trend_sheets").findOne({ brand_slug: decon.brand });
    res.json({ ...garment, trend: trendDoc ? extractTrend(trendDoc, garment.garment_type) : null });
  } catch (err) {
    next(err);
  }
});

// GET /looks/:lookId/garments
router.get("/:lookId/garments", async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const decon = await db.collection("deconstructions").findOne({
      look_id: req.params.lookId, status: "complete",
    });
    if (!decon) return res.status(404).json({ error: "Deconstruction not found or not complete" });
    res.json(decon.garments || []);
  } catch (err) {
    next(err);
  }
});

// GET /looks/:lookId  — least specific, must be last
router.get("/:lookId", async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const doc = await db.collection("canonical_looks").findOne({ look_id: req.params.lookId });
    if (!doc) return res.status(404).json({ error: "Look not found" });

    const decon = await db.collection("deconstructions").findOne({
      look_id: req.params.lookId, status: "complete",
    });
    res.json(buildCard(doc, decon));
  } catch (err) {
    next(err);
  }
});

export default router;
