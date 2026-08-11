# Deconstruction Engine — fal Migration & Swatch-Library MVP Plan

_Drafted 2026-08-10. Scope: migrate the deconstruction engine off Gemini to fal,
run a small curated batch, and store swatches persistently for reuse._

## Goal
Run **2 runway looks per brand** (7 brands → **~14 looks**) through a new
**fal-only** deconstruction pipeline, and **persist** the generated fabric/pattern
swatches in MongoDB so they are reused, never regenerated.

**Budget:** ~**$2** (worst case ~$3) on fal. Current fal balance ~$8.7.

## Decisions (locked)
- **Vision brain:** fal-only — **EVF-SAM2** segmentation + texture-busyness routing
  + colors from canonical / k-means on the crop. **No VLM, no Gemini, no new key.**
- **Fabric swatch:** **Seedream v4 edit** (`fal-ai/bytedance/seedream/v4/edit`, $0.03).
- **Pattern tile:** **PATINA** (`fal-ai/patina/material/extract`, ~$0.17) — fed a
  CLEAN masked crop (its content-checker hard-fails on skin).
- **Storage:** Mongo **GridFS** (image bytes) + a new **`deconstructions`** collection
  (metadata), in the existing `Fashionere` DB.
- **Segmentation:** EVF-SAM2 (`fal-ai/evf-sam`, $0.005). Fallback if per-garment
  referring expressions don't separate: SAM3/EVF "clothing" mask + vertical-band split.

## Why this shape (validated by testing, see memory `fal-swatch-models`)
- Naive img2img on a whole photo just re-paints the person → **must segment first**.
- Vogue "detail" images are extra full-look shots, not fabric macros → use runway + masks.
- Canonical has fabric TEXT but **zero crop boxes** → regions must come from segmentation.
- PATINA = only true seamless tiler (patterns); Seedream = most faithful + robust (fabric).

## Per-look pipeline (fal-only)
```
canonical Look (from canonical_looks)
  1. download runway image (images[].url, role=runway; UA header)
  2. EVF-SAM2: isolate garments (referring expressions) -> masked regions
  3. per garment region:
       - colors: k-means on the masked crop (free) + canonical palette for names/Pantone
       - route: texture busyness + canonical pattern.motif -> fabric | pattern
       - fabric  -> Seedream v4 edit (box crop)        -> flat swatch PNG
       - pattern -> PATINA (clean MASKED crop)          -> seamless tile PNG
  4. persist: GridFS (PNGs) + deconstructions doc (metadata) + dedup by content_hash
```

## Storage schema — `Fashionere.deconstructions`
```jsonc
{
  "_id": "prada:prada-fall-2025-rtw:29",
  "look_id": "...", "brand": "prada", "collection_id": "prada-fall-2025-rtw",
  "source_runway_url": "https://assets.vogue.com/...",
  "garments": [
    { "garment_id": "g0", "piece": "top", "bbox": [x0,y0,x1,y1],
      "colors": [{"name":"...","pantone":"...","hex":"#..","role":"dominant"}],
      "fabric":  {"material":"...","gridfs_id":"...","content_hash":"...","model":"seedream-v4-edit"},
      "pattern": {"motif":"...","type":"repeat","gridfs_id":"...","content_hash":"...","model":"patina"}
    }
  ],
  "models": {"segment":"evf-sam","fabric":"seedream-v4-edit","pattern":"patina"},
  "status": "complete", "cost_usd": 0.13, "errors": [],
  "schema_version": "1", "created_at": "<stamped by runner>"
}
```
- **Reuse:** skip any `look_id` already present (unless `--force`).
- **Dedup:** `swatch_cache` keyed by source-crop `content_hash` → identical fabric reused
  across looks generates once (collections repeat fabrics; big saving at scale).

## New modules (leave the legacy Gemini pipeline untouched)
- `src/fal_backend.py` — fal wrappers: `segment_evf_sam()`, `fabric_swatch_seedream()`,
  `pattern_tile_patina()`; output-resolution caps (512px = $0.03 floor) + running cost.
- `src/canonical/deconstruct_fal.py` — the per-look fal-only pipeline above.
- `src/canonical/store_mongo.py` — GridFS + `deconstructions` + dedup cache.
- `src/canonical/run_mvp.py` — batch runner: pick 2 looks/brand, resumable, cost log.
- `src/config.py` — add `FAL_KEY` + fal model slugs.

## Look selection (2 per brand)
Deterministic + representative: for each of the 7 brands, pick 2 looks evenly spaced
across that brand's looks that have a runway image (e.g. the 1/3 and 2/3 positions).
Prefer looks whose canonical patterns include a real motif so both routes get exercised.

## Phases
- **Phase 0 — Validate EVF-SAM2 per-garment split** — ✅ DONE ($0.025). Finding: EVF-SAM2
  isolates cleanly when a garment is VISUALLY DISTINCT (Prada charcoal skirt = perfect), but
  OVER-SEGMENTS when adjacent garments share fabric/colour (Dior head-to-toe brocade → "jacket"
  grabbed the whole body + skin) and can miss small/subtle pieces (collar, printed top).
  **Refinement adopted:** treat "one mask = one distinct fabric" (not per-garment name), use
  `mask_only=true`, then **erode the mask + sample the largest interior patch** so skin/edge
  contamination is removed (safe for PATINA). Strict per-garment separation deferred (future:
  garment-specialized model / VLM route).
- **Phase 1 — Storage layer** — ✅ DONE (no fal cost). `store_mongo.py`:
  `Fashionere.deconstructions` + GridFS bucket `swatches` + `swatch_cache` (source-crop dedup).
  Verified: store/dedup/roundtrip/is_done/export all pass; DB left clean.
- **Phase 2 — Pipeline** (building): `fal_backend.py` (EVF-SAM2 + erode/interior-patch + Seedream
  + PATINA + cost tracking) and `deconstruct_fal.py` (canonical Look → elements → swatches → store).
  Legacy Gemini extractor left intact but unused.
- **Phase 3 — Batch**: dry-run 1 look end-to-end (~$0.15, proves EVF→interior-patch→PATINA), then
  1 brand (~$0.25), then the full 14 (~$2).
- **Phase 4 — (later)** update webapp/gallery to read swatches from Mongo/GridFS.

## Cost
| | per look | 14 looks (2/brand) |
|---|---|---|
| Typical | ~$0.13 | ~$1.8 |
| Pattern-heavy | ~$0.22 | ~$3.1 |

Segment ($0.005×~3) + Seedream fabric ($0.03×~3) + PATINA pattern ($0.17×~0.5–1).

## Open risks
- **EVF-SAM2 per-garment separation** unproven → Phase 0 gates the design.
- **PATINA content-checker** blocks on any skin in the crop → always feed masked crops.
- **fal.media URLs are temporary** → always download bytes before persisting.
- Canonical extraction is look-level/coarse for these records → per-garment colors come
  from k-means on the crop, not from canonical.
```
