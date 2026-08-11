# Fashionairre — Trend Analysis Engine · DESIGN.md

**Status:** Approved approach, pre-implementation.
**Audience:** The engineer / coding assistant implementing this. This document is the build spec — it should be sufficient to implement the system without re-deriving decisions. Where a choice is a recommendation rather than a hard requirement, it is marked _(recommended)_.

---

## 1. Purpose & product context

Fashionairre's **Trend Analysis Engine** turns runway data into **magazine-style trend reports** for fashion designers. A report answers, per focus area (color, fabric, pattern, silhouette, theme, details), *what a brand is doing, what defines it, and what is rising or fading right now* — grounded in real runway data with citations back to specific looks.

Four target user flows exist long-term:

1. What's trending in a **season** (across the industry).
2. What's trending for a **brand** (e.g. Prada).
3. **Compare** two brands.
4. **Bring-your-own** outfit → is it trending?

**This build implements the foundation for Flow 2: a brand-overall report**, delivered as a **brand-agnostic, source-agnostic framework** behind one HTTP endpoint. Prada/Vogue are the first data run, not special cases.

---

## 2. Scope of this build

**In scope**
- Ingest the existing Vogue runway data (currently Prada, 5 collections) into a canonical model.
- Normalize free-text attributes into countable tags.
- Aggregate into dominance / signature / momentum, plus a color palette.
- Compose a **brand-overall** report (structured model + rendered magazine HTML).
- Expose it as `POST /trend-report`, payload keyed by **brand**.
- Keep every layer brand- and source-agnostic (pluggable adapters, vocab, scope policies, renderers).

**Out of scope / deferred** (design must not preclude them)
- Flow 1 (season-across-industry), Flow 3 (compare), Flow 4 (BYO). Flow 1/3 become new **scope policies**; Flow 4 reuses the normalizer.
- Real runway image fetching (source gives page links, not image files — see §6.4). Reports use graceful placeholders for now.
- Semantic search / embeddings and emergent-trend clustering (Phase 6, optional).
- Auth, rate-limiting, multi-tenant concerns.

---

## 3. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Language | **Python 3.11+** | matches existing Fashionairre MVP |
| API | **FastAPI + Uvicorn** | async endpoints |
| Models / validation | **Pydantic v2** | single source of truth: canonical schema, LLM response schemas, API I/O |
| Database | **MongoDB** | already in use. **Motor** (async) in the API layer; **PyMongo** acceptable in offline jobs |
| LLM | **Gemini via `google-genai`** | `gemini-2.5-flash` for bulk normalization; `gemini-2.5-pro` for narration _(recommended)_. Structured output via `response_schema` (Pydantic). Provider is swappable behind an interface. |
| Color math | **`coloraide`** (hex→CIELAB, ΔE2000) + **NumPy** | deterministic color-family assignment |
| Palette clustering | **scikit-learn** (KMeans in LAB) | dominant-palette extraction |
| Config | **python-dotenv** | `.env` |
| Tests | **pytest** | fixtures use the real Prada JSON |
| Embeddings _(deferred)_ | Gemini `text-embedding-004` | Phase 6 only |

**Env vars:** `GEMINI_API_KEY`, `MONGO_URI`, `MONGO_DB` (default `fashionairre_trends`), `NORMALIZE_MODEL`, `NARRATE_MODEL`, `LOG_LEVEL`.

---

## 4. Architecture overview

Pipeline mantra: **Clean → Tidy → Tally → Write.** Split across an offline data pipeline and an online request path.

```
OFFLINE  (per source, runs when new data lands — batch, incremental)
  jobs.ingest
    └─ adapters.<source>   raw source records ─► canonical Look        [CLEAN]
    └─ normalize.pipeline  canonical Look ─► tagged Look               [TIDY]
    └─ store               persist looks + collections
    └─ bump data_version[brand]  (+ optional pre-warm of the overall report)

ONLINE   (POST /trend-report — per request)
  api
    └─ validate payload → resolve brand (registry)
    └─ scope.resolve(report_type, today)        report_type → concrete filter
    └─ store.select(looks in scope)
    └─ report_cache hit? ─► return
       else:
         aggregate.engine  tagged looks ─► trend docs                 [TALLY]
         compose.model      trend docs ─► report skeleton (numbers)
         compose.narrator   LLM fills prose only (grounded)           [WRITE]
         compose.render     report model ─► magazine HTML
         store.cache + return { model, html }
```

