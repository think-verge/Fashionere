# Design Document: Vogue Scraper & Data Mapping Engine

## 1. Project Overview
A Python pipeline that extracts fashion collections from Vogue.com and turns them into
annotated, MongoDB-ready documents. Its hard problem is the **Mapping Problem**:
linking a designer's full-body runway looks to their corresponding close-up detail
images. Vogue does not publish that link, so the pipeline reconstructs it.

The pipeline is built in **layers**. Each layer reads the previous layer's JSON and adds
one thing, so any layer can be re-run without repeating the ones before it.

```
Layer 0  run_pipeline.py    read URL list, skip done  -> state/manifest.json + logs
Layer 1  scraper.py         URLs + <img> tags         -> {designer}_{collection}_raw.json
Layer 2  match_details.py   detail -> look mapping    -> {designer}_{collection}_mapped.json
Layer 3  tag_images.py      description/colour/       -> {designer}_{collection}_tagged.json
                            pattern/theme/keywords
Layer 4  flatten.py         one Mongo doc per look    -> {designer}_{collection}_flattened.json
Layer 5  ingest (next)      upsert on look_id         -> MongoDB Atlas
```

Layer 0 is the orchestrator: it is what a human or GitHub Actions actually runs, and it
executes layers 1–4 in sequence. Each of those stays a single-collection tool that can
also be run by hand.

### Repository layout

The engine is self-contained in `scrape_engine/`; the FastAPI + LangGraph query app
stays at the repository root and shares nothing but the venv.

```
scrape_engine/
  scraper.py  match_details.py                    the layers
  tag_images.py  flatten.py
  run_pipeline.py                                 the orchestrator
  design.md                                       this document
  collections.json                                <- the only file you edit
  requirements.txt                                engine deps only
  .env                                            GEMINI_API_KEY (git-ignored)

  data/raw/<designer>/     Prada_fall_2025_ready_to_wear_raw.json
  data/mapped/<designer>/  Prada_fall_2025_ready_to_wear_mapped.json
  data/tagged/<designer>/  Prada_fall_2025_ready_to_wear_tagged.json
  data/flattened/<designer>/ Prada_fall_2025_ready_to_wear_flattened.json
  data/quarantine/         suspect scrapes, never overwrite a good file

  state/manifest.json      summary block + per-collection ledger
  state/runs/run_<ts>.json          every collection in that run
  state/runs/<designer>/run_<ts>.json  just that designer's slice
  logs/run_<ts>_IST.log             full log, all designers
  logs/<designer>/run_<ts>_IST.log  just that designer's lines

.github/workflows/scrape.yml                      must live at the repo root
main.py  graph.py  schemas.py  mongo_query.py     the query app
```

Everything for one designer is reachable under that designer's name in `data/raw`,
`data/mapped`, `data/tagged`, `data/flattened`, `state/runs` and `logs`. The un-nested `state/runs/run_*.json`
and `logs/run_*.log` remain the authoritative record of a run, since one run spans many
designers; the per-designer copies are convenience slices of it.

Times are IST throughout — filenames, log lines and manifest timestamps — so a run reads
the same locally and in CI (which runs in UTC). See `DISPLAY_TZ` in `run_pipeline.py`.

Every path the engine reads or writes is resolved relative to `run_pipeline.py`, so it
behaves identically whether launched from inside `scrape_engine/`, from the repo root,
or by CI. Manifest paths are stored **relative to the engine folder with forward
slashes** — absolute paths would break on a fresh CI checkout and backslashes would
break on Linux, and in both cases the failure mode is silent re-scraping and duplicate
API spend rather than a visible error.

Current status: **Layers 0–4 are implemented.** Layer 2 is benchmarked at 98.3% against
an independent hand-made mapping (§5.1); Layer 3 has run clean over 355 images across two
collections; Layer 4 is verified on Prada Fall 2025 (§7). Layer 5 (ingest) is next — the
prototypes `flatten_raw_data.py` / `ingest_to_mongo.py` at the repo root predate this
schema and are superseded by `flatten.py`.

## 2. Tech Stack
* **Language:** Python 3.10+
* **Scraping:** `playwright` (async) — required; Vogue renders via JavaScript.
* **Parsing:** `beautifulsoup4` + `lxml`, `json`, `re`
* **Vision:** `google-genai` (Gemini) for detail matching (Layer 2) and tagging (Layer 3)
* **CLI:** `argparse`
* **Store:** MongoDB Atlas via `pymongo`

