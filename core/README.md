# fashionairre-core

The **single source of truth** both engines converge on: one canonical `Look`
record + one thin adapter per data source. This removes the duplicated
"look → attributes" work between the **deconstruction** engine (image → attributes
+ swatches) and the **trend** engine (attributes → tags → momentum).

This is **Step 0** of the consolidation: the schema + adapters + a proof that one
schema holds both of today's (separate) data sources. The two engines are **not
yet rewired** — that's incremental Steps 1–3.

## The canonical `Look` (five layers)

| Layer | Holds | Filled by |
|---|---|---|
| `source` | where it came from (URL, native ids) — loose, per-source | adapter |
| `context` | brand / collection / season / year — **all optional** (aggregation keys) | adapter |
| `images` | media (files preferred; page-links tolerated), with stable `image_id`s | adapter |
| `native_text` | source captions / keywords — **not** attributes | adapter |
| `extraction` | the outfit: `garments[]` (colors+pantone, fabrics, patterns w/ `source_region`) + `look_level` (silhouette, color_story, themes, details) | **the extractor** |

Attribute objects carry **free-form** fields (what the extractor sees) **plus
optional derived** fields — `color.family`, `fabric.value`, `pattern.value` — that
a downstream normalizer fills. A raw extraction validates without them.

Derived artefacts (swatch/sketch assets, vocab tags, trend momentum) live in each
engine, **not** here.

## Adapters (sources kept separate)

| Adapter | Source | Notes |
|---|---|---|
| `adapters/vogue_text` | existing Prada JSON (text, page-links) | maps legacy attrs → free-form `extraction`; one garment (`piece=None`) |
| `adapters/vision_folder` | Chanel-style image folder | canonical shell with real image files; `extraction=None` |
| `adapters/deconstruction` | a deconstruction-engine record | per-garment record → canonical `extraction` |

`look_id = "{brand_slug}:{collection_id}:{look_number}"` is deterministic, so the
image half and the text half of the *same* look reconcile to one record.

## Run the proof

```bash
pip install -r requirements.txt
python proof.py
```

Loads a real Prada text look, a real Chanel image folder, and a real
deconstruction record, and asserts all validate under the one `Look` model.

## Next steps (incremental, engines stay runnable)
1. **Vision adapter** — extend the deconstruction extractor to also emit `theme` +
   `details`, and output the canonical `extraction` directly.
2. **Trend consumes canonical** — point the trend normalizer at `extraction`
   (keep `vogue_text` for the 268 legacy looks).
3. **The join** — trend momentum badge on a deconstructed element via
   vocab-value → `RankedValue.momentum`.