**Seams that keep it general** (each = one module, §16):

| Seam | Responsibility | Extension point |
|---|---|---|
| Source adapter | raw source → canonical Look | new source = new adapter |
| Canonical schema | one internal shape everything reads | brand/source are data, not code |
| Normalizers | free text → tags, per dimension | new focus area = new normalizer + vocab |
| Scope policy | report_type → concrete look filter | new report type = new policy |
| Aggregation | looks → ranked tallies + momentum | dimension-generic |
| Report composer / renderer | tallies → model → output | new output = new renderer |
| API | HTTP surface | add params without touching internals |

**Hard rule (grounding):** the LLM **never emits or alters a number**. All counts, shares, deltas, and evidence links are computed by `aggregate/` and stamped by `compose/model.py`. The narrator writes prose only, and a post-check validates that no number changed. See §11.2.

---

## 5. Data source (current) & the adapter contract

### 5.1 Raw Vogue format (as it exists today)
Per collection: one JSON file containing a **list of look objects**. Observed dataset (Prada):

| Collection file | Looks |
|---|---|
| `Fall_2024_Ready_to_Wear/…json` | 57 |
| `Spring_2025_Ready_to_Wear/…json` | 49 |
| `Fall_2025_Ready_to_Wear/…json` | 50 |
| `Spring_2026_Ready_to_Wear/…json` | 52 |
| `Fall_2026_Ready_to_Wear/…json` | 60 |
| **Total** | **268 looks, 742 detail images** |

Raw look keys: `source, designer, source_url, collection_name, summary, look_number, runway_img, image_description, fabric, Colors, theme, keywords, details_images[]`.

**Known raw-data facts the adapter must handle:**
- `designer` is always `"Unknown"` → derive brand from `source_url` (last path segment) via the brand registry.
- `Colors` is capitalized and is a **structured array**: `[{color_name, hex_code, pantone_code}]`. 100% of 855 color entries have a hex. avg 3.2 colors/look.
- `fabric` and `theme` are **free-text strings**, often multi-item (e.g. `"Cotton/wool twill (shirt + trouser), croc-embossed patent leather (bag)"`).
- `keywords` is a list mixing real attributes (`"floral print"`) and editorial vibe phrases (`"off-kilter freedom"`).
- `collection_name` casing is inconsistent (`"Spring-2026-ready-to-wear"`, `"fall-2024-ready-to-wear"`).
- `summary` is the collection-level editorial text, **repeated on every look** → dedupe to the Collection doc.
- `runway_img` / `details_images[].details_img_url` are Vogue **slideshow page URLs**, not image files.
- `details_images[]` items carry their own `description, fabric, Colors, theme, keywords`.

### 5.2 Adapter interface
```python
class SourceAdapter(Protocol):
    source_name: str
    def parse_collection(self, raw: list[dict], *, file_hint: str) -> tuple[Collection, list[Look]]:
        ...
```
- `adapters/vogue.py` implements it for the format above.
- `adapters/registry.py` maps `source_name → adapter`.
- A new source only implements this Protocol; nothing downstream changes.

---

## 6. Canonical data model (Pydantic v2)

All field names below are the canonical internal names. Adapters map INTO this; everything downstream reads ONLY this.