## 3. Findings That Drive The Design

These were established empirically against the live site and override the original
assumptions in this document.

**Vogue is not Next.js.** There is no `<script id="__NEXT_DATA__">`. The site runs
Condé Nast's Verso platform and exposes state at `window.__PRELOADED_STATE__`, with the
galleries at `transformed.runwayShowGalleries`. The scraper probes `__NEXT_DATA__`,
`__PRELOADED_STATE__`, `__APOLLO_STATE__` and `__INITIAL_STATE__` in that order, so a
future rename degrades gracefully.

**Vogue publishes no look→detail link.** The galleries are three independent flat
sequences — for Valentino Fall 2025: 81 collection, 99 detail, 15 backstage. Critically:

* The `lookNumber` field on a *detail* item is that detail's own running counter, not its
  parent look. It reaches `'99'` in a show with only 81 looks.
* Detail filenames (`00001…00099-…-detail-…jpg`) are their own sequence.
* No `parent` / `related` / `group` key exists anywhere in the state tree.
* Image files carry no IPTC/XMP metadata — Condé Nast strips it on delivery.

Therefore **URL, filename and array-position matching are all forbidden.** They look
plausible and are wrong: detail #98 belongs to look 79, and look 98 does not exist.

**Two properties make the mapping recoverable** (Layer 2):

1. **Order** — photographers shoot details in show order, so the sequence of parent look
   numbers is monotonically non-decreasing. Each detail is confined to a narrow window
   around its positional prior.
2. **Identity** — a close-up shares exact colour, fabric, trim, hosiery, shoes, bag,
   jewellery, hair and makeup with its parent look, which a vision model can verify.

## 4. Layer 1 — Scrape (`scraper.py`)

### Input
```
python scraper.py --url "https://www.vogue.com/fashion-shows/fall-2025-ready-to-wear/valentino"
```
Slideshow URLs and fragments are normalised down to the show page.

### Strategy 1 — Embedded state (primary)
1. Load the collection URL with Playwright.
2. Read the state object from the page globals (or a `<script id=…>` tag offline).
3. Locate the galleries, handling both the `{galleries:[{id,items}]}` and
   `{galleryItems:{collection,detail,beauty}}` shapes, plus a generic fallback scan.
4. Classify each gallery as collection / detail / backstage; ignore backstage.
5. Per item, take the look number, the slideshow URL (`…/slideshow/collection#1`), the
   CDN asset URL and the alt text. Group any genuinely nested details under their look.

### Strategy 2 — DOM traversal (fallback)
Used when no state object is available. Drives the `/slideshow/collection` and
`/slideshow/details` pages, scrolling until the image count stabilises (the show page
renders only a six-image teaser), then reads images in document order with a running
`current_look_number` counter — details attach to the look that most recently preceded
them. Both strategies have been verified to produce byte-identical output.

### `<img>` tag capture
The state object holds no HTML, so tags come from the rendered DOM. The scraper visits
each slideshow page, scrolls to load every image, and captures `outerHTML`. Tags are
joined onto the state-derived records by **Condé Nast photo ID** (the `/photos/{id}/`
path segment), which appears in both sources — never by array position.

Verified coverage: 81/81 look tags, 99/99 detail tags.

> Note: the captured tag reflects lazy-loading state at capture time. Eagerly loaded
> images carry a `w_2560` src; lazy ones may only carry a `w_360` src with a 320w srcset.
> Tags are archival markup, **not** a reliable image source — always use the
> `*_asset` field for anything that fetches pixels.

### Output — `{designer}_{collection_name}_raw.json`
```json
{
  "source": "vogue",
  "designer": "Valentino",
  "source_url": "https://www.vogue.com/fashion-shows/fall-2025-ready-to-wear/valentino",
  "collection_name": "fall-2025-ready-to-wear",
  "summary": "Extracted review text…",
  "looks": [
    {
      "look_number": 1,
      "runway_img": "https://www.vogue.com/fashion-shows/fall-2025-ready-to-wear/valentino/slideshow/collection#1",
      "runway_img_asset": "https://assets.vogue.com/photos/…/master/pass/00001-valentino-….jpg",
      "runway_img_alt": "Image may contain Fashion Adult Person…",
      "runway_img_1_tag": "<img alt=\"…\" class=\"…\" src=\"…\">",
      "details_images": []
    }
  ],
  "details_gallery": [
    {
      "detail_index": 1,
      "details_img_url": "https://www.vogue.com/fashion-shows/fall-2025-ready-to-wear/valentino/slideshow/details#1",
      "details_img_asset": "https://assets.vogue.com/photos/…/master/pass/00001-valentino-…-detail-….jpg",
      "details_img_alt": "Image may contain…",
      "details_img_1_tag": "<img alt=\"…\" class=\"…\" src=\"…\">"
    }
  ],
  "mapping": { "strategy": "embedded-state", "looks_found": 81, "details_found": 99 }
}
```

