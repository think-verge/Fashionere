# Fashionairre — Project Status & Next Steps

_Last updated: 2026-08-07_

A recap of everything built so far across the **core framework**, the **trend
analysis engine**, and the **deconstruction engine** — and the concrete next
step (deconstruction on **fal**, with exact models per focus area).

---

## 0. The big picture

One shared **source of truth** (canonical `Look` records in MongoDB) that **both
engines read**. Nothing extracts the same thing twice.

```
  MongoDB  Fashionere.Raw Data  (2,301 pre-scraped looks, 7 brands)
        │   attributes (colors+pantone, fabric, theme, patterns) + image URLs
        ▼   [ mongo_raw adapter — no LLM ]
  Fashionere.canonical_looks   (2,201 canonical Looks)  ◄── SOURCE OF TRUTH
        ├──────────────► TREND ENGINE
        │                canonical → vocab tags → recency-weighted aggregate
        │                → trend sheets (per brand) → momentum badges
        └──────────────► DECONSTRUCTION ENGINE
                         canonical → download image → (fal) swatches + sketch
                         → separate, editable per-garment objects
```

**Repo layout**
```
Fashionairre/
  core/                         ← shared canonical schema + Mongo store  (DONE)
  Trend Analysis Engine/        ← trend engine (legacy + canonical bridge)
  Deconstruction Engine/        ← deconstruction engine (Gemini vision + fal image gen)
```

---

## 1. Core framework (`fashionairre-core`) — ✅ DONE

The shared layer both engines converge on.

- **Canonical `Look` schema** (`core/fashionairre_core/schema.py`), source-agnostic,
  Pydantic. Five layers: `source · context · images · native_text · extraction`.
  Only `source`+`context` vary per source; `extraction` is the stable core
  (per-garment color palette w/ **Pantone**+hex, fabrics, patterns, silhouette,
  themes, details).
- **Adapters** (`core/…/adapters/`): `mongo_raw` (Raw Data → canonical),
  `vogue_text` (legacy Prada JSON), `vision_folder` (image folder), `deconstruction`
  (decon record → canonical extraction). New source = new adapter; nothing
  downstream changes.
- **Store** (`core/…/store.py`): `CanonicalStore` over pymongo, `_id = look_id`
  (deterministic → upsert, no dupes, cross-source reconcile).
- **Ingestion** (`core/ingest_mongo.py`).

**State:** `Fashionere.canonical_looks` = **2,201 looks, 7 brands**, every record
validates against the schema, every record carries a **fetchable image URL**.
**Cost: $0** (no LLM — pure field mapping).

Run: `python ingest_mongo.py --env "../Trend Analysis Engine/.env" --drop`

---

## 2. Trend Analysis Engine — 🟡 4 of 7 brands done (blocked on Gemini credits)

Turns runway looks into per-brand trend sheets (dominance / signature / **momentum**),
and can badge any element as rising/fading.

- **Legacy engine** (unchanged, still a fallback): `adapters/vogue`, `normalize`,
  `aggregate`, `compose`, `scope` — the original Prada text pipeline.
- **Canonical bridge** (additive, `trend_engine/canonical/`):
  - `bridge.py` — canonical Look → trend Look → existing normalizer → vocab tags.
  - `aggregate_weighted.py` — **recency-weighted** aggregation (see rule below).
  - `build_sheets.py` — per brand: canonical → normalize (cached in
    `Fashionere.tagged_looks`, parallel, retry/skip) → weighted sheet →
    `Fashionere.trend_sheets`.
  - `trends_lookup.py` — the **momentum-badge join** (element vocab value →
    `RankedValue.momentum`).

**Scope / weighting rule (agreed):** per-brand window = most recent **≤3 years**.
The **two most recent** years are full-weight and drive **momentum** (fixed a
legacy bug that compared max-vs-min year). A 3rd older year (**2025 when 2027
exists**) is **down-weighted to 0.25** in share/signature only. Brands without
2027 → standard 2-year window.

