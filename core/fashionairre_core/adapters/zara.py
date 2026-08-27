"""Zara adapter — one raw scraped Zara product → canonical `Look`.

Maps Zara's internal JSON structure to the canonical schema:
  - detailedComposition.parts[].components → FiberContent + Fabric
  - colors[].images → Image list
  - familyName/subfamilyName → native_text (Zara's internal taxonomy)
  - seo.description → silhouette_description
  - price (in smallest currency unit) → Price object
  - seo.keyword category path → category_path
"""

from __future__ import annotations

import re

from fashionairre_core import identity
from fashionairre_core.normalize_garment_type import normalize as normalize_garment_type
from fashionairre_core.schema import (
    ColorSwatch,
    Context,
    Extraction,
    Fabric,
    FiberContent,
    Garment,
    Image,
    Look,
    LookLevel,
    Meta,
    Price,
    Source,
)


def _parse_percentage(s: str) -> float | None:
    m = re.search(r"(\d+)", s or "")
    return float(m.group(1)) if m else None


def _parse_composition(detailed: dict | None) -> tuple[list[FiberContent], list[Fabric]]:
    if not detailed:
        return [], []

    fibers = []
    fabrics = []
    for part in detailed.get("parts", []):
        part_desc = part.get("description", "")
        for comp in part.get("components", []):
            material = comp.get("material", "")
            pct = _parse_percentage(comp.get("percentage"))
            if material:
                fibers.append(FiberContent(fiber=material.lower(), pct=pct))
                fabrics.append(Fabric(
                    material=material.lower(),
                    description=f"{part_desc}: {comp.get('percentage', '')} {material}".strip(": "),
                    evidence=f"{comp.get('percentage', '')} {material}".strip(),
                    confidence=1.0,
                ))

    return fibers, fabrics


def _price_from_raw(raw_price: int | None, currency: str) -> Price | None:
    if raw_price is None:
        return None
    divisors = {"INR": 100, "USD": 100, "EUR": 100, "GBP": 100, "CNY": 100}
    divisor = divisors.get(currency, 100)
    return Price(amount=raw_price / divisor, currency=currency)


def _clean_description(html: str | None) -> str | None:
    if not html:
        return None
    text = re.sub(r"<br\s*/?>", " ", html)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip() or None


def parse_product(raw_doc: dict) -> Look | None:
    """Convert a raw Zara scraper output document into a canonical Look."""
    product = raw_doc.get("product", raw_doc)
    if not product.get("name"):
        return None

    region = raw_doc.get("region", "in")
    currency = raw_doc.get("currency") or product.get("currency", "INR")
    reference = product.get("display_reference", "")
    sku = reference.replace("/", "-") if reference else str(product.get("id", ""))
    lid = identity.product_id("zara", sku)

    # composition
    fibers, fabrics = _parse_composition(product.get("detailed_composition"))

    # garment type from product name
    product_name = product.get("name", "")
    garment_type = normalize_garment_type(product_name)

    # all color variants → one color palette with all variants
    colors_data = product.get("colors", [])
    color_palette = []
    for ci, color in enumerate(colors_data):
        if color.get("name"):
            color_palette.append(ColorSwatch(
                name=color["name"],
                hex=color.get("hex_code"),
                role="dominant" if ci == 0 else "accent",
                confidence=1.0,
            ))

    garment = Garment(
        garment_id="g0",
        piece=product_name,
        garment_type=garment_type,
        composition=fibers,
        color_palette=color_palette,
        fabrics=fabrics,
    )

    # images from all color variants — tagged by variant index
    images = []
    for ci, color in enumerate(colors_data):
        color_name = color.get("name", f"color_{ci}")
        for ii, img in enumerate(color.get("images", [])):
            url = img.get("resolved_url") or img.get("delivery_url") or img.get("url")
            if not url:
                continue
            role = "product_front" if img.get("original_name") == "p" else "product_detail"
            images.append(Image(
                image_id=f"c{ci}_img{ii}",
                role=role,
                kind="image_url",
                url=url,
                description=f"{color_name} / {img.get('original_name', '')}",
            ))

    # price from first variant (all variants share the same base price)
    first_color = colors_data[0] if colors_data else {}
    price = _price_from_raw(first_color.get("price") or product.get("price"), currency)

    # category path from seo keyword + section + family
    section_name = product.get("section_name", "")
    family = product.get("family_name", "")
    category_path = [p for p in [section_name, family] if p]

    # description
    description = _clean_description(
        product.get("seo", {}).get("description")
    )

    look_level = LookLevel(
        silhouette_description=description,
        color_story=[c.name for c in color_palette],
    )

    return Look(
        look_id=lid,
        source=Source(
            type="zara",
            source_url=product.get("source_url"),
            source_ref=product.get("reference"),
            captured_at=raw_doc.get("scraped_at"),
            extra={
                "content_hash": raw_doc.get("content_hash"),
                "region": region,
                "seo_product_id": product.get("seo", {}).get("seoProductId"),
                "first_visible_date": product.get("first_visible_date"),
                "family_name": product.get("family_name"),
                "subfamily_name": product.get("subfamily_name"),
                "variants": [
                    {
                        "color_id": c.get("id"),
                        "color_name": c.get("name"),
                        "hex_code": c.get("hex_code"),
                        "product_id": c.get("product_id"),
                        "availability": c.get("availability"),
                        "image_count": len(c.get("images", [])),
                    }
                    for c in colors_data
                ],
            },
        ),
        context=Context(
            brand="Zara",
            brand_slug="zara",
            product_id=sku,
            price=price,
            category_path=category_path,
            season=_infer_season(product.get("first_visible_date")),
            provenance_confidence="stated",
        ),
        images=images,
        native_text={
            "product_name": product_name,
            "description": description,
            "family_name": product.get("family_name"),
            "subfamily_name": product.get("subfamily_name"),
            "attributes": product.get("attributes", []),
            "tags": product.get("product_tag", []),
        },
        extraction=Extraction(garments=[garment], look_level=look_level),
        meta=Meta(scraper_ver="zara-v1", scraped_at=raw_doc.get("scraped_at")),
    )


def _infer_season(first_visible: str | None) -> str | None:
    if not first_visible:
        return None
    m = re.match(r"(\d{4})-(\d{2})", first_visible)
    if not m:
        return None
    month = int(m.group(2))
    if month <= 3:
        return "Spring"
    elif month <= 6:
        return "Summer"
    elif month <= 9:
        return "Fall"
    return "Winter"