The tag key is dynamic and carries its own index: `runway_img_{look_number}_tag` and
`details_img_{detail_index}_tag`.

`details_images` is empty at this layer by design — Layer 1 never guesses the mapping.

## 5. Layer 2 — Map details to looks (`match_details.py`)

```
python match_details.py --raw Valentino_fall_2025_ready_to_wear_raw.json
```

1. **Positional prior** — detail *j* of *m* is centred on look `j × n/m`; candidates are
   the looks within `±window` (default 6). Narrows 81 candidates to ~13.
2. **Vision ranking** — the detail image and its candidate looks are sent to Gemini in
   one call. It judges garment identity only and returns a best look, confidence,
   evidence and ranked alternates. The identical runway set is explicitly ignored.
3. **Monotonic alignment** — a dynamic program over (detail, last-assigned-look) picks
   the highest-confidence assignment whose look numbers never run backwards. A detail may
   be skipped at zero cost, so one that matches nothing does not distort its neighbours.
4. **Gap-fill** — details the first pass declined are re-asked as a forced choice
   restricted to the interval their confident neighbours leave open, weighing garments
   above accessories.

Each matched detail object is moved into its parent look's `details_images` array. Output
is `{designer}_{collection}_mapped.json`, adding a `detail_matches` array carrying
per-detail `look_number`, `confidence`, `evidence` and which pass resolved it.