**State:**
| Brand | Sheet | Window | Looks |
|---|---|---|---|
| Prada | ✅ | 2025–2026 | 163 |
| Balenciaga | ✅ (3-yr, 2025 @0.25) | 2025–2027 | 352 |
| Chanel | ✅ | 2025–2026 | 446 |
| Christian Dior | ✅ | 2025–2026 | 210 |
| Gucci | ⛔ | — | ~11/353 tagged |
| Louis Vuitton | ⛔ (empty sheet to delete) | — | 0 |
| Valentino | ⛔ | — | 0 |

- **1,182 tagged looks cached** → the 4 done brands need no re-tagging.
- **Blocker:** the remaining 3 brands need ~1,000 more `gemini-2.5-flash`
  normalization calls, but the **Gemini prepaid credits are depleted** (429
  `RESOURCE_EXHAUSTED`). Resumable the moment credits are topped up (or swap the
  normalizer to another VLM).
- **Cleanup TODO:** delete the empty `louis-vuitton` sheet (garbage from the
  failed run) so it doesn't pollute the join.

Run: `python -m trend_engine.canonical.build_sheets --env .env [--brand X] [--limit N]`

---

## 3. Deconstruction Engine — ✅ works on Gemini, → migrating to fal

Turns a look's images into reusable design elements: **color palette (Pantone),
fabric swatches, pattern swatches, design sketch** — per garment.

- **Built (Gemini):** `Deconstruction Engine/src/` — vision read + Nano-Banana swatch/sketch
  gen, crop-then-clean from real regions, per-garment split, Pantone, trademark
  guardrail. FastAPI drag-drop web app + CLI + a canonical pipeline
  (`src/canonical/` → `{ look, assets }`).
- **Key learnings:** Gemini's image model **refuses to transform photos of real
  people** (`IMAGE_OTHER`) → forced text/crop workarounds; also intermittent
  `IMAGE_RECITATION`. **These are the main reasons to move to fal.**

**State:** functional on Gemini; not yet reading `canonical_looks`; image-gen not
yet on fal.

---

## 4. Downstream goal (PARKED — do NOT build yet): the AI builder

Deconstruction output must be shaped for a future **editor**, where a designer
edits each element and recomposes a custom look. So deconstruction must emit
**separate, independently-editable, individually-stored objects** per garment
(color / fabric / pattern / sketch). Decisions already taken (parked):
- **Sketch editing = hybrid** (vector for hand edits + raster for AI edits).
- **Recompose ("generate my version") =** primarily redraw-from-sketch+material
  (ControlNet + IP-Adapter), plus inpaint/Fill for spot edits.
- **Storage = 3 layers**, non-destructive: original elements → edited elements
  (`derived_from`) → composition (recipe referencing element ids).

**This is parked until deconstruction is solid** — but deconstruction's output
must already be per-garment, separate, clean/isolated objects so the builder can
consume them.

---

## 5. NEXT STEP — Deconstruction on fal (exact models per focus area)

> fal slugs/pricing shift and are from memory — **verify on fal.ai/models before
> committing**, and A/B two options on real macros for #3–#5.

Reuse canonical attributes as prompts; **fal only makes images.** No attribute
re-extraction anywhere.

### 5.1 Outfit segregation (jacket / skirt / shirt …)
- **Model:** text-promptable garment segmentation — **Grounded-SAM** (Grounding
  DINO → SAM 2). fal: `fal-ai/grounded-sam` (or `fal-ai/grounding-dino` + `fal-ai/sam2`).
