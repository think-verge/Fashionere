# fashionairre-core — operating notes / deferred TODOs

## Deferred
- **Automate raw→canonical ingestion.** Currently `ingest_mongo.py` is a **manual,
  re-runnable full batch** (idempotent via `look_id` upsert). To do later:
  - trigger automatically — a **cron/scheduled job**, or a **MongoDB change-stream
    watcher** on `Fashionere.Raw Data`;
  - make it **incremental** — use each doc's `content_hash` to skip unchanged looks.
  (Agreed 2026-08-03: manual for now, automate once the pipeline is proven.)

## Operating model (agreed 2026-08-03)
- **Source of truth:** `Fashionere.canonical_looks` (built from `Fashionere.Raw Data`).
- **Trend output:** batch-compute **Trend Sheets for all 7 brands** (the aggregates/
  momentum data). Narrated magazine reports are a later, on-demand layer.
- **Report scope:** **the most recent 2 years present per brand** (year-over-year
  momentum). This includes 2027 for brands that have 2027 collections
  (Valentino, Balenciaga, Gucci, Louis Vuitton); brands whose latest is 2026 use
  2025+2026. (Data-driven window, not tied to today's calendar year.)
