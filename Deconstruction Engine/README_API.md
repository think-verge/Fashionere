# Deconstruction Engine — Read API

Read-only FastAPI over the deconstruction store (MongoDB `Fashionere.deconstructions`
+ GridFS `swatches`). Given a `look_id`, returns every deconstructed element of that
runway look with metadata + image URLs. No fal, no writes.

## Run
```bash
cd "Deconstruction Engine"
python3 -m uvicorn src.api.app:app --reload --port 8000
# interactive docs: http://localhost:8000/docs
```
Reads `MONGO_URI` from `src/.env` / `../Trend Analysis Engine/.env` automatically.

## Endpoints
| Method & path | Purpose |
|---|---|
| `GET /api/looks` | list deconstructed looks (`?brand=<slug>` to filter) — gallery rows |
| `GET /api/looks/{look_id}` | full deconstruction of one outfit |
| `GET /api/assets/{gridfs_id}` | stream a swatch/flat PNG (use in `<img src>`) |

`look_id` example: `louis-vuitton:louis-vuitton-fall-2026-rtw:29`

## `GET /api/looks/{look_id}` response
```jsonc
{
  "look_id": "...", "brand": "...", "collection_id": "...",
  "runway_url": "https://assets.vogue.com/.../....jpg",
  "silhouette": "...",
  "whole_look_flat": "/api/assets/<id>",          // may be null
  "garments": [
    {
      "garment_id": "g0", "piece": "...",
      "colors":  [{ "name","pantone","hex","role" }],
      "flat":    "/api/assets/<id>",               // per-garment technical flat (may be null)
      "fabrics": [{ "name","material","weight","finish","description","confidence","swatch_url" }],
      "patterns":[{ "name","motif","type","scale","colors","description","swatch_url" }]
    }
  ],
  "status": "complete"
}
```
Every `*_url` / `flat` / `whole_look_flat` points at `GET /api/assets/{gridfs_id}`,
which returns the PNG bytes. So from just the `look_id`, the frontend has the full
deconstruction plus ready-to-render image URLs.

## Notes
- Read-only; safe to expose. Tighten `allow_origins` in `app.py` for production.
- Older records may have `null` flats or lack `name`/`description` (generated before
  those features) — the API returns whatever is stored.
