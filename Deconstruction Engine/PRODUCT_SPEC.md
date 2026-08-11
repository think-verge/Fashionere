# Fashionairre MVP — Product Spec

Read alongside `ARCHITECTURE.md`. This spec is written so an AI coding agent can build the MVP end-to-end.

---

## 1. What it does (one line)
Point it at a fashion collection folder; it deconstructs every look into **color, fabric, pattern, and a design sketch** using Gemini, and stores the results as structured data + assets you can view in a gallery.

## 2. Who/what it's for
The builder-side ingestion tool: turns copyrighted runway imagery into a **reusable, safe-to-store dataset of design facts** (plus generated sketches), for later display in the product's builder.

## 3. Scope

**In scope**
- Input: **one local collection folder** (structure below) — no scraping.
- Deconstruct **apparel garments only** (ignore shoes, bags, jewelry).
- Extract per look: **color palette**, **fabric read**, **pattern/motif recipe** (all Gemini vision reads), and **one design sketch** (Nano Banana image gen).
- Store structured JSON records + sketch assets; keep provenance.
- A simple **static HTML gallery** to view results with brand credit.
- Idempotent batch run.

**Out of scope (parked)**
- Scraping / auto-ingest.
- Database, web server, API, auth.
- The remix/apply builder and pattern **draping**.
- Pattern **swatch tiling** (we capture the pattern *recipe* as text/data, not a tiled image).
- Pixel-exact color (Gemini estimate only).
- Multi-model cross-check (Gemini only).

## 4. Input contract

A folder like:
```
<Designer>/<Season>/
  relationship.json          # runway ↔ details mapping
  runway/    Image_1.jpg, Image_2.jpg, …, Image_Links.txt
  details/   Image_1.jpg, …, Image_Links.txt
```
- `relationship.json`: array of `{ "runway_img_N": <url>, "details_images": [ {"details_img_X": <url>}, … ] }`.
- `Image_Links.txt` (in each subfolder): `Image_N.jpg : <source_url>` per line — used to map indices → files → source URLs for provenance.
- The MVP must **derive file paths** from these: `runway_img_1` → `runway/Image_1.jpg`; `details_img_4` → `details/Image_4.jpg` (index-based).

## 5. Processing per look

1. **Resolve** the runway image + its mapped detail (macro) shots to file paths.
2. **Vision read** (Gemini `gemini-2.5-flash`): send the **macro shots** (the runway image may be included as context) + the fixed prompt (§7) + the response schema (§6). Get structured garments[] + look-level fields.
3. **Sketch** (Nano Banana `gemini-2.5-flash-image`): send the **runway image** + the sketch prompt (§7). Save returned PNG to `assets/<look_id>/sketch.png`.
4. **Assemble & store** the full record (§6).
5. On any step error: populate `processing.errors`, set `status` to `partial` or `failed`, continue the batch.

## 6. Data model (the record — build to this exactly)

One file: `output/looks/<look_id>.json`

```json
{
  "look_id": "look_1",
  "provenance": {
    "designer": "Chanel",
    "collection": "Spring 2026 Couture",
    "source_runway_url": "https://www.vogue.com/…/collection#1",
    "runway_image": "runway/Image_1.jpg",
    "detail_images": ["details/Image_1.jpg", "details/Image_2.jpg", "details/Image_3.jpg"]
  },
  "garments": [
    {
      "piece": "sheer button-front jacket",
      "color": {
        "palette": [
          {"name": "champagne", "hex": "#CDB79C", "role": "dominant"},
          {"name": "blush beige", "hex": "#D8C4B6", "role": "secondary"}
        ]
      },
      "fabric": {
        "guess": "silk chiffon / organza",
        "weight": "lightweight",
        "finish": "sheer, matte",
        "confidence": "high"
      },
      "pattern": {
        "present": true,
        "type": "placement_appliqué",           // "none" | "repeat" | "placement_appliqué"
        "motif": "bird / dove in flight",
        "scale": "large",
        "colors": ["#CDB79C"],
        "description": "outlined organza bird appliqués scattered across the skirt"
      }
    }
  ],
  "look_level": {
    "silhouette_description": "collarless sheer button-front jacket over a slip, with a bias-cut sheer midi skirt; soft, fluid 1920s-lingerie couture line",
    "color_story": ["champagne", "blush", "pearl white"],
    "sketch_asset": "assets/look_1/sketch.png"
  },
  "processing": {
    "model_vision": "gemini-2.5-flash",
    "model_image": "gemini-2.5-flash-image",
    "status": "complete",                        // "complete" | "partial" | "failed"
    "errors": []
  }
}
```

