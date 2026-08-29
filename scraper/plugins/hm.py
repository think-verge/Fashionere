"""H&M scraper plugin — Patchright-driven.

H&M's Akamai bot manager blocks both plain curl (after the first request
flags the IP) and vanilla Playwright's fingerprinted Chromium. Patchright — a
Playwright fork with anti-detection patches — gets through cleanly.

Both pages are Next.js — the product state lives in `<script id="__NEXT_DATA__">`:
  - Listing HTML → productListingData.hits[] (36 per page, paginated)
  - Product HTML → productArticleDetails.variations[articleId]
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from urllib.parse import urljoin

from scraper.base import BaseScraper

log = logging.getLogger(__name__)

IMAGE_WIDTH = 2160
PAGE_SIZE = 36


class HMScraper(BaseScraper):
    brand_slug = "hm"
    base_url = "https://www2.hm.com"

    REGION_MAP = {
        "in": {"path": "en_in", "currency": "INR"},
        "us": {"path": "en_us", "currency": "USD"},
        "gb": {"path": "en_gb", "currency": "GBP"},
    }

    # Akamai session-flag threshold — rotate the browser context (drop cookies)
    # every N product loads to force a fresh identity. Empirically ~30 requests
    # is where H&M starts denying.
    ROTATE_EVERY = 20

    def __init__(self, *, region: str = "in", **kwargs):
        super().__init__(**kwargs)
        self.region = region
        rc = self.REGION_MAP.get(region, {"path": "en_in", "currency": "INR"})
        self._path = rc["path"]
        self._currency = rc["currency"]
        self._browser = None
        self._context = None
        self._pw = None
        self._products_since_rotate = 0

    # ---- patchright lifecycle (overrides base's playwright lifecycle) ----
    async def _launch(self, _pw_unused):
        from patchright.async_api import async_playwright
        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(
            headless=self.headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        self._context = await self._browser.new_context(
            locale="en-US",
            viewport={"width": 1440, "height": 900},
        )

    async def _close(self):
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()

    async def new_page(self):
        assert self._context, "context not initialised"
        return await self._context.new_page()

    async def _rotate_context(self):
        """Close the current context and open a fresh one. Drops cookies +
        localStorage so Akamai has to re-fingerprint us from scratch."""
        if self._context:
            await self._context.close()
        self._context = await self._browser.new_context(
            locale="en-US",
            viewport={"width": 1440, "height": 900},
        )
        self._products_since_rotate = 0
        log.info("Rotated browser context (fresh cookies)")

    async def _maybe_rotate(self):
        if self._products_since_rotate >= self.ROTATE_EVERY:
            await self._rotate_context()

    async def _extract_next_data(self, page) -> dict | None:
        """Read the __NEXT_DATA__ script from the currently loaded page.
        Distinguishes an Akamai denial (page title 'Access Denied' or no
        __NEXT_DATA__ script) from a JSON-parse issue so we log clearly."""
        try:
            info = await page.evaluate("""
                () => {
                    const el = document.getElementById('__NEXT_DATA__');
                    return {
                        title: document.title,
                        len: document.documentElement.outerHTML.length,
                        raw: el ? el.textContent : null,
                    };
                }
            """)
        except Exception as e:
            log.warning("Could not read __NEXT_DATA__: %s", e)
            return None
        title = (info or {}).get("title") or ""
        raw = (info or {}).get("raw")
        if title.strip().lower() == "access denied" or (info or {}).get("len", 0) < 3000:
            log.warning("Access denied (title=%r, htmlLen=%d) — Akamai flagged us",
                        title, (info or {}).get("len", 0))
            return None
        if not raw:
            log.warning("No __NEXT_DATA__ on page (title=%r)", title)
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            log.warning("Bad __NEXT_DATA__ JSON: %s", e)
            return None

    # ---- listing ----
    async def scrape_listing(self, category_url: str) -> list[dict]:
        stubs: list[dict] = []
        page_num = 1
        page = await self.new_page()
        try:
            while True:
                url = category_url
                if page_num > 1:
                    sep = "&" if "?" in category_url else "?"
                    url = f"{category_url}{sep}page={page_num}"
                log.info("Loading H&M listing page %d: %s", page_num, url)
                await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                await page.wait_for_timeout(5000)

                data = await self._extract_next_data(page)
                if not data:
                    log.warning("No __NEXT_DATA__ on listing page %d", page_num)
                    break

                try:
                    pld = data["props"]["pageProps"]["plpProps"]["productListingSectionProps"]["productListingData"]
                except KeyError:
                    log.warning("productListingData missing on page %d", page_num)
                    break

                hits = pld.get("hits") or []
                for h in hits:
                    aid = h.get("articleCode")
                    if not aid:
                        continue
                    pdp = h.get("pdpUrl") or f"/{self._path}/productpage.{aid}.html"
                    product_url = pdp if pdp.startswith("http") else urljoin(self.base_url, pdp)
                    stubs.append({
                        "product_id": aid,
                        "reference": aid,
                        "name": h.get("title"),
                        "category": h.get("category"),
                        "url": product_url,
                        "currency": self._currency,
                        "listing_swatches": h.get("swatches") or [],
                    })

                pag = pld.get("pagination") or {}
                total_pages = pag.get("totalPages", 1)
                log.info("  page %d: %d hits (total pages: %d)", page_num, len(hits), total_pages)
                if page_num >= total_pages:
                    break
                page_num += 1
                await asyncio.sleep(self.delay)
        finally:
            await page.close()

        # dedup by article id
        seen, unique = set(), []
        for s in stubs:
            if s["product_id"] in seen:
                continue
            seen.add(s["product_id"])
            unique.append(s)
        log.info("Listing final: %d unique products", len(unique))
        return unique

    # ---- product ----
    async def scrape_product(self, _page_unused, stub: dict) -> dict | None:
        await self._maybe_rotate()
        url = stub["url"]
        aid = stub["product_id"]
        log.info("Loading H&M product: %s", url)
        page = await self.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(4000)
            data = await self._extract_next_data(page)
        finally:
            await page.close()
        self._products_since_rotate += 1

        if not data:
            log.warning("Failed to extract data from %s", url)
            return None
        try:
            pad = data["props"]["pageProps"]["productPageProps"]["aemData"]["productArticleDetails"]
        except KeyError:
            log.warning("productArticleDetails missing on %s", url)
            return None

        variations = pad.get("variations") or {}
        this = variations.get(aid) or variations.get(pad.get("articleCode"))
        if not this:
            log.warning("No variation for %s in %s", aid, url)
            return None

        # collect all color variants (other articleCodes in variations)
        all_variants = []
        for other_aid, other in variations.items():
            if not isinstance(other, dict) or not other.get("name"):
                continue
            all_variants.append({
                "article_id": other_aid,
                "color_name": other.get("name"),
                "hex": other.get("rgb"),
                "url": other.get("url"),
                "images": other.get("images") or [],
                "swatch": other.get("swatchDetails"),
            })

        # resolve image URLs at max width
        for img in this.get("images") or []:
            base = img.get("baseUrl") or img.get("image")
            if base and base.startswith("//"):
                base = "https:" + base
            if base:
                sep = "&" if "?" in base else "?"
                img["resolved_url"] = f"{base}{sep}imwidth={IMAGE_WIDTH}"

        return {
            "reference": aid,  # for filename + dedup in the pipeline
            "article_id": aid,
            "base_product_code": pad.get("baseProductCode"),
            "product_key": pad.get("productKey"),
            "product_name": pad.get("productName") or pad.get("baseProductName"),
            "brand": pad.get("brand"),
            "product_category": pad.get("productCategory"),
            "main_category": this.get("mainCategory"),
            "name": this.get("name"),
            "description": this.get("description"),
            "compositions": this.get("compositions") or [],
            "care_instructions": this.get("careInstructions") or [],
            "material_details": this.get("materialDetails"),
            "material_information": this.get("materialInformation"),
            "images": this.get("images") or [],
            "swatch": this.get("swatchDetails"),
            "rgb": this.get("rgb"),
            "concept": this.get("concept") or [],
            "sizes": this.get("sizes") or [],
            "price_display": this.get("whitePrice"),
            "price_value": this.get("whitePriceValue"),
            "price_currency": this.get("priceCurrency") or self._currency,
            "product_attributes": this.get("productAttributes") or [],
            "model_height": this.get("modelHeight"),
            "video": this.get("video"),
            "url": this.get("url") or url,
            "source_url": url,
            "region": self.region,
            "currency": self._currency,
            "variants": all_variants,
            "breadcrumbs": (
                data.get("props", {}).get("pageProps", {})
                    .get("productPageProps", {}).get("aemData", {}).get("breadcrumbs")
            ),
        }
