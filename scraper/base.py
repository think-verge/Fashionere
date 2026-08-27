"""Base scraper — shared Playwright lifecycle and per-plugin contract.

Each brand plugin subclasses `BaseScraper` and implements two methods:
  - `scrape_listing(category_url)` → list of product stubs (id, name, price, url)
  - `scrape_product(stub)` → full product dict (composition, images, description)

The framework handles browser launch, retry, rate-limiting, and raw-data storage.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, async_playwright

try:
    from playwright_stealth import Stealth
    _STEALTH_AVAILABLE = True
except ImportError:
    _STEALTH_AVAILABLE = False

log = logging.getLogger(__name__)


class BaseScraper(ABC):
    brand_slug: str = ""
    region: str = "in"
    language: str = "en"
    base_url: str = ""

    stealth: bool = False  # plugins that hit strict bot protection set this True

    def __init__(
        self,
        *,
        headless: bool = True,
        delay: float = 1.5,
        max_products: int | None = None,
        out_dir: Path | None = None,
        stealth: bool | None = None,
    ):
        self.headless = headless
        self.delay = delay
        self.max_products = max_products
        self.out_dir = out_dir or Path("scraper_output") / self.brand_slug
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        if stealth is not None:
            self.stealth = stealth

    async def _launch(self, pw):
        self._browser = await pw.chromium.launch(
            headless=self.headless,
            args=[
                "--disable-blink-features=AutomationControlled",
            ],
        )
        self._context = await self._browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1440, "height": 900},
            locale="en-US",
        )
        # mask webdriver/automation signals
        await self._context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            delete navigator.__proto__.webdriver;
        """)

        if self.stealth and _STEALTH_AVAILABLE:
            await Stealth().apply_stealth_async(self._context)

    async def _close(self):
        if self._browser:
            await self._browser.close()

    async def new_page(self) -> Page:
        assert self._context
        return await self._context.new_page()

    @abstractmethod
    async def scrape_listing(self, category_url: str) -> list[dict]:
        """Return product stubs: [{product_id, name, price, url, ...}]."""

    @abstractmethod
    async def scrape_product(self, page: Page, stub: dict) -> dict | None:
        """Return full product data dict, or None to skip."""

    def content_hash(self, product: dict) -> str:
        raw = json.dumps(product, sort_keys=True, default=str)
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def _wrap_raw(self, product: dict, stub: dict) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        return {
            "source": self.brand_slug,
            "region": self.region,
            "scraped_at": now,
            "content_hash": self.content_hash(product),
            "category_url": stub.get("category_url"),
            "product": product,
        }

    async def run(self, category_url: str) -> list[dict]:
        """Scrape a category: listing → per-product detail → raw docs."""
        self.out_dir.mkdir(parents=True, exist_ok=True)
        results = []

        async with async_playwright() as pw:
            await self._launch(pw)
            try:
                stubs = await self.scrape_listing(category_url)
                log.info("Found %d products in listing", len(stubs))

                if self.max_products:
                    stubs = stubs[: self.max_products]

                page = await self.new_page()
                for i, stub in enumerate(stubs):
                    stub["category_url"] = category_url
                    log.info("[%d/%d] %s", i + 1, len(stubs), stub.get("name", stub.get("product_id")))
                    try:
                        product = await self.scrape_product(page, stub)
                        if product:
                            raw = self._wrap_raw(product, stub)
                            results.append(raw)
                            fname = self.out_dir / f"{self.brand_slug}_{product.get('reference', i)}.json"
                            fname.write_text(json.dumps(raw, indent=2, ensure_ascii=False))
                    except Exception:
                        log.exception("Failed on product %s", stub.get("product_id"))

                    if i < len(stubs) - 1:
                        await asyncio.sleep(self.delay)
            finally:
                await self._close()

        log.info("Scraped %d products → %s", len(results), self.out_dir)
        return results
