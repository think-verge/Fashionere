"""Uniqlo scraper plugin — Patchright-driven.

India serves everything as server-side rendered HTML that plain curl could read.
US puts everything behind Akamai bot-manager, which blocks curl AND vanilla
Playwright. Patchright is a Playwright fork with anti-detection patches that
get through Akamai. Same API as playwright, drop-in replacement.

We use patchright for both regions — that way one code path serves everywhere.

Listing: extract product IDs from anchor hrefs (they're in the SSR'd HTML on
India, and in the DOM after async load on US — both work with the same query
after we scroll a bit).

Product page: `window.__PRELOADED_STATE__` (present on both regions once the
page has hydrated).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from urllib.parse import urljoin, urlparse

from scraper.base import BaseScraper

log = logging.getLogger(__name__)

PRELOADED_MARK = "window.__PRELOADED_STATE__ = "


class UniqloScraper(BaseScraper):
    brand_slug = "uniqlo"
    base_url = "https://www.uniqlo.com"

    REGION_MAP = {
        "in": {"path": "in/en", "currency": "INR"},
        "us": {"path": "us/en", "currency": "USD"},
        "jp": {"path": "jp/en", "currency": "JPY"},
    }

    def __init__(self, *, region: str = "in", **kwargs):
        super().__init__(**kwargs)
        self.region = region
        rc = self.REGION_MAP.get(region, {"path": "in/en", "currency": "INR"})
        self._path = rc["path"]
        self._currency = rc["currency"]
        self._browser = None
        self._context = None

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
        if getattr(self, "_pw", None):
            await self._pw.stop()

    async def new_page(self):
        assert self._context, "context not initialised"
        return await self._context.new_page()

    # ---- listing ----
    async def scrape_listing(self, category_url: str) -> list[dict]:
        page = await self.new_page()
        try:
            log.info("Loading Uniqlo listing: %s", category_url)
            await page.goto(category_url, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(6000)

            # scroll to trigger lazy-loading of the full listing
            for i in range(20):
                await page.evaluate("window.scrollBy(0, window.innerHeight * 2)")
                await page.wait_for_timeout(900)
                # break early once no new links appear across two scrolls
                if i % 4 == 3:
                    cur = await page.evaluate(
                        "document.querySelectorAll(\"a[href*='/products/E']\").length"
                    )
                    log.info("  scroll %d — %d links visible", i + 1, cur)

            hrefs: list[str] = await page.evaluate("""
                () => {
                    const seen = new Set();
                    const out = [];
                    for (const a of document.querySelectorAll("a[href*='/products/E']")) {
                        const h = a.getAttribute('href') || a.href || '';
                        const m = h.match(/\\/products\\/(E\\d+-\\d+)(?:\\/(\\d+))?/);
                        if (!m) continue;
                        const suffix = m[2] || '00';
                        const pid = m[1] + '-' + suffix;
                        if (seen.has(pid)) continue;
                        seen.add(pid);
                        out.push(h.startsWith('http') ? h : ('https://www.uniqlo.com' + h));
                    }
                    return out;
                }
            """)
        finally:
            await page.close()

        stubs: list[dict] = []
        seen: set[str] = set()
        for href in hrefs:
            m = re.search(r"/products/(E\d+-\d+)(?:/(\d+))?", href)
            if not m:
                continue
            path_id = m.group(1)
            suffix = m.group(2) or "00"
            pid = f"{path_id}-{suffix}"
            if pid in seen:
                continue
            seen.add(pid)
            url = f"{self.base_url}/{self._path}/products/{path_id}/{suffix}"
            stubs.append({
                "product_id": pid,
                "reference": pid,
                "name": None,
                "url": url,
                "currency": self._currency,
            })
        log.info("Listing final: %d unique products", len(stubs))
        return stubs

    # ---- product ----
    async def scrape_product(self, _page_unused, stub: dict) -> dict | None:
        """Region-adaptive product scrape:
        * IN: `window.__PRELOADED_STATE__` is embedded — use it.
        * US: state isn't preloaded; the client fetches
              `/products/{id}/price-groups/00/details` (full detail) and
              `/products?productIds={id}&priceGroups=00` (listing images).
              We do the same via patchright's in-page fetch (which carries the
              Akamai cookies we established loading the listing).
        """
        url = stub["url"]
        pid = stub["product_id"]
        base_id = pid.rsplit("-", 1)[0]  # E479208-000
        log.info("Loading Uniqlo product: %s", url)
        page = await self.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(4000)

            # try preloaded state first (works for IN)
            state = await page.evaluate("() => window.__PRELOADED_STATE__ || null")
            if state:
                pdp = (state.get("entity") or {}).get("pdpEntity") or {}
                entry = pdp.get(pid) or (list(pdp.values())[0] if pdp else None)
                product = (entry or {}).get("product") if entry else None
                if product and product.get("name"):
                    product["source_url"] = url
                    product["region"] = self.region
                    product["currency"] = self._currency
                    product["_full_product_id"] = pid
                    return product

            # fallback — hit the commerce APIs directly (works for US)
            api_data = await page.evaluate("""async (baseId) => {
                const region = window.location.pathname.split('/')[1] || 'us';
                const lang = window.location.pathname.split('/')[2] || 'en';
                const [det, list] = await Promise.all([
                    fetch(`/${region}/api/commerce/v5/${lang}/products/${baseId}/price-groups/00/details`).then(r => r.json()).catch(() => null),
                    fetch(`/${region}/api/commerce/v5/${lang}/products?productIds=${baseId}&priceGroups=00&httpFailure=true`).then(r => r.json()).catch(() => null),
                ]);
                return { det: det?.result, list: (list?.result?.items || [])[0] };
            }""", base_id)
        finally:
            await page.close()

        det = (api_data or {}).get("det") or {}
        lst = (api_data or {}).get("list") or {}
        if not det.get("name"):
            log.warning("Missing product detail via API on %s", url)
            return None

        # merge detail (composition, description, tags) + listing (images, colors)
        product = dict(det)
        if lst.get("images"):
            product["images"] = lst["images"]
        if lst.get("colors") and not product.get("colors"):
            product["colors"] = lst["colors"]
        product["source_url"] = url
        product["region"] = self.region
        product["currency"] = self._currency
        product["_full_product_id"] = pid
        return product