Field rules:
- `hex` is Gemini's **estimate** — approximate, not measured.
- `confidence` ∈ `high | medium | low` (fabric will usually be `medium`/`low`).
- `pattern.type` = `none` when the garment has no motif.
- `role` ∈ `dominant | secondary | accent`.
- Also maintain `output/index.json`: `{"processed": ["look_1", "look_2"]}` for idempotency.

## 7. Gemini prompts (use verbatim as a starting point)

**Vision read (structured):**
> "You are a fashion technical analyst. Analyze ONLY the garments (apparel) in these images — ignore shoes, bags, jewelry, hair, skin, and background. For each distinct garment, return its type, color palette (name + approximate hex + role), fabric (best-guess material, weight, finish, and a confidence level), and pattern (whether present, whether it's a repeating all-over pattern or a placement/appliqué motif, the motif, scale, colors, and a short description). Then give look-level fields: a silhouette description (the cut/construction as a designer would note it) and the overall color story. Base fabric and pattern judgments on the close-up (detail) images. Output must match the provided JSON schema exactly."

**Sketch (image gen):**
> "Redraw the garments in this runway photo as a clean fashion technical flat: front view, black line art on a white background, showing seams, darts, collar, cuffs, plackets, pockets, and hems. Do NOT trace wrinkles, folds, shadows, the model, or the background. No color, no shading — clean construction lines only. Apparel only; omit shoes, bags, and jewelry."

## 8. CLI

```
python -m src.main --input "/path/to/<Designer>/<Season>" --output ./output [--quality] [--force] [--limit N]
```
- `--quality` → use `gemini-2.5-pro` for the vision read.
- `--force` → re-process looks already in `index.json`.
- `--limit N` → process only the first N looks (for cheap testing).

## 9. Output & display
- `output/looks/*.json`, `output/assets/<look_id>/sketch.png`, `output/index.json`, `output/index.html`.
- **Gallery (`index.html`)**: one card per look showing — the source images (referenced by local relative path, **with a visible "© <Designer>, via Vogue" credit**), color swatches (rendered from hex), fabric text + confidence, pattern recipe, and the generated sketch. Vanilla HTML/CSS, no framework, no build step.

## 10. Config & secrets
- `GEMINI_API_KEY` from environment (or `.env`). Never hardcode. Ship `.env.example`.
- `requirements.txt`: `google-genai`, `pillow`, `python-dotenv`.

## 11. Acceptance criteria
1. Running the CLI on the provided Chanel `Spring_2026_Couture` folder processes all mapped looks without crashing.
2. Each processed look produces a valid JSON record matching §6, with `garments[]` populated (color + fabric + pattern) and a `sketch.png` saved.
3. Missing files or API errors are recorded in `processing.errors` and do **not** halt the batch.
4. Re-running without `--force` skips already-processed looks; with `--force` re-processes.
5. `index.html` opens in a browser and shows every look's data next to its credited source images and generated sketch.
6. No secrets in code; runs from a clean checkout after `pip install -r requirements.txt` and setting `GEMINI_API_KEY`.

## 12. Build notes for the AI
- Verify current `google-genai` model IDs and the structured-output + image-generation call shapes against live docs before finalizing.
- Keep each garment/element independently serializable (they'll be lifted individually later for remixing).
- Stamp provenance on every record (needed later for trend analysis and IP audit trail).
- Favor small, testable functions; one look must be runnable in isolation for debugging.