- **Use:** `image_url` (runway look) + prompt `"jacket. skirt. top. trousers. dress. coat."`
  → boxes + masks per garment → crop each → per-garment cutouts (feed #3/#4/#5).
- **Cost:** ~$0.005/look.

### 5.2 Colors — from **canonical**. No model. ✅

### 5.3 Fabrics (use macro shots)
- **Model:** lean on real pixels — **upscale** the macro crop (`fal-ai/clarity-upscaler`
  or `fal-ai/aura-sr`); optional low-strength **FLUX img2img**
  (`fal-ai/flux/dev/image-to-image`, strength ~0.3–0.45, "flat evenly-lit swatch")
  to flatten; `fal-ai/birefnet` to matte if needed.
- **Avoid** text→image (drifts from the real fabric).
- **Cost:** ~$0.02–0.05 per distinct fabric.

### 5.4 Patterns (use macro shots)
- **Repeat** → seamless **tile**: FLUX img2img with tiling / a seamless-texture model
  / ControlNet-tile.
- **Placement motif** → **isolate**: Grounding-DINO+SAM to segment + `birefnet` matte
  → clean transparent PNG.
- Route by `pattern.type` from canonical (no model to decide).
- **Cost:** ~$0.03–0.04 per pattern.

### 5.5 Design sketch — **ACE THIS** (the hardest & most important)
Multi-stage, not one call:
1. **Isolate the garment first** (from #1) → feed a clean cutout (no body/face/bg).
2. **Structure via ControlNet (lineart/canny):** FLUX + ControlNet so the flat
   follows the real seams/darts/silhouette. fal: `fal-ai/flux-general`
   (controlnet-union canny/depth) or a FLUX lineart-controlnet endpoint.
3. **Style via a technical-flat LoRA** (biggest lever for "hand-drawn designer"):
   `fal-ai/flux-lora` loading a fashion technical-flat / CAD LoRA (source from
   Civitai/HF). Fallback: strong prompt ("fashion technical flat, front view,
   black ink line art on white, seams/darts/pockets, no shading, no body").
4. **Produce per-garment flats + a full-look flat.**
- **Recommended stack:** `FLUX.1 dev + ControlNet(lineart) + flat-LoRA`.
- **"Generate once then split" (cheaper):** prompt a **flats *sheet*** (each garment
  drawn separately, NOT worn, on white) → split with free CV
  (OpenCV connected-components / bounding boxes). Avoid splitting a *worn* full-look
  flat — occlusion (jacket over top) yields incomplete garments.
- **Cost:** ~$0.04–0.05 per flat; ~$0.15–0.20/look.

### 5.6 (Later, for the builder) Recompose / apply
- FLUX + ControlNet (sketch = structure) + **IP-Adapter** (fabric/pattern = style),
  or FLUX **Fill/inpaint** for spot edits. Parked with the builder.

### Cost per outfit (estimate, verify)
~**$0.30–0.55** typical (sketches ≈ half). Lean (upscale-only swatches, one
full-look sketch) ~**$0.15**; rich ~**$0.85**. Batch of 2,201 ≈ **~$900** (range
$550–1,200). Colors + attributes are free (canonical).

### Migration shape
Keep the pipeline + function signatures; swap the **backend** inside
`Deconstruction Engine/src/deconstruct._generate_image` and `generate_fabric_swatch /
generate_pattern_swatch / generate_sketch_*` to call **fal**. Rewire the input to
read a look from `canonical_looks` (reuse its attributes; **skip** re-extraction).
Output must be **separate per-garment, editable objects** (for the future builder).

### Recommended first spike
Port **one** use-case end-to-end on a real `canonical_looks` image — recommend the
**design sketch** (#5, the important one) or **fabric swatch** (#3) — and compare
against the current Gemini output. First verify **whether fal/FLUX allows img2img
on the real runway photo** (Gemini blocked it) — that decides how faithful
swatches/sketches can be.

---

## 6. Open items / blockers
- **Gemini prepaid credits depleted** → trend backfill (gucci/LV/valentino) paused.
  Top up, or point the normalizer at another VLM.
- **Delete the empty `louis-vuitton` trend sheet.**
- **Rotate the MongoDB password** (`sompande_db_user`) — it was shared in chat.
- **Automate raw→canonical ingestion** (currently a manual batch; use `content_hash`
  for incremental + a cron/change-stream) — deferred.
- fal deconstruction is **fal-billed**, independent of Gemini credits.