### 6.1 `Look`
```jsonc
{
  "look_id":       "prada:prada-spring-2026-rtw:1",   // f"{brand_slug}:{collection_id}:{look_number}"
  "brand":         "Prada",
  "brand_slug":    "prada",
  "source":        "vogue",
  "source_url":    "https://www.vogue.com/fashion-shows/spring-2026-ready-to-wear/prada",
  "collection_id": "prada-spring-2026-rtw",

  "season":       "Spring",      // enum: Spring | Fall | Resort | Pre-Fall | Couture | Menswear
  "year":          2026,         // int
  "category":     "RTW",         // normalized: ready-to-wear → RTW, couture → Couture, …
  "season_order":  20261,        // year*10 + season_rank(Spring=1, Fall=2, …); sorts all shows chronologically

  "look_number":  1,
  "images": {
    "runway":  { "url": "…/slideshow/collection#1", "kind": "page_link" },   // kind: page_link | image
    "details": [ { "url": "…/slideshow/details#1", "description": "…" } ]
  },

  "raw": {                                   // preserved verbatim; never overwritten
    "description":  "…",
    "fabric_text":  "…",
    "theme_text":   "…",
    "keywords":     ["…"],
    "colors":       [ { "name": "Deep navy blue", "hex": "#1E2A44", "pantone": "19-3922 (Navy Blazer)" } ],
    "detail_shots": [ { "url": "…", "description": "…", "fabric_text": "…", "theme_text": "…",
                        "keywords": ["…"], "colors": [ {"name":"…","hex":"…","pantone":"…"} ] } ]
  },

  "tags": {                                  // derived by normalizers (§7); re-derivable from raw
    "colors":      [ { "family":"navy", "name":"Deep navy blue", "hex":"#1E2A44", "pantone":"19-3922",
                       "role":"dominant", "from":"look", "confidence":1.0 } ],
    "fabrics":     [ { "value":"twill", "material":"cotton-wool", "garment":"suit", "treatment":null,
                       "evidence":"Cotton/wool twill (shirt + trouser)", "from":"look", "confidence":0.95 } ],
    "patterns":    [ { "value":"solid", "motif":null, "evidence":"monochrome", "from":"look", "confidence":0.8 } ],
    "silhouettes": [ { "value":"tailored-suit", "garment":"shirt+trouser", "fit":"sharp",
                       "evidence":"shirt-and-trouser suit", "from":"look", "confidence":0.9 } ],
    "themes":      [ { "value":"military", "evidence":"military-inspired", "from":"look", "confidence":0.95 } ],
    "details":     [ { "value":"top-handle-bag", "type":"bag", "evidence":"top handle lady bag",
                       "from":"look", "confidence":0.9 } ]
  },
  "vibe_phrases": ["off-kilter freedom"],    // kept for quotes/semantic; NEVER counted
  "embedding":    null,                       // optional (Phase 6)

  "meta": { "vocab_ver":"v1", "prompt_ver":"v1", "normalize_model":"gemini-2.5-flash", "normalized_at":"…" }
}
```

**Tag object invariants (every dimension):** `value` (a vocabulary ID or `__unmapped__`), `evidence` (a substring/phrase from `raw`), `from` (`look|detail`), `confidence` (0–1). Extra per-dimension fields (material, garment, role, etc.) are optional.

### 6.2 `Collection`
```jsonc
{
  "collection_id": "prada-spring-2026-rtw",
  "brand": "Prada", "brand_slug": "prada", "source": "vogue", "source_url": "…",
  "season": "Spring", "year": 2026, "category": "RTW", "season_order": 20261,
  "summary": "…",               // deduped, stored once
  "look_count": 52,
  "palette": [ {"hex":"#1E2A44","family":"navy","share":0.19,"pantone":"19-3922"} ],  // computed in Tally
  "ingested_at": "…"
}
```

### 6.3 Identity / registries
- **Brand registry** (`registries/brands.json`, versioned): `{ slug, canonical_name, aliases[], source_name_map }`. Resolves any source's brand spelling → one `brand_slug`. Adapter uses it.
- **Collection ID**: `f"{brand_slug}-{season_lower}-{year}-{category_lower}"`. Deterministic → same show from two sources dedupes.
- **`collection_name` parser**: split on `-` → `season = title(parts[0])`, `year = int(parts[1])`, `category = normalize(join(parts[2:]))`.

### 6.4 Images
`runway_img` / detail URLs are page links (`kind:"page_link"`). Renderer must degrade gracefully (styled placeholder plates with captions from `raw.description`). A future image-fetch job may populate real `image` URLs; the schema already distinguishes `kind`.

---

## 7. Normalization (Tidy)

Two normalizer types. Both run **offline**, write into `tags`, and are re-runnable from `raw`.

### 7.1 Color normalizer — deterministic, no LLM
Input: `raw.colors[]` (+ detail-shot colors). Algorithm per color:
1. Parse `hex` → CIELAB (coloraide).
2. Assign `family` = argmin ΔE2000 to the **anchor table** (§8.2). `name` breaks ties within a small ΔE margin.
3. Keep exact `hex`, `pantone`, original `name` for display.
4. `role`: first-listed color per look = `dominant`, rest = `accent` _(heuristic; refine later)_.
5. `from`: `look` or `detail`. `confidence`: 1.0 (deterministic) unless hex missing.

### 7.2 Attribute normalizer — LLM, vocabulary-constrained (fabric · pattern · silhouette · theme · details)
**One structured LLM call per look**, with the look's detail shots included as context (enables look-vs-detail dedup in one pass).

