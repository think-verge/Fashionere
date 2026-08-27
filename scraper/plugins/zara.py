"""Zara scraper plugin.

Two-step approach discovered from network analysis:
  1. Category listing: GET /{region}/en/category/{catId}/products?regionGroupId={rgId}&ajax=true
     → JSON with all products (id, name, price, images, colors)
  2. Product detail: load product page → extract `window.zara.viewPayload.product`
     → composition, full images, description, family/subfamily

Zara serves product data as JSON (not HTML), so no parsing needed.
Price is in the smallest currency unit (295000 = ₹2,950 INR).
Images use a `{width}` placeholder in the URL — replace with desired px width.
"""

from __future__ import annotations

import json
import logging
import re
from urllib.parse import parse_qs, urlparse

from playwright.async_api import Page

from scraper.base import BaseScraper

log = logging.getLogger(__name__)

IMAGE_WIDTH = 2048


class ZaraScraper(BaseScraper):
    brand_slug = "zara"
    base_url = "https://www.zara.com"

    REGION_MAP = {
        "in": {"region": "in", "lang": "en", "currency": "INR"},
        "us": {"region": "us", "lang": "en", "currency": "USD"},
        "gb": {"region": "uk", "lang": "en", "currency": "GBP"},
        "es": {"region": "es", "lang": "en", "currency": "EUR"},
        "cn": {"region": "cn", "lang": "zh", "currency": "CNY"},
    }

    def __init__(self, *, region: str = "in", **kwargs):
        super().__init__(**kwargs)
        self.region = region
        rc = self.REGION_MAP.get(region, {"region": region, "lang": "en", "currency": "INR"})
        self._region_code = rc["region"]
        self._lang = rc["lang"]
        self._currency = rc["currency"]

    def _parse_category_url(self, url: str) -> tuple[str, str]:
        """Extract categoryId and regionGroupId from a Zara category URL."""
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        category_id = qs.get("v1", [None])[0]
        region_group_id = qs.get("regionGroupId", [None])[0]

        if not category_id:
            m = re.search(r"-l(\d+)\.html", parsed.path)
            if m:
                seo_id = m.group(1)
                log.info("Extracted seoId %s from path (will use v1 param for categoryId)", seo_id)

        return category_id or "", region_group_id or ""

    async def scrape_listing(self, category_url: str) -> list[dict]:
        category_id, region_group_id = self._parse_category_url(category_url)
        if not category_id:
            raise ValueError(f"Cannot extract categoryId from {category_url}")

        log.info("Loading category page to extract product data")

        page = await self.new_page()
        try:
            await page.goto(category_url, wait_until="domcontentloaded", timeout=30000)
            # wait for Zara's JS app to hydrate
            await page.wait_for_timeout(8000)

            data = await page.evaluate("""
                () => {
                    const vp = window.zara && window.zara.viewPayload;
                    if (!vp) return null;
                    return vp;
                }
            """)
            if not data:
                raise RuntimeError("No viewPayload found on category page")
            log.info("Extracted viewPayload from category page")
        finally:
            await page.close()

        # category page viewPayload has product groups in a different shape
        # fall back to finding product links from the page if needed
        product_groups = data.get("productGroups") or []
        if not product_groups:
            product_groups = (data.get("entities", {}) or {}).get("productGroups", [])
        if not product_groups:
            # try the products key directly
            raw_products = data.get("products") or []
            if raw_products:
                product_groups = [{"elements": [{"commercialComponents": raw_products}]}]

        stubs = []
        for group in data.get("productGroups", []):
            for element in group.get("elements", []):
                for cc in element.get("commercialComponents", []):
                    if cc.get("type") != "Product":
                        continue
                    color = (cc.get("detail", {}).get("colors") or [{}])[0]
                    stub = {
                        "product_id": cc.get("id"),
                        "reference": cc.get("detail", {}).get("displayReference"),
                        "name": cc.get("name"),
                        "price": cc.get("price"),
                        "currency": self._currency,
                        "section_name": cc.get("sectionName"),
                        "family_name": cc.get("familyName"),
                        "subfamily_name": cc.get("subfamilyName"),
                        "seo_keyword": cc.get("seo", {}).get("keyword"),
                        "seo_product_id": cc.get("seo", {}).get("seoProductId"),
                        "color_name": color.get("name"),
                        "color_id": color.get("id"),
                        "availability": cc.get("availability"),
                        "tags": [t.get("type") for t in cc.get("tagTypes", [])],
                        "available_colors": cc.get("availableColors", []),
                        "url": self._product_url(cc),
                    }
                    stubs.append(stub)

        # dedup: color variants of the same product share the same seo_product_id
        # and URL — keep only the first occurrence to avoid scraping the same page
        seen_urls = set()
        unique = []
        for s in stubs:
            if s["url"] not in seen_urls:
                seen_urls.add(s["url"])
                unique.append(s)
        if len(unique) < len(stubs):
            log.info("Deduped listing: %d → %d unique products (%d color variants removed)",
                     len(stubs), len(unique), len(stubs) - len(unique))
        else:
            log.info("Listing returned %d products", len(unique))
        return unique

    def _product_url(self, cc: dict) -> str:
        kw = cc.get("seo", {}).get("keyword", "product")
        pid = cc.get("seo", {}).get("seoProductId", "")
        return f"{self.base_url}/{self._region_code}/{self._lang}/{kw}-p{pid}.html"

    async def scrape_product(self, page: Page, stub: dict) -> dict | None:
        url = stub["url"]
        log.info("Loading product: %s", url)

        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(6000)

        raw = await page.evaluate("""
            () => {
                const vp = window.zara && window.zara.viewPayload;
                if (!vp || !vp.product) return null;
                const p = vp.product;
                const color = (p.detail.colors || [])[0] || {};
                return {
                    id: p.id,
                    name: p.name,
                    reference: p.detail.reference,
                    display_reference: p.detail.displayReference,
                    type: p.type,
                    kind: p.kind,
                    section: p.section,
                    section_name: p.sectionName,
                    family_name: p.familyName,
                    subfamily_name: p.subfamilyName,
                    first_visible_date: p.firstVisibleDate,
                    seo: p.seo,
                    attributes: p.attributes,
                    product_tag: p.productTag,
                    detailed_composition: p.detail.detailedComposition,
                    color_selector_label: p.detail.colorSelectorLabel,
                    colors: (p.detail.colors || []).map(c => ({
                        id: c.id,
                        name: c.name,
                        hex_code: c.hexCode,
                        product_id: c.productId,
                        price: c.price,
                        availability: c.availability,
                        images: (c.xmedia || []).map(x => ({
                            kind: x.kind,
                            original_name: x.extraInfo && x.extraInfo.originalName,
                            width: x.width,
                            height: x.height,
                            url: x.url,
                            delivery_url: x.extraInfo && x.extraInfo.deliveryUrl,
                        })),
                    })),
                };
            }
        """)

        if not raw:
            log.warning("No product data found on %s", url)
            return None

        raw["source_url"] = url
        raw["region"] = self.region
        raw["currency"] = self._currency

        # resolve image URLs
        for color in raw.get("colors", []):
            for img in color.get("images", []):
                if img.get("url"):
                    img["resolved_url"] = img["url"].replace("{width}", str(IMAGE_WIDTH))

        return raw
