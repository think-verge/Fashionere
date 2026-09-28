"""Uniqlo adapter — raw scraped Uniqlo product → canonical Look.

Uniqlo's product page state is the richest retail source we've seen:
  - `composition` string with per-part fiber breakdown ("Shell: 100% Polyamide / Lining: ...")
  - `careInstruction`, `washingInformation`
  - `designDetail` (bullet list of design attributes: "Fit: Oversized", "Collar: Stand", ...)
  - `longDescription`, `shortDescription`
  - `tags` (feature keywords)
  - `colors` with images per-color-code
  - `breadcrumbs` for category path
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

# "Shell: 100% Polyamide ( 46% Uses Recycled Polyamide Fiber )/ Lining: 100% Polyester ..."
_PART_RE = re.compile(r"([A-Z][A-Za-z /-]*?):\s*(\d{1,3})\s*%\s*([A-Za-z][A-Za-z /-]+?)(?=\s*[/,(]|\s*$)")
_FIBER_ITEM_RE = re.compile(r"(\d{1,3})\s*%\s*([A-Za-z][A-Za-z /-]+)")


def _parse_composition(comp_str: str | None) -> tuple[list[FiberContent], list[Fabric]]:
    if not comp_str:
        return [], []
    fibers: list[FiberContent] = []
    fabrics: list[Fabric] = []
    for m in _PART_RE.finditer(comp_str):
        part = m.group(1).strip()
        pct = float(m.group(2))
        material = m.group(3).strip().lower()
        fibers.append(FiberContent(fiber=material, pct=pct))
        fabrics.append(Fabric(
            material=material,
            description=f"{part}: {pct:.0f}% {material}",
            evidence=f"{part}: {pct:.0f}% {material}",
            confidence=1.0,
        ))
    if not fibers:
        for m in _FIBER_ITEM_RE.finditer(comp_str):
            pct = float(m.group(1))
            material = m.group(2).strip().lower()
            fibers.append(FiberContent(fiber=material, pct=pct))
            fabrics.append(Fabric(
                material=material, description=f"{pct:.0f}% {material}",
                evidence=f"{pct:.0f}% {material}", confidence=1.0,
            ))
    return fibers, fabrics


def _price_from_prices(prices: dict) -> tuple[float | None, str | None]:
    """Uniqlo `prices` is keyed by priceGroup (`00`, `10`, …) each with base/promo."""
    if not prices:
        return None, None
    default = prices.get("base") or prices.get("00") or next(iter(prices.values()), None)
    if isinstance(default, dict):
        val = default.get("value") or default.get("price") or default.get("base")
        cur = default.get("currency")
        try:
            return float(val), cur
        except (TypeError, ValueError):
            return None, cur
    if isinstance(default, (int, float, str)):
        try:
            return float(default), None
        except (TypeError, ValueError):
            return None, None
    return None, None


def _category_from_breadcrumbs(bc: dict | list) -> list[str]:
    parts: list[str] = []
    if isinstance(bc, dict):
        # breadcrumbs is dict keyed by category level
        for lvl in ("l1", "l2", "l3", "l4"):
            v = bc.get(lvl)
            if isinstance(v, dict):
                n = v.get("name") or v.get("displayName")
                if n: parts.append(n)
            elif isinstance(v, str):
                parts.append(v)
    elif isinstance(bc, list):
        for x in bc:
            if isinstance(x, dict):
                n = x.get("name") or x.get("displayName")
                if n: parts.append(n)
    return parts


def parse_product(raw_doc: dict) -> Look | None:
    product = raw_doc.get("product", raw_doc)
    name = product.get("name")
    pid = product.get("productId") or product.get("_full_product_id")
    if not name or not pid:
        return None

    lid = identity.product_id("uniqlo", pid)
    region = raw_doc.get("region", product.get("region", "in"))
    currency = product.get("currency") or "INR"

    fibers, fabrics = _parse_composition(product.get("composition"))

    # colors → color palette
    color_palette: list[ColorSwatch] = []
    seen_names: set[str] = set()
    for i, c in enumerate(product.get("colors") or []):
        cname = c.get("name")
        if not cname or cname in seen_names:
            continue
        seen_names.add(cname)
        color_palette.append(ColorSwatch(
            name=cname.title() if cname.isupper() else cname,
            hex=None,  # Uniqlo doesn't publish hex per color
            role="dominant" if i == 0 else "accent",
            confidence=1.0,
        ))

    garment = Garment(
        garment_id="g0",
        piece=name,
        garment_type=normalize_garment_type(name),
        composition=fibers,
        color_palette=color_palette,
        fabrics=fabrics,
    )

    # images: main per color + sub images
    images: list[Image] = []
    img_data = product.get("images") or {}
    main = img_data.get("main") or {}
    subs = img_data.get("sub") or []
    for ci, c in enumerate(product.get("colors") or []):
        code = c.get("displayCode") or c.get("code", "").replace("COL", "")
        cname = c.get("name") or f"color_{ci}"
        entry = main.get(code) or main.get(c.get("code", "")) or {}
        url = entry.get("image") if isinstance(entry, dict) else None
        if url:
            images.append(Image(
                image_id=f"c{ci}_img0",
                role="product_front",
                kind="image_url",
                url=url,
                description=f"{cname} / front",
            ))
    # sub images (usually multi-angle for the primary variant)
    for si, s in enumerate(subs or []):
        u = s.get("image") if isinstance(s, dict) else None
        if not u: continue
        cc = s.get("colorCode") or "00"
        images.append(Image(
            image_id=f"sub_{si}",
            role="product_detail",
            kind="image_url",
            url=u,
            description=f"color {cc} / sub{si}",
        ))

    price_val, _ = _price_from_prices(product.get("prices") or {})
    price = Price(amount=price_val, currency=currency) if price_val is not None else None

    # long description + design detail form the richest text signal
    long_desc = product.get("longDescription") or ""
    design_detail = product.get("designDetail") or ""
    silhouette_desc = "\n".join(x for x in [long_desc, design_detail] if x).strip()

    look_level = LookLevel(
        silhouette_description=silhouette_desc,
        color_story=[c.name for c in color_palette],
    )

    category_path = _category_from_breadcrumbs(product.get("breadcrumbs") or {})

    return Look(
        look_id=lid,
        source=Source(
            type="uniqlo",
            source_url=product.get("source_url"),
            source_ref=pid,
            captured_at=raw_doc.get("scraped_at"),
            extra={
                "content_hash": raw_doc.get("content_hash"),
                "region": region,
                "gender_category": product.get("genderCategory"),
                "size_gender": product.get("sizeGender"),
                "care_instruction": product.get("careInstruction"),
                "washing_information": product.get("washingInformation"),
                "recycled_material": product.get("recycledMaterial"),
                "size_information": product.get("sizeInformation"),
                "free_information": product.get("freeInformation"),
                "tags": product.get("tags"),
                "countries_of_origin": product.get("countriesOfOrigin"),
                "variants": [
                    {
                        "color_code": c.get("code"),
                        "display_code": c.get("displayCode"),
                        "color_name": c.get("name"),
                        "filter_code": c.get("filterCode"),
                    }
                    for c in (product.get("colors") or [])
                ],
            },
        ),
        context=Context(
            brand="Uniqlo",
            brand_slug="uniqlo",
            garment_type=normalize_garment_type(name),
            product_id=pid,
            price=price,
            category_path=category_path,
            season=None,
            provenance_confidence="stated",
        ),
        images=images,
        native_text={
            "product_name": name,
            "description": product.get("shortDescription") or product.get("longDescription"),
            "design_detail": product.get("designDetail"),
            "long_description": product.get("longDescription"),
            "tags": product.get("tags"),
            "recycled_material": product.get("recycledMaterial"),
        },
        extraction=Extraction(garments=[garment], look_level=look_level),
        meta=Meta(scraper_ver="uniqlo-v1", scraped_at=raw_doc.get("scraped_at")),
    )