**Input to the model:** `raw.description, raw.fabric_text, raw.theme_text, raw.keywords`, detail-shot descriptions/fabric/keywords, and the **allowed vocabulary** for each dimension.

**Output:** Pydantic-validated structured object (`response_schema`) where each tag's `value` is an **enum of vocab IDs** for that dimension, plus `evidence`, `confidence`, and per-dimension fields. Includes `routed_to_vibe[]` and `unmapped[]`.

**Rules baked into the prompt (all mandatory):**
1. **Closed vocabulary** — pick an allowed term or `__unmapped__` (carry the raw phrase). Never free-type a label.
2. **Evidence-first** — every tag cites a phrase actually present in the input. Post-validation rejects tags whose `evidence` is not found in `raw`.
3. **IP guardrail** — do NOT tag brand logos / monograms / crests as patterns (e.g. "Prada crest" is not a reproducible motif). _(Carried over from the Fashionairre MVP trademark rule.)_
4. **Keyword routing** — each keyword → a dimension tag if attribute-like, else → `vibe_phrases`.
5. **No inference beyond text** — uncertain → lower confidence or `__unmapped__`.

**Config:** low temperature; `prompt_ver` + `vocab_ver` + `model_id` recorded on `Look.meta`.

### 7.3 Orchestration (`normalize/pipeline.py`)
```
raw ─► color.normalize (deterministic) ─┐
       attributes.normalize (LLM)   ────┼─► merge + dedup(look/detail) ─► validate(schema + evidence) ─► write tags
                                        ┘   (drop conf < 0.6 to review; log __unmapped__)
```
- **Dedup:** identical `(dimension, value)` across look + its details collapses to one tag; keep highest confidence; prefer `from:"look"`.
- **Caching / idempotency:** skip a look if `(hash(raw), vocab_ver, prompt_ver, model_id)` unchanged. Only new/changed looks call the LLM.
- **Cost:** ≤ 268 LLM calls for the full Prada backfill; incremental thereafter.

---

## 8. Vocabularies

### 8.1 Storage & structure
Versioned files in `registries/vocab/<dimension>.json`. Loaded at startup. Each term:
```jsonc
{ "id": "patent-leather", "label": "Patent leather", "aliases": ["patent","vinyl-look"], "parent": "leather" }
```
- **Versioned** (`vocab_ver`); a change triggers targeted re-normalization of affected dimensions.
- **`__unmapped__`** is a reserved value; unmapped raw phrases are written to `unmapped_log` (§13) for periodic promotion into the vocab.

### 8.2 Color families (anchor table for §7.1)
~18 families with representative anchor hexes (refine ΔE thresholds empirically):
`black #111111 · white #F5F5F2 · grey #808080 · navy #1F2A44 · blue #2A4B8D · teal #256D6A · green #2E7D32 · olive #6B6A3A · yellow #E6C229 · gold #C9A227 · orange #E1521A · red #B3202C · burgundy #6E1E2A · pink #E29AB0 · purple #5B2A83 · brown #6B4A2B · cream #E8E0CE · silver #C0C4C8`.

### 8.3 Starter vocab (extensible)
- **Fabric (~50):** twill, gabardine, wool-suiting, tweed, bouclé, satin, taffeta, chiffon, organza, tulle, lace, jersey-knit, velvet, leather, patent-leather, suede, denim, feather, sequin, …
- **Pattern (~12):** solid, floral, check-plaid, stripe, polka-dot, animal, geometric, painterly, embroidery, appliqué, lace-work, __unmapped__.
- **Silhouette (~30):** tailored-suit, oversized, sheath, a-line, slip, bra-top, suspender-skirt, bubble-skirt, dirndl, pencil-skirt, wide-trouser, bloomer, maxi-coat, cape, …
- **Theme/mood (~20):** military-utilitarian, romantic, minimalist, maximalist, sporty, lingerie-dishabille, bourgeois, folk, grunge, futuristic, …
- **Details (~20):** top-handle-bag, shoulder-bag, opera-gloves, drop-earrings, statement-jewelry, loafers, heeled-mules, boots, belt, …

---

## 9. Scope policies (report_type → concrete filter)

`scope/policies.py`. A policy takes `(brand_slug, today)` and returns a MongoDB filter + a human-readable `window` descriptor.

