# Deconstruction Engine — fal Migration Handoff

**Purpose:** seed a fresh conversation to move the deconstruction engine's *image
generation* from Gemini to **fal**.

> **Provenance note (read first):** The deconstruction engine as it exists today
> was built on **Gemini** (vision read + "Nano Banana" image gen). No specific
> fal model plan was decided in the conversation that produced this repo. The
> "Proposed fal mapping" below is a **fresh proposal to finalize**, not a prior
> decision — every fal model named is a *candidate*; verify exact endpoint IDs
> and pricing on fal's live model catalog before committing.

---

## 1. What the deconstruction engine does

Input = one look's images (runway + detail shots). Output, **per garment**:
- **color palette** — name + **Pantone (TCX)** + hex + role
- **fabric swatches** — a clean tile per distinct fabric
- **pattern swatches** — seamless tile (repeat) or isolated motif (placement)
- one whole-look **design sketch** (technical flat)

It writes `{ look: <canonical>, assets: <swatch/sketch paths> }`. The canonical
`Look` (shared with the trend engine) is the source of truth; assets are derived.

---

## 2. The use-cases (each needs a model) — current vs proposed fal

| # | Use-case | Current (Gemini) | Proposed fal candidate(s) — **verify IDs** | Notes |
|---|---|---|---|---|
| 1 | **Attribute *labels*** (colors/pantone, fabric, pattern, theme) | `gemini-2.5-flash` | **NOT NEEDED — `canonical_looks` already has these** (from the scrape). Reuse them; do not re-extract. | ⚠️ Only re-run a VLM here if you need **per-garment splitting** (canonical is *look-level*, `piece=None`). |
| 2 | **Region localization** (which garment + WHERE each fabric/pattern is, to crop a real swatch) | Gemini bbox + Pillow crop | **SAM2 / Grounded-SAM** on fal; OR skip if FLUX img2img can locate+extract the region from the full photo itself | This — not #1 — is the real "vision" need. Canonical has no spatial info. May be absorbed by fal img2img. |
| 3 | **Fabric swatch** (real crop → clean flat tile) | Gemini image-to-image "clean this crop" | **FLUX img2img** (redraw crop as a flat swatch) + **background removal** (e.g. birefnet) + **upscaler** (e.g. clarity / aura-sr) | fal img2img may transform real-photo crops that Gemini refused — big potential win. |
| 4 | **Pattern swatch** (crop → seamless tile / isolated motif) | Gemini image-to-image | **FLUX img2img** + a **seamless-tiling** step; **background removal** for placement motifs | Preserve real motif/colors; make repeats tileable. |
| 5 | **Design sketch** (look → technical flat line art) | Gemini text/img-to-image | **FLUX + ControlNet (lineart/canny)** or an img2img lineart model | Redraw as clean flat, not trace. |
| 6 | **(Future) Draping / apply pattern to a garment** | (deferred) | **FLUX Fill / inpainting + ControlNet (depth)** | The "remix" builder. |
| 7 | **(Support) Upscale / background removal** | n/a | fal has strong upscalers + matting models | Post-process swatches for crispness. |

---

## 3. Constraints & lessons carried over (important)

- **The big reason to try fal:** Gemini's image model **refuses to transform
  photographs of real people** (`finish_reason=IMAGE_OTHER`) — that forced our
  swatches to come from cropped, face-free regions and sketches from *text*, not
  the real photo. **fal / FLUX may permit img2img on the actual runway photo** —
  if so, swatches and sketches can be far more faithful. **Verify fal's policy.**
- Gemini also had intermittent **`IMAGE_RECITATION`** blocks (empty swatches);
  fal won't have that specific failure mode.
- **Trademark guardrail stays:** never reproduce brand logos/monograms (e.g. the
  Chanel CC). Enforced in *extraction* (exclude `is_brand_mark`), model-agnostic.
- **Pantone is an estimate** from pixels; a deterministic hex→Pantone lookup is a
  future accuracy upgrade.
- **Images:** the raw source (`Fashionere.Raw Data` / `canonical_looks`) carries
  **direct `assets.vogue.com` image URLs** — download the bytes (fal endpoints
  take an image URL or bytes; a direct URL likely works).

---

## 4. Where the code is (starting points)

```
Fashionairre/
  core/                                  shared canonical schema + Mongo store (SOURCE OF TRUTH)
     fashionairre_core/schema.py         canonical Look
     .../store.py, adapters/mongo_raw.py canonical_looks in Mongo (2,201 looks, 7 brands)
  Strategy/mvp/                          DECONSTRUCTION engine
     src/deconstruct.py                  ★ the Gemini image calls to swap for fal:
                                           _generate_image(), generate_fabric_swatch(),
                                           generate_pattern_swatch(), generate_sketch_from_vision(),
                                           crop_region(), _detail_level()
     src/canonical/extractor.py          vision read (attributes + bboxes)  [use-case #1]
     src/canonical/pipeline.py           orchestration → { look, assets }
     src/schemas.py                      (legacy per-garment schema; fallback)
```

**Cleanest migration shape:** keep the pipeline + function *signatures*; swap the
**backend** inside `deconstruct._generate_image` (and add a fal client) so
`generate_fabric_swatch / generate_pattern_swatch / generate_sketch_*` call fal
instead of Gemini. Extraction (#1) likely stays on a VLM.

---

## 5. Canonical integration status (context for the new chat)

- **Source of truth:** `Fashionere.canonical_looks` (Mongo) — both engines read it.
- Deconstruction path: canonical look → **download image URL** → extract (#1) →
  isolate/crop (#2) → generate swatches (#3,4) + sketch (#5) → `{look, assets}`.
- Trend engine is being attached in parallel (weighted sheets per brand); the
  "is this element trending" **badge** join already works.

---

## 6. Open questions to resolve first in the new conversation

1. **Does fal allow img2img on real runway photos (with people)?** This decides
   whether we can do photo-faithful swatches/sketches (the thing Gemini blocked).
2. **Exact fal model IDs + pricing/latency** for: FLUX img2img, ControlNet
   lineart, seamless-tiling, background removal, upscaler, (SAM2).
3. **Extraction (#1):** keep Gemini/Claude VLM, or is there a fal VLM you prefer?
4. **fal auth/SDK:** `fal-client` (Python) + `FAL_KEY` env var — confirm setup.
5. **Cost target** per look (fal calls × garments) vs the current Gemini cost.

---

## 7. Suggested first step in the new conversation
Pick **one** use-case to port end-to-end as a spike — recommend **#5 Design
sketch** (single call, easy to eyeball) or **#3 Fabric swatch** — using a fal
FLUX endpoint on a real `canonical_looks` image, and compare against the current
Gemini output. Then port the rest behind the same function signatures.
