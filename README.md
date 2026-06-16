# Centoire — Inspiration Engine (MVP 1)

Turns a user input into a **moodboard**: generated image tiles, a trend-driven
color palette, fabric/pattern/detail tiles, a written mood narrative, and
trend-confidence badges.

Three input modes all resolve to one internal `Target`, then share a single
generation path:

1. **Free-text query** — `"latest trends for a beachwear collection"`
2. **Catalogue selection** — pick a predefined item (dress, jeans, t-shirt…)
3. **Image upload** — a pre-uploaded image URL

Everything runs **end-to-end on mock providers with zero API keys**. Real
providers (FLUX via fal.ai / Replicate; Claude / OpenAI) activate via env.

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
# open http://localhost:8000/docs
```

Defaults are all `mock`, so no keys are needed.

## Try it

```bash
# 1. enqueue a moodboard job
curl -s -X POST http://localhost:8000/api/moodboard/from-query \
  -H 'content-type: application/json' \
  -d '{"query":"latest trends for a beachwear collection"}'
# -> {"job_id":"...","status":"pending"}

# 2. poll until done
curl -s http://localhost:8000/api/moodboard/jobs/<job_id>
```

Other modes:

```bash
curl -s -X POST http://localhost:8000/api/moodboard/from-catalogue \
  -H 'content-type: application/json' -d '{"catalogue_item_id":"dress_midi_01"}'

curl -s -X POST http://localhost:8000/api/moodboard/from-image \
  -H 'content-type: application/json' -d '{"image_url":"https://example.com/x.jpg"}'

curl -s http://localhost:8000/api/catalogue
```

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/moodboard/from-query` | `{query}` | `202 {job_id, status}` |
| `POST` | `/api/moodboard/from-catalogue` | `{catalogue_item_id}` | `202 {job_id, status}` |
| `POST` | `/api/moodboard/from-image` | `{image_url}` | `202 {job_id, status}` |
| `GET` | `/api/moodboard/jobs/{job_id}` | — | `{status, moodboard?}` |
| `GET` | `/api/catalogue` | — | list of items |
| `GET` | `/healthz` | — | `{status: ok}` |

Generation is async: each `POST` resolves a `Target`, creates a job, runs the
pipeline in a background task, and returns a `job_id` to poll.

## Architecture

```
query ─┐
catalogue ─┼─▶ resolve() ─▶ Target ─▶ pipeline.generate_moodboard ─▶ Moodboard
image ─┘
```

Three kinds of moodboard content:

| Kind | Source | Cost |
|---|---|---|
| **Pulled** (palette, badges) | read straight from trend objects | free |
| **Written** (narrative, keywords, names) | one LLM call | cheap |
| **Generated** (all visual tiles) | image model, one call per tile, in parallel | main cost |

Everything external sits behind a Protocol (`TrendProvider`, `ImageProvider`,
`TextProvider` in `app/providers/base.py`). The pipeline imports only the
Protocols. One shared `style_anchor` + `seed` per board give visual cohesion.
Image tiles run via `asyncio.gather`; an individual tile failure is skipped
(timeout + 1 retry) rather than failing the whole board.

### Image storage

Every generated tile is **re-hosted by our own backend** so the frontend never
depends on a model provider's ephemeral CDN (`app/storage.py`):

- `STORAGE=local` (default) — `LocalStorage` writes images into `STATIC_DIR`
  and returns `PUBLIC_BASE_URL/static/<file>` URLs, served by the FastAPI
  `/static` mount. The **mock** provider writes self-contained local SVG tiles,
  so the demo runs fully offline with images on `http://localhost:8000/static/...`.
  Real providers (fal/Replicate) have their output **downloaded and saved
  locally**, so links stay alive.
- `STORAGE=none` — keep the provider's original URLs (no re-hosting).
- Swapping to S3/GCS later is a new `Storage` impl behind the same Protocol —
  no pipeline changes.

Moodboard JSON (narrative, palette, badges, image URLs) lives in the `JobStore`
(in-memory dict by default, or Redis). Persisting moodboards to a DB is Phase 2.

## Switching to real providers

Set the provider env vars and supply keys — no code changes:

```bash
# .env
IMAGE_PROVIDER=gemini       # mock | fal | replicate | gemini
TEXT_PROVIDER=gemini        # mock | anthropic | openai | gemini
TREND_PROVIDER=mock         # mock (real Trend Agent slots in here in Phase 2)

GEMINI_API_KEY=...
```

### Google Gemini (text + image "Nano Banana")

One key powers both:

- **Text** — `gemini-2.5-flash` (override with `GEMINI_TEXT_MODEL`, e.g.
  `gemini-2.5-pro`) for narrative/keywords/names and query parsing.
- **Image** — `gemini-2.5-flash-image` ("Nano Banana", override with
  `GEMINI_IMAGE_MODEL`). Returns raw bytes, which `LocalStorage` saves into
  `static/` and serves as `localhost` URLs.

Install: `pip install google-genai` (already in `requirements.txt`).

### Cost control — tiles per board

Real image calls are billed per tile. `IMAGE_TILES` sets how many of each kind:

```bash
# lean demo profile (6 tiles total)
IMAGE_TILES=hero:2,silhouette:1,texture:1,pattern:1,detail:0,styling:1,colorway:0
# rich profile (14 tiles, every section)
IMAGE_TILES=hero:3,silhouette:2,texture:2,pattern:2,detail:2,styling:1,colorway:2
```

Other providers: `FAL_MODEL`, `REPLICATE_MODEL`, `ANTHROPIC_MODEL`,
`OPENAI_MODEL`; SDKs `anthropic`, `openai`, `fal-client`, `replicate`.

Job store: `JOB_STORE=memory` (default) or `redis` with `REDIS_URL`.

## Tests

```bash
pytest
```

Runs fully on mock providers: resolver (3 modes), full pipeline (all sections,
parallelism, fault tolerance), and the API job lifecycle.

## Layout

```
app/
  main.py        FastAPI app, routes, provider wiring
  config.py      env-based settings (provider selection, keys)
  models.py      Pydantic models (Target, Trend*, Moodboard, …)
  resolver.py    3 inputs -> Target
  pipeline.py    Target -> Moodboard (parallel image gen + text + pulled data)
  prompts.py     prompt templates
  composer.py    palette/badges (pulled) + final assembly
  jobs.py        JobStore (in-memory + redis)
  storage.py     Storage Protocol + LocalStorage (re-host images into static/)
  providers/     base Protocols + mock/real implementations
data/            mock_trends.json, catalogue.json
static/          generated images served in dev
tests/           resolver, pipeline, api
```

## Phase 2 (not built yet)

- Structure-preserving upload re-render (ControlNet + IP-Adapter).
- Persist moodboards (DB) → enables MVP 2 learning.
- Swap in the real Trend Analysis Agent behind `TrendProvider`.
```