### 9.1 `overall` (this build's default)
- **Rule:** years in `[C-1, C]`, where `C = today.year` (dynamic; never hardcoded).
- **For Prada @ 2026:** `{2025, 2026}` → Spring/Fall 2025 + Spring/Fall 2026 = **211 looks** (2025: 99, 2026: 112). Fall 2024 excluded.
- **Fallback:** if the brand has no collections in `[C-1, C]`, use the most recent two years that DO have data, and report the actual window in the response (never silently). If only one collection exists, still render but flag momentum as low-confidence.

### 9.2 Future policies (design only)
`single_collection` (filter by `collection_id`), `all_time` (all years → signature), `season_over_season`, `compare` (Flow 3, two brands). All are just different filters over the same `looks`.

---

## 10. Aggregation (Tally)

`aggregate/engine.py`. Input: a set of tagged looks (scope) + a dimension list. Output: one aggregate doc per `(scope, dimension)`.

### 10.1 Counting base — presence-per-look
For dimension `D`, value `v`, scope `S` (set of looks), counting only tags with `confidence ≥ 0.6`:
```
looks_with(v) = |{ look ∈ S : v ∈ distinct D-values(look) }|
share(v)      = looks_with(v) / |S|
```
Distinct-per-look makes detail-shot dedup automatic. `share` is the headline metric.

### 10.2 Dominance
Rank values by `share` desc within `S`.

### 10.3 Signature (prevalent AND recurring, across the k collections in scope)
```
breadth(v)         = |{ collections in S where share_collection(v) ≥ floor }| / k
signature_score(v) = mean_over_collections(share) × breadth(v)
```

### 10.4 Momentum (year-over-year within the window)
```
share_year(v, Y) = looks_with(v) in year Y / |looks in year Y|
yoy_delta(v)     = share_year(v, C) − share_year(v, C-1)
class(v)         = emerging | rising | steady | fading | dropped   (by yoy_delta vs floors)
```
**Like-season robustness check** (controls for the Spring vs Fall content difference):
```
Δspring = share(v, Spring C) − share(v, Spring C-1)
Δfall   = share(v, Fall C)   − share(v, Fall C-1)
```
If the like-season deltas disagree in sign with `yoy_delta`, down-rank the claim (mark `momentum.trustworthy=false`). Store both.

### 10.5 Color palette (color dimension only)
KMeans (k≈6) over the scope's LAB hex values → dominant palette with per-cluster `share`, nearest `family`, representative `hex`/`pantone`. Also store palette-centroid shift `C-1 → C`.

### 10.6 Honesty floors (mandatory)
- Do not rank a value with `looks_with(v) < 3`.
- Only assign `rising/fading` when `|yoy_delta| ≥ 0.05` (≈5 pts) — else `steady`.
- If a section is truncated to top-N, record `omitted_count`.

### 10.7 Aggregate output doc
```jsonc
{
  "scope": { "brand":"prada", "kind":"overall", "window": { "years":[2025,2026] } },
  "dimension": "color",
  "base": { "total_looks":211, "by_year": { "2025":99, "2026":112 } },
  "ranked": [
    { "value":"navy", "share":0.30, "looks":34, "signature_score":0.27,
      "momentum": { "yoy_delta":0.08, "class":"rising", "trustworthy":true,
                    "like_season": { "spring":0.06, "fall":0.10 } },
      "evidence": [ { "collection":"prada-fall-2026-rtw", "look":3, "hex":"#1E2A44" } ] }
  ],
  "palette": [ { "hex":"#1E2A44", "family":"navy", "share":0.19, "pantone":"19-3922" } ],  // color only
  "omitted_count": 0,
  "generated": { "vocab_ver":"v1", "data_ver":"…", "agg_ver":"v1" }
}
```

---

## 11. Composition (Write)

### 11.1 Report model (the endpoint's structured response; also what the renderer consumes)
```jsonc
{
  "brand": "Prada",
  "report_type": "overall",
  "window": { "years":[2025,2026], "collections":4, "looks":211 },
  "headline": "…",        // narrator
  "standfirst": "…",      // narrator
  "at_a_glance": ["…"],   // narrator, from top tags
  "sections": [
    { "dimension": "color",
      "coined_name": "…",              // narrator
      "narrative": "…",                // narrator
      "designer_cue": "…",             // narrator
      "ranked":   [ … ],               // composer (from aggregate)
      "momentum": [ … ],               // composer
      "palette":  [ … ],               // composer (color only)
      "evidence": [ … ] }              // composer
  ],
  "pull_quote": { "text":"…", "attribution":"…" },   // narrator, sourced from Collection.summary
  "provenance": { "sources":["vogue"], "generated_for_year":2026,
                  "data_ver":"…", "vocab_ver":"…", "prompt_ver":"…", "generated_at":"…" }
}
```

