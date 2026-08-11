# Fashionairre MVP — Architecture

## Purpose
A local batch pipeline that takes one **collection folder** (runway images + detail shots + a mapping JSON) and produces, for every look, a **deconstruction record**: color palette, fabric read, pattern/motif recipe, and a generated design sketch. Output is stored as structured JSON + generated image assets, viewable in a simple static gallery.

This is the **deconstruct → store → view** core of the larger product. Scraping and a full web builder are out of scope for the MVP (see `PRODUCT_SPEC.md` → Scope).

---

## High-level flow

```
collection folder/                     OUTPUT/
  relationship.json  ─┐                  looks/look_1.json      (structured record)
  runway/            ─┼─▶ [ PIPELINE ] ─▶ assets/look_1/sketch.png
  details/           ─┘                   index.html            (gallery)
```

1. **Ingest** — read `relationship.json`, resolve each runway look to its detail (macro) shot file paths, validate files exist.
2. **Deconstruct** — per look:
   - **Vision read** (Gemini) on the **macro shots** → color + fabric + pattern recipe + garment labels, as structured JSON.
   - **Image gen** (Nano Banana) on the **runway image** → a clean design-sketch PNG.
3. **Store** — write one JSON record per look + save the sketch asset; maintain an index.
4. **View** — generate a static `index.html` gallery showing each look's data next to its (locally referenced) source images.

The pipeline is **idempotent**: a look already stored is skipped unless `--force` is passed.

---

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | **Python 3.11+** | Natural fit; best Gemini SDK support |
| AI | **Gemini** via `google-genai` SDK | Single provider for vision + image gen |
| — vision model | `gemini-2.5-flash` (default), `gemini-2.5-pro` (optional `--quality`) | Cheap reads; Pro when accuracy matters |
| — image model | `gemini-2.5-flash-image` (Nano Banana) | Sketch generation |
| Image I/O | **Pillow** | Load/validate/save images |
| Config | env var `GEMINI_API_KEY` (+ `.env` via `python-dotenv`) | No hardcoded secrets |
| Output | JSON files + PNG assets + vanilla static `index.html` | No server/DB needed for MVP |
| CLI | `argparse` | `python -m src.main --input <folder> --output <dir>` |

> ⚠️ Model IDs above are current-as-written; the builder must verify against live `google-genai` docs and adjust if renamed. Structured output uses `response_mime_type="application/json"` + `response_schema`. Image gen reads inline image bytes from the response candidates.

---

## Codebase structure

```
fashionairre-mvp/
  README.md
  requirements.txt          # google-genai, pillow, python-dotenv
  .env.example              # GEMINI_API_KEY=
  src/
    config.py               # paths, model IDs, load API key, tunables
    schemas.py              # Gemini response schema + record dataclasses/TypedDicts
    ingest.py               # parse relationship.json -> list[Look] with resolved paths
    deconstruct.py          # read_elements() [vision] + generate_sketch() [image]
    store.py                # write/read look records, save assets, index, idempotency
    gallery.py              # render static index.html from stored records
    main.py                 # orchestrate: ingest -> per-look deconstruct -> store -> gallery
  output/                   # generated (records + assets + gallery)
```

---

## Module responsibilities

- **`config.py`** — loads `GEMINI_API_KEY`; defines model IDs, output paths, and tunables (max palette size, vision model, retry counts). No secrets in code.
- **`ingest.py`** — parses `relationship.json`; for each `runway_img_N`, resolves the runway image file and its mapped `details_img_*` files to absolute paths (via the folder's `Image_Links.txt` / positional order); returns a list of `Look` objects. Skips/records any missing files instead of crashing. Also reads source URLs for provenance.
- **`deconstruct.py`**
  - `read_elements(look)` → one Gemini vision call: sends the macro shots + a fixed prompt + `response_schema`; returns validated structured JSON (garments with color/fabric/pattern, plus look-level silhouette + color story). Apparel-only (prompt instructs it to ignore shoes/bags/jewelry).
  - `generate_sketch(look)` → one Nano Banana call: sends the runway image + a "redraw as a clean technical flat" prompt; returns PNG bytes.
  - Both wrapped with retry + graceful failure (record the error in the record, keep going).
- **`store.py`** — writes `output/looks/<look_id>.json` and `output/assets/<look_id>/sketch.png`; maintains `output/index.json` (list of processed look_ids for idempotency); `--force` re-processes.
- **`gallery.py`** — reads all records → renders `output/index.html`: one card per look with the hotlinked/local source images (with brand credit), the color swatches, fabric text, pattern recipe, and the generated sketch.
- **`main.py`** — CLI orchestration; per-look try/except so one failure never halts the batch; prints a summary (processed / skipped / failed).

---

## Data flow contract (the important part)

**Input** the pipeline can rely on:
- `relationship.json` mapping `runway_img_N → [details_img_X, ...]`.
- `runway/Image_N.jpg`, `details/Image_N.jpg`, and `Image_Links.txt` files present.

**Output** per look — a single JSON record (full schema in `PRODUCT_SPEC.md` → Data model). Shape:
```
look_id, provenance{designer, collection, source_url, runway_image, detail_images[]},
garments[ {piece, color{palette[]}, fabric{...}, pattern{...}} ],
look_level{silhouette_description, color_story[], sketch_asset},
processing{models, status, errors[]}
```

---

## Error handling & cost

- **Per-look isolation** — one look failing (bad image, API error) records the error and moves on; the batch completes.
- **Retries** — vision + image calls retry (exponential backoff) on transient errors; give up after N and mark the look partial.
- **Idempotency** — `output/index.json` tracks done looks; re-runs skip them unless `--force`.
- **Cost control** — default to `gemini-2.5-flash` for reads; one vision call + one image call per look. A 60-look collection ≈ 60 vision + 60 image calls.

---

## Out of scope for MVP (see full plan)
Scraping, database, web server/API, remix/apply builder, pattern-swatch tiling, draping, pixel-exact color, multi-model cross-check. All parked — this MVP proves the deconstruct→store→view loop on a provided folder.
