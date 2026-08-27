"""H&M scraper plugin — plain HTTP fetch, no Playwright.

H&M's Akamai layer blocks headless AND vanilla headed Chromium (fingerprinting
Chromium's TLS/JA3), but lets through curl + Python requests when given a full
Chrome header set. So we skip Playwright entirely for H&M.

Both pages are Next.js — the product state lives in the HTML at
`<script id="__NEXT_DATA__">`:

  - Listing page HTML → productListingData.hits[] (36 per page, paginated)
  - Product page HTML → productArticleDetails.variations[articleId]
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from urllib.parse import urljoin, urlparse

from playwright.async_api import Page

from scraper.base import BaseScraper

log = logging.getLogger(__name__)

IMAGE_WIDTH = 2160
PAGE_SIZE = 36

CHROME_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,"
              "image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
}

_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>',
    re.DOTALL,
)


class HMScraper(BaseScraper):
    """H&M — HTTP-based (no browser)."""
    brand_slug = "hm"
    base_url = "https://www2.hm.com"

    REGION_MAP = {
        "in": {"path": "en_in", "currency": "INR"},
        "us": {"path": "en_us", "currency": "USD"},
        "gb": {"path": "en_gb", "currency": "GBP"},
    }

    def __init__(self, *, region: str = "in", **kwargs):
        super().__init__(**kwargs)
        self.region = region
        rc = self.REGION_MAP.get(region, {"path": "en_in", "currency": "INR"})
        self._path = rc["path"]
        self._currency = rc["currency"]

    # ------------- HTTP-only lifecycle (skip Playwright) -------------

    async def _launch(self, pw):
        pass  # no client to init — we shell out to curl

    async def _close(self):
        pass

    async def new_page(self):
        # kept for base-class contract; unused in HTTP mode
        return None

    async def _fetch(self, url: str) -> str | None:
        """H&M's Akamai flags near-miss Chrome fingerprints as bots but lets
        plain curl through, so we shell out."""
        cmd = ["curl", "-sSL", "--compressed", "--max-time", "30", "-w", "%{http_code}\\n"]
        for k, v in CHROME_HEADERS.items():
            cmd.extend(["-H", f"{k}: {v}"])
        cmd.append(url)
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        out, err = await proc.communicate()
        body = out.decode("utf-8", errors="replace")
        # split off the trailing HTTP code (%{http_code}\n)
        if body:
            # last non-empty line is the code
            lines = body.rstrip("\n").rsplit("\n", 1)
            if len(lines) == 2 and lines[1].isdigit():
                body, code = lines[0], int(lines[1])
            else:
                code = 200 if body else 0
        else:
            code = 0
        if code != 200 or len(body) < 2000:
            log.warning("Bad response %s (%d bytes) for %s", code, len(body), url)
            return None
        return body

    async def _fetch_next_data(self, url: str) -> dict | None:
        body = await self._fetch(url)
        if not body:
            return None
        m = _NEXT_DATA_RE.search(body)
        if not m:
            log.warning("No __NEXT_DATA__ in %s", url)
            return None
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError as e:
            log.warning("Bad JSON in __NEXT_DATA__ for %s: %s", url, e)
            return None

    # ------------- listing + product -------------

    async def scrape_listing(self, category_url: str) -> list[dict]:
        stubs: list[dict] = []
        page_num = 1
        while True:
            url = category_url
            if page_num > 1:
                sep = "&" if "?" in category_url else "?"
                url = f"{category_url}{sep}page={page_num}"
            log.info("Loading H&M listing page %d: %s", page_num, url)
            data = await self._fetch_next_data(url)
            if not data:
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

        # dedup by article id — listing rarely repeats, but safety
        seen, unique = set(), []
        for s in stubs:
            if s["product_id"] in seen:
                continue
            seen.add(s["product_id"])
            unique.append(s)
        log.info("Listing final: %d unique products", len(unique))
        return unique

    async def scrape_product(self, page: Page, stub: dict) -> dict | None:
        url = stub["url"]
        aid = stub["product_id"]
        log.info("Loading H&M product: %s", url)

        data = await self._fetch_next_data(url)
        if not data:
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

        # collect the full color-variant set (other articleCodes in variations)
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

        # resolve image URLs on the primary variant
        for img in this.get("images") or []:
            base = img.get("baseUrl") or img.get("image")
            if base and base.startswith("//"):
                base = "https:" + base
            if base:
                sep = "&" if "?" in base else "?"
                img["resolved_url"] = f"{base}{sep}imwidth={IMAGE_WIDTH}"

        return {
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