### 11.2 Composer vs narrator split (the grounding contract)
- `compose/model.py` builds the skeleton and fills **all numeric/evidence fields** from aggregates. Deterministic.
- `compose/narrator.py` (LLM) fills **only** `headline, standfirst, at_a_glance, coined_name, narrative, designer_cue, pull_quote`. It receives the numbers as read-only context and is instructed to reference only those.
- **Validation:** after narration, assert every numeric/evidence field is byte-identical to the composer's skeleton. Any drift → reject narration, retry once, else ship the skeleton with template prose. `pull_quote.text` must be a verbatim substring of `Collection.summary`.
- **Cache** the narration by the full cache key (§13.3).

### 11.3 Rendering
`compose/render.py` maps the report model → the **magazine HTML** (existing template: masthead, hero headline + standfirst, at-a-glance pills, per-dimension sections with color chips / fabric bars / tag lists, pull quote, "The Looks" placeholder gallery, provenance footer). Design language: concrete-grey ground + single orange accent, Helvetica display vs serif body, sharp corners; light/dark themes. The renderer is one of potentially many outputs — keep the model output-agnostic.

---

## 12. API

### 12.1 `POST /api/v1/trend-report`
Request:
```jsonc
{ "brand": "Prada", "report_type": "overall", "source": null, "window": null }
```
- `brand` (required). `report_type` default `"overall"`. `source` optional filter. `window` optional override of the policy.

Response `200`: `{ "model": <ReportModel §11.1>, "html": "<string>" }`.

Errors: `404` unknown brand (with suggestions); `422` invalid payload / empty result after filters; `200` with `window` annotated when a fallback window was used.

Behavior: validate → resolve brand → resolve scope → select looks → **cache check** → (aggregate → compose → narrate → render) → cache → return. Synchronous for v1; first cold narration is a few seconds, then cached. Offline job **pre-warms** the overall report per brand so first user request is a cache hit.

### 12.2 `GET /api/v1/brands`
Returns available brands `[{ slug, name, collections, latest_year }]` so a UI can populate the selector.

---

## 13. Storage (MongoDB)

### 13.1 Collections
| Collection | Doc | Key indexes |
|---|---|---|
| `looks` | canonical tagged Look | `look_id` (unique), `brand_slug`, `year`, `collection_id`, `(brand_slug, year)` |
| `collections` | Collection | `collection_id` (unique), `brand_slug` |
| `report_cache` | `{ cache_key, model, html, created_at }` | `cache_key` (unique), `(brand_slug, report_type)` |
| `unmapped_log` | `{ dimension, raw_phrase, count, first_seen }` | `(dimension, raw_phrase)` |
| `brand_state` | `{ brand_slug, data_version, updated_at }` | `brand_slug` (unique) |

Registries and vocab live as **versioned files in the repo** (`registries/`), loaded at startup (optionally mirrored to DB).

### 13.2 `data_version`
Per brand, bumped by the offline pipeline whenever that brand's looks/tags change. Invalidates caches transparently.

### 13.3 Cache key
`cache_key = sha256(report_type, canonical(scope_filter), data_version[brand], vocab_ver, agg_ver, prompt_ver, model_id, render_ver)`. Bumping any version regenerates only what it affects.

---

## 14. Non-functional requirements
- **Grounding:** §4 hard rule + §11.2 validation. Non-negotiable.
- **Reproducibility:** low LLM temperature; all outputs stamped with `data/vocab/prompt/agg/render` versions + `model_id`.
- **Provenance:** every report traces each number to source looks (`evidence`).
- **Honesty:** §10.6 floors; fallbacks annotated, never silent.
- **IP:** never tag or render brand logos/monograms/crests as reproducible motifs.
- **Performance:** request path is filter + tally + cached narration; pre-warm the flagship report.
- **Observability:** structured logs per pipeline stage; counts of tagged/unmapped/low-confidence per collection.

---

