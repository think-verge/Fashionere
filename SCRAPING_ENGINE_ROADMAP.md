# Scraping Engine — Roadmap

Improvements to move the retail scraping framework from **manually invoked** to
**autonomous, self-healing, and delta-aware**.

## Current state (2026-08)

**Works today**
- Per-retailer plugins under `scraper/plugins/` — Zara (headed Playwright), Uniqlo (Patchright), H&M (Patchright + context rotation)
- Per-retailer adapters under `core/fashionairre_core/adapters/` — raw JSON → canonical `Look`
- Single-command orchestration: `python -m scraper.pipeline {brand} --category URL`
  - Chains `scrape → dedup → adapt → store` in one invocation
  - Writes raw JSON per product to `scraper_output/{brand}/` during the run
  - Only persists to MongoDB at the END of the run
- LLM tagger (`Trend Analysis Engine/trend_engine/jobs/tag_canonical.py`) as a separate step

**Does NOT work autonomously**
- No scheduling — every run needs a human to type the command
- No crash recovery — if the pipeline dies mid-run, in-memory results are lost (JSON files on disk survive but require a manual disk-loader script to be committed to DB)
- No auto-tagging — tagger is a separate second command
- No delta scraping — every run re-scrapes the entire listing regardless of what's already stored
- No rate-limit backoff — when Akamai starts denying, the scraper logs warnings and marches on until the process is killed
- No retry queue — failed products stay failed
- No health check / alerting — you have to grep the log to know if a run succeeded

## Improvements — sequenced by effort × value

### Tier 1 — small, high-value (~2–3 hours total)

1. **`--auto-tag` flag on the pipeline**
   - After storing canonical looks, invoke `tag_canonical` for the brand automatically
   - Removes the manual "now run the tagger" step
   - Files touched: `scraper/pipeline.py` (add flag + subprocess call)

2. **Delta-only mode (`--only-new`)**
   - Before the listing loop, load existing `raw_data` product references for this source into a set
   - Skip any listing stub whose reference is already stored
   - Cuts scrape time on repeat runs by 80–95%
   - Files touched: `scraper/pipeline.py`, `scraper/base.py`

3. **Resume from disk (`--from-disk`)**
   - Read all `scraper_output/{brand}/*.json` files instead of scraping
   - Push each through the adapter + store
   - Rescues data from crashed runs without re-scraping (like today's H&M run)
   - Currently done as a scratchpad script — should be a first-class command
   - Files touched: `scraper/pipeline.py`

4. **Per-product commit (opt-in `--commit-each`)**
   - Instead of collecting all raw docs in memory and committing at the end, upsert each after `scrape_product` returns
   - Crash-safe: whatever was scraped is already in Mongo
   - Trade-off: more Mongo writes, slightly slower
   - Files touched: `scraper/base.py`, `scraper/pipeline.py`

### Tier 2 — medium (~half day each)

5. **Rate-limit backoff**
   - Track denial rate in a sliding window (e.g. last 20 requests)
   - If denials > 50%, halt scraping and sleep 5–15 minutes before continuing (or abort)
   - Prevents wasted attempts and reduces the risk of IP-level bans
   - Files touched: `scraper/base.py`

6. **Retry queue**
   - Failed products (denied, network error, JSON parse fail) → append to `scraper_output/{brand}/retry_queue.json`
   - Next pipeline run flushes the queue first before doing the normal listing sweep
   - Files touched: `scraper/base.py`, `scraper/pipeline.py`

7. **Structured run summary**
   - At end of every run, emit `scraper_output/{brand}/last_run.json` with `{scraped, failed_reasons, new, unchanged, updated, denied, started_at, ended_at}`
   - Enables monitoring / alerting on top
   - Files touched: `scraper/pipeline.py`

8. **Config file for retailers**
   - `configs/retail_sources.yml` — one entry per (brand, category, region) with URL + refresh schedule + `last_run_at`
   - Single command: `python -m scraper.refresh` — reads config, runs anything due
   - Files touched: new `scraper/refresh.py`, new `configs/retail_sources.yml`

### Tier 3 — larger (autonomy layer, ~1–2 days)

9. **Scheduling**
   - Cron / launchd job on the local machine, OR GitHub Actions on schedule, OR a hosted worker (Modal, Fly, etc.)
   - Runs `python -m scraper.refresh` daily / weekly
   - Requires: Tier 1 + Tier 2 items 5 and 7 for real reliability

10. **Failure alerting**
    - If `last_run.json` shows denial rate > threshold, or `scraped == 0`, or run age > expected interval
    - Send email / Slack via a simple webhook
    - Files touched: new `scraper/watchdog.py`

11. **Retailer-agnostic health-check dashboard**
    - Small web page (could live inside the existing `app_api/`) reading `last_run.json` from each retailer
    - Shows: last-run age, coverage %, denial rate, new-product count
    - No moving parts, just reads what tier 2 emits

12. **Auto-deconstruction hook**
    - When new retail looks land in `canonical_looks` (post-tag), queue them for deconstruction
    - Requires the Deconstruction Engine to have its own queue reader
    - Coupling point that likely wants a small pub/sub layer (or just a queue collection in Mongo)

## Bot-protection notes (per retailer)

- **Zara** — headed Playwright with basic stealth patches works. Zara IN accepts most requests; Zara US is more protective and rate-limits around 30 requests.
- **Uniqlo** — Patchright + product-detail API endpoint (`/api/commerce/v5/{lang}/products/{id}/price-groups/00/details`). Bypasses Uniqlo US's Akamai layer that blocks vanilla Playwright.
- **H&M** — Patchright + context rotation every 20 products. Even with rotation, expect 40–50% denial rate; the successful subset is still meaningful. India catalog is open to plain curl; US requires the Playwright path.
- **Mango** — Akamai-blocked at every layer we tested (curl, Playwright, Patchright short of a real cookie warmer). Deferred until we invest in the Playwright cookie-warmer approach.

## Nice-to-have but not roadmap-critical

- Support for a proxy service (Bright Data, ZenRows, ScraperAPI) as a fallback path when local Playwright can't get through
- Screenshots-on-failure for debugging
- Cost tracking: each run emits `runs.jsonl` with `{brand, count, tokens_used, api_cost_usd, wall_seconds}`
- Sitemap / robots.txt awareness before scraping (respectful crawling)
