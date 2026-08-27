"""CLI entry point for the scraper framework.

Usage:
    python -m scraper zara --category "https://www.zara.com/in/en/woman-jackets-l1114.html?v1=2664773&regionGroupId=230" --max 5
    python -m scraper zara --category "..." --region us --max 10
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")

PLUGINS = {
    "zara": "scraper.plugins.zara:ZaraScraper",
}


def _load_plugin(name: str):
    if name not in PLUGINS:
        sys.exit(f"Unknown plugin: {name}. Available: {', '.join(PLUGINS)}")
    module_path, class_name = PLUGINS[name].rsplit(":", 1)
    import importlib
    mod = importlib.import_module(module_path)
    return getattr(mod, class_name)


def main():
    parser = argparse.ArgumentParser(description="Fashionere retail scraper")
    parser.add_argument("plugin", choices=PLUGINS.keys(), help="Brand plugin to run")
    parser.add_argument("--category", required=True, help="Category URL to scrape")
    parser.add_argument("--region", default="in", help="Region code (in, us, gb, es, cn)")
    parser.add_argument("--max", type=int, default=None, dest="max_products", help="Max products to scrape")
    parser.add_argument("--headed", action="store_true", help="Run browser in headed mode")
    parser.add_argument("--delay", type=float, default=1.5, help="Delay between product requests (seconds)")
    args = parser.parse_args()

    cls = _load_plugin(args.plugin)
    scraper = cls(
        region=args.region,
        headless=not args.headed,
        delay=args.delay,
        max_products=args.max_products,
    )

    results = asyncio.run(scraper.run(args.category))
    print(f"\nDone. Scraped {len(results)} products → {scraper.out_dir}")


if __name__ == "__main__":
    main()
