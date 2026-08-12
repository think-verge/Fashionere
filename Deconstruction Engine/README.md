# Fashionairre MVP — Deconstruction Engine

Point it at one fashion **collection folder** (runway images + detail shots + a
`relationship.json`). For every look it deconstructs the **apparel** into
**color palette, fabric read, and pattern/motif recipe** (Gemini vision) plus a
clean **design sketch** (Nano Banana image gen), stores everything as structured
JSON + PNG assets, and builds a static HTML gallery.

This is the **deconstruct → store → view** core. Scraping and the web builder are
out of scope (see `PRODUCT_SPEC.md`).

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env          # then paste your key into .env
# GEMINI_API_KEY=...          # get one at https://aistudio.google.com/apikey
```

## Run — two ways

### A) Web app (drag & drop, one look at a time)

```bash
python -m src.webapp            # opens http://127.0.0.1:8000 in your browser
```

Drag in a **runway image** + its **detail/macro shots**, (optionally) type the
designer/collection/source, and click **Deconstruct**. You get the color
palette, fabric read, pattern recipe, and a generated design sketch live — no
`relationship.json` needed. Each run saves a record + sketch under `output/`
(the uploaded source photos are **not** stored — only the safe deconstructed
facts + the generated sketch). Flags: `--port`, `--host`, `--output`, `--no-open`.

### B) CLI batch (a whole collection folder)

```bash
python -m src.main \
  --input "/Users/sompande/Downloads/Fashion_Images_Data/Chanel/Spring_2026_Couture" \
  --output ./output
```

Then open `output/index.html` in a browser. Use this when you have a full
collection folder with a `relationship.json` mapping.

### Flags

| Flag | Effect |
|---|---|
| `--quality` | Use `gemini-2.5-pro` for the vision read (default: `gemini-2.5-flash`) |
| `--force` | Re-process looks already in `output/index.json` |
| `--limit N` | Process only the first N looks (cheap testing — try `--limit 1` first) |
| `--gallery-only` | Skip all API calls; just re-render `index.html` from stored records |

**Cheap first run:** `--limit 1` does 1 vision + 1 image call, so you can eyeball
one look before spending on the whole collection.

## Output layout

```
output/
  looks/<look_id>.json        structured record per look (color/fabric/pattern + provenance)
  assets/<look_id>/sketch.png generated technical flat
  index.json                  {"processed": [...]}  ← idempotency
  index.html                  gallery
```

## Tech stack

| Layer | Choice |
|---|---|
| AI | **Gemini** via `google-genai` — vision read + sketch (one provider) |
| Backend | **FastAPI + Uvicorn**, **Pydantic v2** (one model = Gemini `response_schema` + validation + record shape) |
| Frontend | Vanilla HTML/CSS/JS (single page, no build step) — served by FastAPI |
| Storage | JSON records + PNG assets on disk (no DB yet) |
| CLI | `argparse` batch runner (`src/main.py`) sharing the same engine |

## How it works

| Module | Role |
|---|---|
| `src/schemas.py` | **Pydantic models** — the single source of truth for the Gemini schema, API validation, and the record shape |
| `src/deconstruct.py` | The engine (folder-agnostic): `read_elements_from_images()` (vision) + `generate_sketch_from_vision()` (Nano Banana); retry + graceful failure |
| `src/webapp.py` | **FastAPI app** — drag-drop UI + `POST /api/deconstruct` (multipart uploads); runs one look, saves + returns it |
| `src/ingest.py` | (CLI) Parse `relationship.json` + `Image_Links.txt` → `Look` objects with resolved paths + provenance |
| `src/store.py` | Write records/assets, maintain `index.json` for idempotency |
| `src/gallery.py` | (CLI) Render static `index.html` with source images (brand-credited), swatches, fabric, pattern, sketch |
| `src/main.py` | CLI batch orchestration; per-look isolation; summary |

- **Detail (macro) shots** drive the close-in reads (fabric, pattern); the
  **runway image** gives whole-look context for the vision read.
- **Sketch = text-to-image from the vision read**, not a transform of the source
  photo. Gemini's image model refuses to redraw photographs of real people
  (returns `finish_reason=IMAGE_OTHER`, no image), so the flat is generated from
  the deconstructed garment list + silhouette. This also matches the IP plan's
  "regenerate, don't copy" principle. (PRODUCT_SPEC §7's photo-based prompt is
  kept in the code as a comment for reference.)
- **Per-look isolation:** a bad image or API error is recorded in
  `processing.errors` and the batch keeps going (`status`: `complete` /
  `partial` / `failed`).
- **Idempotent:** re-runs skip processed looks unless `--force`.

## IP note
Stores **facts** (hex, fabric type, motif descriptions) + regenerated sketches,
not redistributed copies of the source photos. Provenance (source URL, designer,
collection) is stamped on every record. See `../outfit-deconstruction-plan.md`
→ *Storage & IP strategy*. Not legal advice.

## Notes
- Model IDs (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-image`) are
  current-as-written; verify against live `google-genai` docs if renamed.
- `hex` values and fabric guesses are Gemini **estimates** — approximate; fabric
  carries a confidence flag.