## 15. Configuration & thresholds (defaults)
`CONFIDENCE_MIN = 0.6` · `SIGNATURE_BREADTH_FLOOR = 0.10` (collection share to count toward breadth) · `MOMENTUM_MIN = 0.05` · `MIN_LOOKS_TO_RANK = 3` · `PALETTE_K = 6` · `NORMALIZE_MODEL = gemini-2.5-flash` · `NARRATE_MODEL = gemini-2.5-pro`. All overridable via env/config.

---

## 16. Repository layout
```
trend_engine/
  adapters/         base.py · vogue.py · registry.py
  schema/           look.py · collection.py · tags.py · report.py         # Pydantic v2 models
  registries/       brands.json · vocab/{colors,fabrics,patterns,silhouettes,themes,details}.json
  normalize/        color.py · attributes.py · pipeline.py
  scope/            policies.py
  aggregate/        engine.py
  compose/          model.py · narrator.py · render.py · templates/report.html
  store/            repo.py                                               # Motor (API) / PyMongo (jobs)
  api/              app.py                                                # FastAPI
  jobs/             ingest.py                                             # offline batch (Clean+Tidy) + pre-warm
  config.py
tests/              fixtures use the real Prada JSON
.env.example
DESIGN.md
```

---

## 17. Build plan (phased, with acceptance criteria)

**Phase 1 — Frame (Clean).** Adapter + canonical schema + ingest + store.
_Done when:_ ingesting the 5 Prada JSONs yields 268 `looks` + 5 `collections` with parsed `season/year/category`, `brand="Prada"`, deduped `summary`, `raw` intact; `scope.resolve("overall")` returns 211 looks for Prada (excludes Fall 2024).

**Phase 2 — Tidy (Normalize).** color.py + attributes.py + pipeline + vocab files.
_Done when:_ every look has `tags` for all 6 dimensions with `confidence` + `evidence`; evidence-phrase validation passes; `__unmapped__` logged; re-run is cached/idempotent; a 10-look manual spot-check matches the source.

**Phase 3 — Tally (Aggregate).** engine.py.
_Done when:_ for scope `overall/Prada`, aggregate docs per dimension carry correct `share`/`looks` (hand-verifiable on one dimension), `signature_score`, `momentum` (+ like-season), color `palette`, and honesty floors applied.

**Phase 4 — Write (Compose + Render).** model.py + narrator.py + render.py.
_Done when:_ a report model + magazine HTML are produced for Prada overall; every number in the HTML matches the aggregates exactly; the grounding validation (§11.2) passes; `pull_quote` is verbatim from `summary`.

**Phase 5 — Expose (API + cache).** app.py + caching + pre-warm.
_Done when:_ `POST /trend-report {brand:"Prada"}` returns `{model, html}`; a second call is served from `report_cache`; bumping `data_version` regenerates; unknown brand → 404; `GET /brands` lists Prada.

**Phase 6 — (deferred).** Embeddings, emergent-trend clustering, semantic queries; image fetching; Flows 1/3/4.

---

## 18. Open assumptions to confirm
- LLM provider stays Gemini (swappable interface regardless).
- `role: dominant = first-listed color` heuristic is acceptable until we have area data.
- Season rank map covers only Spring/Fall RTW today; extend for Couture/Resort when such data arrives.
- Report response returns both `model` and rendered `html`; a UI may consume the model alone.

---

## Appendix A — Worked example (real data)
**Prada Spring 2026, Look 1** — raw → canonical tags → its contribution to the overall aggregate:
- raw.description: `"Sharp, monochrome military-inspired shirt-and-trouser suit with a croc-embossed top-handle bag"`
- raw.fabric_text: `"Cotton/wool twill (shirt + trouser), croc-embossed patent leather (bag)"`
- raw.colors: `[{name:"Deep navy blue", hex:"#1E2A44", pantone:"19-3922 (Navy Blazer)"}]`
- → tags.colors: `navy(dominant, #1E2A44)` · tags.fabrics: `twill(suit)`, `patent-leather(bag, croc-embossed)` · tags.patterns: `solid` · tags.silhouettes: `tailored-suit(sharp)` · tags.themes: `military`, `utilitarian` · tags.details: `top-handle-bag`
- → contributes +1 look to `navy`, `twill`, `patent-leather`, `solid`, `tailored-suit`, `military`, `utilitarian`, `top-handle-bag` presence counts in the `overall/Prada` scope, in year 2026.