Measured on Valentino Fall 2025: **99/99 details attached, 80/81 looks covered**, the
assignment sequence perfectly monotonic, 95 of 99 at confidence 1.0. Look 81 (the
designer's bow) genuinely has no detail shot. Gemini responses are cached to
`.match_cache_*.json`, so re-runs and tuning are free.

Cost: **~$0.0027 per detail** (~3,790 input + ~619 output tokens/call on
`gemini-2.5-flash`), i.e. ~$0.32 per 120-detail collection, ~$32 per 100 collections.

### 5.1 Benchmark — Prada Fall 2025 Ready-to-Wear

Scored against an independent hand-made mapping of the same show (117 details, 52 looks).
Every case where the two disagreed was then adjudicated by inspecting the photographs.

| | matcher | hand-made mapping |
|---|---|---|
| Details correctly assigned | **115 / 117 (98.3%)** | 113 / 117 (96.6%) |
| Looks covered | **52 / 52** | 50 / 52 |
| Raw agreement between the two | 111 / 114 comparable (97.4%) | — |

Adjudicated disputes: the matcher was right on details 12, 13, 34 and 49; the hand-made
mapping was right on 54 and 69. The hand-made file also **omitted Vogue looks 8 and 9
entirely and renumbered the rest**, so from its "look 8" onward every `look_number` is
off by two — a reminder that the tag index (which equals the asset number) is the
reliable identifier, not a sequential counter.

**Known weakness — accessory-only close-ups.** All four remaining errors and every
disputed case were frames showing *only* a shoe, with no garment, hem, hosiery or bag
in view. Prada styled this show with near-identical pointed pumps across many looks, so
such a frame carries almost no discriminating signal — yet the model still returns
0.95–0.98 confidence, which lets a weak visual guess outweigh the strong show-order
prior during alignment. Detail 34 shows it plainly: vision picked look 14, alignment
moved it to 18, the hand-made file said 19; only a bow ornament on the toe box
distinguished them at high magnification.

Planned mitigations, in priority order:
1. Have the model report `visible_scope` (`garment` / `shoe_only` / `bag_only`) and
   damp confidence when the frame contains no garment, so the positional prior decides
   where pixels cannot.
2. Raise `--image-width` for narrow-scope frames. Detail 69 was declined purely because
   at the default width the candidate's pink pump read as a bare foot; at 2400px the
   match was obvious.

## 6. Layer 3 — Tag images (`tag_images.py`)

```
python tag_images.py --mapped data/tagged/prada/Prada_fall_2025_ready_to_wear_mapped.json
```

Runs a vision pass over **every runway look and every detail image** — 169 images for
Prada Fall 2025 — and attaches searchable attributes to each. The output feeds keyword
search now and vector embeddings later, so descriptions are written to be *retrievable*,
not merely accurate: concrete nouns, garment and construction vocabulary, no filler.

### 6.1 Per-image schema

Identical on a runway look and on a detail image — one shape to query, one shape to embed.

```json
{
  "image_description": "Oversized black herringbone cocoon coat-dress with a raw round neckline, hidden button placket and dropped-waist seaming, carried with an ivory leather shoulder bag and tortoiseshell pointed pumps",
  "fabric": "Herringbone wool-blend coat-dress, smooth leather bag, tortoiseshell-effect leather pumps",
  "patterns": ["herringbone"],
  "Colors": [
    { "color_name": "Black", "hex_code": "#1C1C1C", "pantone_code": "19-4005 (Stretch Limo)" },
    { "color_name": "Cream", "hex_code": "#F5F5DC", "pantone_code": "12-0713 (Almond Oil)" }
  ],
  "theme": "Oversized minimalist tailoring softened by vintage-inspired accessories",
  "keywords": ["cocoon coat", "dropped waist", "hidden placket", "raw neckline",
               "pointed pump", "shoulder bag"],
  "collection_keywords": ["rescaling", "shapeless", "non-sexy", "interrogating femininity",
                          "ugly is exciting", "coarse materials"]
}
```

Four decisions, settled before implementation:

**`image_description` is the key everywhere** — on looks and on details alike. Earlier
drafts used `description` and `image description`; a space in a key forces bracket
notation in every MongoDB query, so it is not carried forward.

**Keywords are split.** `keywords` holds what is visibly in *this* image (garment types,
construction, silhouette, accessories). `collection_keywords` holds the themes drawn
from the collection `summary` and is broadly shared across the show. Merging them, as
the original example did, lets a handful of review phrases dominate every record and
swamp the image-specific terms that make search useful.

**`patterns`** is a new array covering surface pattern and print motif: `dots`, `stripe`,
`check`, `houndstooth`, `herringbone`, `plaid`, `floral`, `paisley`, `animal print`,
`geometric`, `abstract`, `camouflage`, `colour-block`, `logo/monogram`, `tie-dye`,
`gingham`, `chevron`. When a garment carries no pattern the value is `["solid"]` — an
explicit token, so "show me solid black coats" is a query rather than an absence.
Embellishment and technique (lace, sequins, embroidery) stay in `fabric` and surface
again in `keywords`.

**Pantone is derived, never asked for.** See §6.2.

### 6.2 Colour

The vision model reports `color_name`, `hex_code` and `pantone_code` directly, with the
Pantone value pinned to the Fashion/Home+Interiors (TCX) system in the format
`19-4005 (Stretch Limo)`. No local reference table is used — a deliberate decision to
keep the pipeline dependency-free.

**Accuracy caveat, recorded so it is not rediscovered later.** Pantone code↔name
pairings from the model are unreliable. Measured examples:

| model output | actual TCX name |
|---|---|
| `19-4005 (Jet Black)` | 19-4005 is **Stretch Limo**; Jet Black is 19-0303 |
| `11-0907 (Marshmallow)` | 11-0907 is **Pearled Ivory** |
| `12-0713 (Egret)` | 12-0713 is **Almond Oil** |

The pattern is consistent: the *code* lands in roughly the right colour region, the
*name* is invented. Treat `pantone_code` as an approximate colour-family hint, not a
specification — do not send it to a mill. `color_name` and `hex_code` are dependable.

If exact Pantone is needed later it can be derived from the stored `hex_code` by nearest
match against a TCX table, without re-running the vision pass.

**Runway lighting distorts colour.** The Valentino Fall 2025 set was bathed in red light,
so pixel-sampling that show returns red-shifted values for every garment. Colour is
therefore read by the vision model, which compensates for illuminant, rather than by
k-means over the JPEG, and the prompt explicitly asks for the colour the garment *is*
rather than the literal pixel value. Expect a good perceptual estimate of the garment,
not a colorimetric measurement of the fabric.

### 6.3 Prompting

One JSON schema, two prompts.

* **Look prompt** — describe the outfit as a whole: silhouette, layering, construction,
  fabric, accessories, footwear, styling.
* **Detail prompt** — describe only the element in shot, and name it in relation to the
  garment it belongs to. The **parent look image is sent alongside the close-up**, so a
  shoe close-up yields "the tortoiseshell pointed pump from the black cocoon coat look"
  rather than a context-free "a brown pump". §5.1 showed how little standalone signal an
  accessory close-up carries; the same limitation applies to describing it.

Both prompts receive the collection `summary` so `collection_keywords` echo the review's
actual vocabulary rather than generic fashion words. Both are told the runway set and
lighting are shared across the show and must never be described.

### 6.4 Cost

Measured token rates from §5 applied to this call shape:

| call | images | ~input | ~output | cost |
|---|---|---|---|---|
| look | 1 | ~1,360 | ~700 | $0.0022 |
| detail | 2 (detail + parent) | ~1,620 | ~700 | $0.0023 |

Prada Fall 2025 (52 looks + 117 details) ≈ **$0.37**. Combined with matching, a full
collection costs roughly **$0.70** end to end, or ~$70 per 100 collections.

### 6.5 Pipeline integration

Layer 0 gains a `tag` stage in the manifest, skipped on the same terms as the others:

```json
"tag": {
  "status": "ok", "at": "2026-08-02T21:47:31+05:30",
  "model": "gemini-2.5-flash", "prompt_version": 2,
  "source_fingerprint": "sha256:0255…", "built_on_match_at": "2026-08-02T20:15:41+05:30",
  "images_tagged": 169, "images_failed": 0, "est_cost_usd": 0.3887,
  "output": "data/tagged/prada/Prada_fall_2025_ready_to_wear_tagged.json"
}
```

Re-tagging is triggered by a changed scrape fingerprint, a different model, a bumped
`prompt_version`, or a re-run of the match stage (tracked by `built_on_match_at`, because
re-mapping changes which parent look each detail is described against).

**The cache stores raw model output, and all post-processing runs after retrieval.** So
tightening `normalise()` — hex validation, keyword length limits, key ordering — re-cleans
an entire collection in about a second at no cost. Only a prompt or model change costs
money.

`--only tag`, `--force tag` and `--max-cost` all work as for the other stages.

### 6.6 Key order in the written JSON

`dict.update()` appends, which would leave a look's own description sitting *after* its
`details_images` array. `reorder_record()` rewrites every record so the annotation sits
with the image it describes and the nested details come last:

```
look_number, runway_img, runway_img_asset, runway_img_alt, runway_img_{N}_tag,
image_description, fabric, patterns, Colors, theme, keywords, collection_keywords,
details_images
```

Detail records follow the same shape. Any unanticipated key keeps its relative position
at the end rather than being dropped. This is done in the tagging layer, not the scraper,
so the raw and mapped files are not polluted with empty placeholder fields.

## 7. Layer 4 — Flatten (`flatten.py`)

```
python flatten.py --tagged data/tagged/prada/Prada_fall_2025_ready_to_wear_tagged.json
```

The tagged file is one envelope: collection metadata at the head, then an array of looks.
Mongo wants the inverse — **one self-describing document per look**, so a query can
return a look without needing its parent envelope. Flattening copies the five
collection-level fields (`source`, `designer`, `source_url`, `collection_name`,
`summary`) onto every record.

Pure transformation: no network, no API calls, **no cost**, ~1 second per collection.

Document key order, as written:

```
source, designer, source_url, collection_name, summary,     <- repeated on every doc
look_number, runway_img, runway_img_asset, runway_img_alt,
runway_img_{N}_tag,
image_description, fabric, patterns, Colors, theme,
keywords, collection_keywords,
details_images[],                                            <- nested, each with the same
look_id                                                         annotation fields
```

Three things beyond a plain copy:

**`look_id`** — a deterministic identity, e.g. `vogue:prada:fall-2025-ready-to-wear:look:1`.
The existing `ingest_to_mongo.py` uses `insert_many`, which duplicates every document on
a second ingest. With a stable id the ingest can `upsert` on `look_id` instead, so
re-ingesting a collection updates rather than doubles it. Additive — ignore it and
nothing changes.

**Unmatched details are kept, not dropped.** Flattening is per-look, so a detail that
matched no look would silently vanish. Instead it becomes its own document with
`look_number: null` and `is_unmatched_detail: true`, carrying the detail in
`details_images`. Prada Fall 2025 has exactly one. `--skip-unmatched` omits them.

**Envelope bookkeeping is stripped.** `mapping`, `detail_matches` and `tagging` describe
the pipeline, not the garments, so they stay out of Mongo. Verified: no envelope keys
leak into any document.

`--jsonl` writes newline-delimited JSON instead of an array, for `mongoimport`.

> **Verified on Prada Fall 2025:** 53 documents (52 looks + 1 unmatched detail), all 116
> nested details preserved, every document carrying all five collection fields, 53 unique
> `look_id`s, no envelope leakage.

### 7.1 Ingest (next)

Flattens the nested envelope into **one MongoDB document per look**, repeating the
collection-level fields on each so records are self-describing.

```json
{
  "source": "vogue",
  "designer": "prada",
  "source_url": "https://www.vogue.com/fashion-shows/fall-2025-ready-to-wear/prada",
  "collection_name": "fall-2025-ready-to-wear",
  "summary": "After the Prada show…",
  "look_number": 1,
  "runway_img": "https://www.vogue.com/fashion-shows/fall-2025-ready-to-wear/prada/slideshow/collection#1",
  "runway_img_1_tag": "<img …>",
  "image_description": "Oversized black herringbone cocoon coat-dress…",
  "fabric": "Wool-blend coat-dress, smooth leather bag…",
  "patterns": ["herringbone"],
  "Colors": [
    { "color_name": "Black", "hex_code": "#1C1C1C", "pantone_code": "19-4005 (Stretch Limo)" }
  ],
  "theme": "Oversized minimalist tailoring…",
  "keywords": ["cocoon coat", "dropped waist", "hidden placket", "pointed pump"],
  "collection_keywords": ["rescaling", "shapeless", "non-sexy", "ugly is exciting"],
  "details_images": [
    {
      "details_img_url": "https://www.vogue.com/fashion-shows/fall-2025-ready-to-wear/prada/slideshow/details#1",
      "details_img_1_tag": "<img …>",
      "image_description": "Front-facing close-up of the oversized black herringbone coat-dress…",
      "fabric": "Herringbone wool-blend, fabric-covered buttons…",
      "patterns": ["herringbone"],
      "Colors": [
        { "color_name": "Black", "hex_code": "#1C1C1C", "pantone_code": "19-4005 (Stretch Limo)" }
      ],
      "theme": "Raw-edge tailoring with sculptural button detailing",
      "keywords": ["raw hem", "exposed seam", "fabric-covered button"],
      "collection_keywords": ["rescaling", "ugly is exciting", "femininity discontents"]
    }
  ]
}
```

> **Migration notes.** Two breaking changes against the documents currently in Atlas,
> both of which must be handled in the same change as the first ingest:
>
> 1. `page_url` → `source_url`. The query layer reads `page_url` in `graph.py`
>    (`COLLECTION_LEVEL_FIELDS`, the collection grouping key, `FIELD_LABELS`,
>    `CollectionRef`) and `schemas.py` (`page_urls`). Left unchanged, the analysis
>    endpoints silently return empty collection references.
> 2. `Colors` is now an **array of objects**, where the old flattened documents carried
>    a scalar `colors` string plus a separate `hex_code`. `graph.py` treats both as flat
>    values in `_DETAILS_ECHO_FIELDS` and in the prompt builder, so it will render
>    objects as raw dicts into the Gemini context until updated. Decide at ingest time
>    whether to also emit a derived flat `colors` string for backwards compatibility, or
>    to update the query layer to read the structured form.

## 8. Layer 0 — Batch orchestration & incremental runs (`run_pipeline.py`)

The operating model: **you paste collection URLs into one file and commit.** Everything
already scraped is skipped; only the new collections cost time and money. Nothing else
needs to be remembered by a human.

### 8.1 Input — `collections.json`

One file, keyed by designer. Values may be a JSON array *or* a comma/newline-separated
string, because the point is that pasting a URL should never be a formatting exercise.

```json
{
  "prada": [
    "https://www.vogue.com/fashion-shows/fall-2025-ready-to-wear/prada",
    "https://www.vogue.com/fashion-shows/spring-2025-ready-to-wear/prada"
  ],
  "valentino": "https://www.vogue.com/fashion-shows/fall-2025-ready-to-wear/valentino,
                https://www.vogue.com/fashion-shows/resort-2026/valentino"
}
```

As an alternative, `inputs/{designer}.txt` (one URL per line, `#` comments allowed) is
read if that directory exists. Both forms may coexist.

The designer key is only a label for grouping and logging — the authoritative designer
name always comes from the scraped page.

### 8.2 Identity and de-duplication

A collection's identity is its **canonical URL**: `canonical_page_url()` strips any
`/slideshow/...` suffix, query string, fragment and trailing slash, and lowercases the
host. So all of these collapse to one entry, scraped once:

```
.../fall-2025-ready-to-wear/prada
.../fall-2025-ready-to-wear/prada/
.../fall-2025-ready-to-wear/prada/slideshow/collection#12
.../fall-2025-ready-to-wear/prada?utm_source=x
```

Duplicates within the input are collapsed silently; URLs that do not look like
`/fashion-shows/{collection}/{designer}` are reported and skipped rather than guessed at.

### 8.3 State — `state/manifest.json`

The ledger of what has been done. Keyed by canonical URL, tracking **each stage
separately** so a collection that scraped but failed to match resumes at matching only.

```json
{
  "pipeline_version": 2,
  "collections": {
    "https://www.vogue.com/fashion-shows/fall-2025-ready-to-wear/prada": {
      "designer": "Prada",
      "designer_key": "prada",
      "collection_name": "fall-2025-ready-to-wear",
      "first_seen": "2026-08-01T09:14:00Z",
      "last_run":   "2026-08-01T09:22:41Z",
      "stages": {
        "scrape": {
          "status": "ok", "at": "2026-08-01T09:15:02Z", "pipeline_version": 2,
          "looks": 52, "details": 117, "tags": 169, "strategy": "embedded-state",
          "fingerprint": "sha256:9f1c…",
          "output": "data/raw/Prada_fall_2025_ready_to_wear_raw.json"
        },
        "match": {
          "status": "ok", "at": "2026-08-01T09:22:41Z",
          "model": "gemini-2.5-flash", "source_fingerprint": "sha256:9f1c…",
          "details_attached": 116, "unmatched": 1, "looks_with_details": 52,
          "est_cost_usd": 0.31,
          "output": "data/mapped/Prada_fall_2025_ready_to_wear_mapped.json"
        }
      }
    }
  }
}
```

**Fingerprint** = SHA-256 over the sorted Condé Nast photo IDs of every look and detail.
It is the content identity of a collection: if Vogue later adds looks or swaps images,
the fingerprint changes and downstream stages are known to be stale.

### 8.4 Skip rules

Per collection, per stage:

| stage | skipped when |
|---|---|
| scrape | manifest says `ok`, the output file still exists, and `pipeline_version` matches |
| match | manifest says `ok`, output exists, `source_fingerprint` equals the current raw fingerprint, and the model matches |

Overrides: `--force scrape|match|all`, `--only scrape|match`, and `--recheck`, which
re-scrapes even when `ok` and compares fingerprints — if the content changed, matching
is automatically invalidated and re-run. Scraping is free; only re-matching costs money,
so `--recheck` is safe to run on a schedule.

Bumping `pipeline_version` is the mechanism for rolling a scraper fix across everything:
it invalidates every scrape stage on the next run.

### 8.5 Guardrails — never overwrite good data with worse

This is what protects the corpus when Vogue changes its markup. After a scrape, before
anything is written to `data/`:

* `looks >= 1`, and every look has a non-empty `runway_img_asset` — otherwise **fail**.
* tag coverage `tags / (looks + details)` below `--min-tag-ratio` (default 0.8) — **warn**.
* **Regression check:** if the manifest holds a previous successful scrape and the new
  one has fewer than 80% of its looks, the result is treated as `suspect`: it is written
  to `data/quarantine/` instead, the existing good file is left untouched, and the run
  is marked failed for that collection.

A site redesign therefore produces a loud, quarantined failure rather than silently
replacing 52 good looks with 3 bad ones.

### 8.6 Outputs

```
data/raw/{Designer}_{collection}_raw.json
data/mapped/{Designer}_{collection}_mapped.json
data/quarantine/…                     suspect scrapes; never overwrite a good file
state/manifest.json                   the ledger
state/runs/run_{timestamp}.json       machine-readable summary of one run
state/runs/latest.json                copy of the most recent run summary
logs/run_{timestamp}.log              full human-readable log
```

### 8.7 Logging

Console and log file get the same lines. One block per collection, with an explicit
verb (`SKIP` / `RUN` / `OK` / `FAIL` / `SUSPECT`) in a fixed column so a run can be
skimmed:

```
run 2026-08-01T09:14:00Z · 12 urls in, 11 unique, pipeline v2
[ 1/11] prada · fall-2025-ready-to-wear
         scrape  SKIP   done 2026-07-31 (52 looks, 117 details)
         match   RUN    117 details -> gemini-2.5-flash, window ±6
         match   OK     116/117 attached, 52/52 looks   4m12s  ~$0.31
[ 2/11] valentino · spring-2026-ready-to-wear
         scrape  RUN
         scrape  OK     64 looks, 88 details, 152 tags   48s
         match   OK     88/88 attached, 63/64 looks      3m02s  ~$0.24
[ 3/11] gucci · fall-2025-ready-to-wear
         scrape  FAIL   HTTP 404 — check the URL
────────────────────────────────────────────────────────────────
scraped 2   matched 2   skipped 8   failed 1   suspect 0
gemini ~$0.55   elapsed 8m41s   log: logs/run_20260801T091400Z.log
```

`--dry-run` prints exactly this plan — which collections would be scraped, which
skipped, and the estimated Gemini cost — **without making a single API call**. That is
the intended way to check spend before committing to a large batch.

### 8.8 Failure isolation and controls

One bad URL never aborts the run. Each collection is wrapped per stage; failures are
recorded in the manifest with the error and timestamp, and the run continues. The
process exits non-zero if anything failed, so CI goes red while still having done all
the work it could.

Controls: `--max-collections N` (bound one run), `--max-cost USD` (stop starting new
matches once the estimate is exceeded), `--delay SECONDS` between collections (default 2,
to be polite to Vogue), `--workers`, `--model`, `--fail-fast`.

### 8.9 GitHub Actions

Trigger on `workflow_dispatch` and on `push` affecting `collections.json` — so the whole
operating model is *edit the file, commit, done*.

```yaml
concurrency: { group: scrape-pipeline, cancel-in-progress: false }
permissions: { contents: write }
```

Steps: checkout → setup Python → `pip install -r requirements.txt` →
`python -m playwright install --with-deps chromium` → `python run_pipeline.py` →
commit `data/`, `state/` and `logs/` back to the repo → upload the log as an artifact
`if: always()`. `GEMINI_API_KEY` comes from repository secrets; the code already prefers
a real environment variable over `.env`.

Two things this design depends on:

* **State must persist between runs.** Committing `state/` and `data/` back to the repo
  is the simplest correct answer and gives an auditable diff per run. `actions/cache` is
  *not* suitable — cache eviction would silently cause re-scrapes and duplicate spend.
* **Repo growth.** Roughly 1 MB of JSON per collection, so ~100 MB at 100 collections.
  Acceptable now; past a few hundred, move the corpus to object storage or let MongoDB
  become the source of truth and have the manifest query it instead.

The `concurrency` group matters: two simultaneous runs would both commit and one would
lose. Serialising them keeps the manifest coherent.

### 8.10 Implementation note

`run_pipeline.py` imports `scraper.py` and `match_details.py` rather than shelling out,
calling `scrape(args)` and `run(args)` — both already return the finished payload dict,
so counts for the manifest come straight back without re-reading files. Each keeps its
own standalone CLI for one-off work.

## 9. Conventions

* Full-resolution assets use the CDN `/master/pass/` rendition; `--image-size` can request
  `sm`/`md`/`lg`/`xl` instead.
* Every layer writes `{designer}_{collection_name}_{stage}.json` with `safe_filename`
  slugging, so filenames stay predictable for batch runs.
* Provenance is additive: `mapping`, `detail_matches` and per-record confidences travel
  with the data and can be ignored by consumers that do not want them.
* A look's identity is its **look number, which equals its asset number** (`00012-…jpg`
  is look 12). Never renumber looks sequentially — §5.1 records what that cost once.
* Layers are pure functions of their input file plus a model version. Anything that
  changes their output must bump `pipeline_version` so Layer 0 can invalidate correctly.
