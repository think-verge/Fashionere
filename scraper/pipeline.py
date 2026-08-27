"""End-to-end retail scrape pipeline.

One command does everything:
  1. Scrape a category (headed Playwright)
  2. Dedup against existing raw_data in MongoDB
  3. Store new raw docs in MongoDB
  4. Adapt raw → canonical Look
  5. Upsert canonical Looks into canonical_looks

Usage:
    python -m scraper.pipeline zara \
        --category "https://www.zara.com/in/en/woman-jackets-l1114.html?v1=2664773&regionGroupId=230" \
        --env "../Trend Analysis Engine/.env" \
        --max 10

    # scrape all 34 jackets from Zara India:
    python -m scraper.pipeline zara \
        --category "https://www.zara.com/in/en/woman-jackets-l1114.html?v1=2664773&regionGroupId=230" \
        --env "../Trend Analysis Engine/.env"
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "core"))

from dotenv import dotenv_values
from pymongo import MongoClient

from fashionairre_core.adapters.zara import parse_product as zara_parse
from fashionairre_core.adapters.hm import parse_product as hm_parse
from fashionairre_core.adapters.uniqlo import parse_product as uniqlo_parse
from fashionairre_core.store import CanonicalStore

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
log = logging.getLogger("pipeline")

ADAPTERS = {
    "zara": zara_parse,
    "hm": hm_parse,
    "uniqlo": uniqlo_parse,
}

PLUGIN_MAP = {
    "zara": "scraper.plugins.zara:ZaraScraper",
    "hm": "scraper.plugins.hm:HMScraper",
    "uniqlo": "scraper.plugins.uniqlo:UniqloScraper",
}


def _load_plugin(name: str):
    module_path, class_name = PLUGIN_MAP[name].rsplit(":", 1)
    import importlib
    mod = importlib.import_module(module_path)
    return getattr(mod, class_name)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="scraper.pipeline", description="Scrape → Store → Adapt → Canonical")
    p.add_argument("plugin", choices=PLUGIN_MAP.keys(), help="Brand plugin")
    p.add_argument("--category", required=True, help="Category URL to scrape")
    p.add_argument("--region", default="in", help="Region code (in, us, gb, es, cn)")
    p.add_argument("--max", type=int, default=None, dest="max_products", help="Max products to scrape")
    p.add_argument("--delay", type=float, default=2.0, help="Delay between product pages (seconds)")
    p.add_argument("--env", default="../Trend Analysis Engine/.env", help=".env with MONGO_URI")
    p.add_argument("--db", default="Fashionere", help="MongoDB database name")
    p.add_argument("--raw-coll", default="raw_data", help="Collection for raw scraped docs")
    p.add_argument("--out-coll", default="canonical_looks", help="Collection for canonical Looks")
    p.add_argument("--skip-scrape", action="store_true", help="Skip scraping, only process existing raw docs")
    p.add_argument("--dry-run", action="store_true", help="Scrape + adapt but don't write to MongoDB")
    a = p.parse_args(argv)

    # --- connect to MongoDB ---
    env_path = Path(a.env)
    if not env_path.exists():
        # try relative to script location
        env_path = Path(__file__).resolve().parents[1] / a.env.lstrip("../")
    uri = dotenv_values(str(env_path)).get("MONGO_URI")
    if not uri and not a.dry_run:
        print(f"MONGO_URI not found in {a.env}", file=sys.stderr)
        return 2

    client = None
    raw_coll = None
    store = None
    if uri and not a.dry_run:
        client = MongoClient(uri, serverSelectionTimeoutMS=15000)
        client.admin.command("ping")
        log.info("Connected to MongoDB")
        raw_coll = client[a.db][a.raw_coll]
        store = CanonicalStore(client[a.db][a.out_coll])

    # --- step 1: scrape ---
    raw_docs = []
    if not a.skip_scrape:
        cls = _load_plugin(a.plugin)
        scraper = cls(
            region=a.region,
            headless=False,
            delay=a.delay,
            max_products=a.max_products,
        )
        raw_docs = asyncio.run(scraper.run(a.category))
        log.info("Scraped %d products", len(raw_docs))
    else:
        # load from existing raw_data collection
        if raw_coll is not None:
            cursor = raw_coll.find({"source": a.plugin})
            if a.max_products:
                cursor = cursor.limit(a.max_products)
            raw_docs = list(cursor)
            for d in raw_docs:
                d.pop("_id", None)
            log.info("Loaded %d existing raw docs from MongoDB", len(raw_docs))

    if not raw_docs:
        log.warning("No products to process")
        return 0

    # --- step 2: dedup + store raw ---
    # dedup by product reference (stable ID) — if the content changed, update
    # the existing doc rather than inserting a duplicate
    new_count = 0
    updated_count = 0
    unchanged_count = 0
    if raw_coll is not None and not a.skip_scrape:
        for doc in raw_docs:
            ref = doc.get("product", {}).get("reference")
            ch = doc.get("content_hash")
            existing = raw_coll.find_one({"product.reference": ref, "source": a.plugin}) if ref else None
            if existing:
                if existing.get("content_hash") == ch:
                    unchanged_count += 1
                    continue
                # content changed (price update, new images, etc.) — replace
                raw_coll.replace_one({"_id": existing["_id"]}, doc.copy())
                updated_count += 1
            else:
                raw_coll.insert_one(doc.copy())
                new_count += 1
        log.info("Raw store: %d new, %d updated, %d unchanged", new_count, updated_count, unchanged_count)
    elif a.dry_run:
        log.info("Dry run: skipping raw storage")

    # --- step 3: adapt → canonical ---
    adapter = ADAPTERS.get(a.plugin)
    if not adapter:
        log.error("No adapter for plugin %s", a.plugin)
        return 1

    looks = []
    failed = 0
    for doc in raw_docs:
        try:
            look = adapter(doc)
            if look:
                looks.append(look)
        except Exception as e:
            failed += 1
            log.warning("Adapter failed: %s", e)

    log.info("Adapted %d looks (%d failed)", len(looks), failed)

    # --- step 4: upsert canonical ---
    if store and not a.dry_run:
        inserted = store.upsert_many(looks)
        log.info("Upserted %d canonical looks → %s.%s", inserted, a.db, a.out_coll)
        log.info("canonical_looks total: %d docs", store.count())
    elif a.dry_run:
        log.info("Dry run — would upsert %d canonical looks", len(looks))
        for look in looks[:5]:
            g = look.extraction.garments[0]
            log.info(
                "  %s | %s | type=%s | fibers=%s | price=%s %s | imgs=%d",
                look.look_id, g.piece, g.garment_type,
                [(f.fiber, f.pct) for f in g.composition],
                look.context.price.amount if look.context.price else "?",
                look.context.price.currency if look.context.price else "",
                len(look.images),
            )

    # --- summary ---
    by_type: Counter = Counter()
    for look in looks:
        for g in look.extraction.garments:
            by_type[g.garment_type or "other"] += 1

    print(f"\n{'='*50}")
    print(f"Pipeline complete: {a.plugin}")
    print(f"  Scraped:    {len(raw_docs)} products")
    if raw_coll is not None and not a.skip_scrape:
        print(f"  New raw:    {new_count}, updated: {updated_count}, unchanged: {unchanged_count}")
    print(f"  Adapted:    {len(looks)} canonical looks")
    print(f"  Failed:     {failed}")
    print(f"  By type:    {dict(by_type.most_common())}")
    if store:
        print(f"  DB total:   {store.count()} canonical looks")
    print(f"{'='*50}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
