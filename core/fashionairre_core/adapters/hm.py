"""H&M adapter — raw scraped H&M product → canonical Look.

H&M gives us richer alt-text than Zara — every image carries an editorial
description of what's visible ("beige and dark check pattern, balloon sleeves…").
We concatenate these into the look_level.silhouette_description so the tagger
has full visual context.
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

# H&M composition strings look like: "Cotton 56%, Polyester 42%, Elastane 2%"
_FIBER_ITEM_RE = re.compile(r"([A-Za-z][A-Za-z /-]*?)\s+(\d{1,3})\s*%")


def _parse_composition(compositions: list[str]) -> tuple[list[FiberContent], list[Fabric]]:
    fibers: list[FiberContent] = []
    fabrics: list[Fabric] = []
    for comp_str in compositions or []:
        for m in _FIBER_ITEM_RE.finditer(comp_str):
            material = m.group(1).strip().lower()
            pct = float(m.group(2))
            fibers.append(FiberContent(fiber=material, pct=pct))
            fabrics.append(Fabric(
                material=material,
                description=f"{material} {pct:.0f}%",
                evidence=f"{material} {pct:.0f}%",
                confidence=1.0,
            ))
    return fibers, fabrics


def _resolve_img(img: dict, width: int = 2160) -> str | None:
    base = img.get("resolved_url") or img.get("baseUrl") or img.get("image")
    if not base:
        return None
    if base.startswith("//"):
        base = "https:" + base
    if "imwidth" in base:
        return re.sub(r"imwidth=\d+", f"imwidth={width}", base)
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}imwidth={width}"


def _image_role(asset_type: str | None) -> str:
    at = (asset_type or "").upper()
    if at in {"LOOKBOOK", "DEFAULT"}:
        return "product_front"
    if at in {"DESCRIPTIVESTILLLIFE", "DESCRIPTIVEDETAIL"}:
        return "product_detail"
    return "product_detail"


def _category_path(product: dict) -> list[str]:
    parts: list[str] = []
    bc = product.get("breadcrumbs")
    if isinstance(bc, list):
        for x in bc:
            name = x.get("name") if isinstance(x, dict) else str(x)
            if name:
                parts.append(name)
    if not parts and product.get("main_category"):
        parts = product["main_category"].replace("_", " ").split()
    return parts


def _infer_season_from_concept(concept: list[str]) -> str | None:
    for c in concept or []:
        s = str(c).lower()
        if "spring" in s: return "Spring"
        if "summer" in s: return "Summer"
        if "fall" in s or "autumn" in s: return "Fall"
        if "winter" in s: return "Winter"
    return None


def parse_product(raw_doc: dict) -> Look | None:
    """Convert an H&M scraper output document → canonical Look."""
    product = raw_doc.get("product", raw_doc)
    aid = product.get("article_id") or product.get("articleCode")
    name = product.get("product_name") or product.get("name")
    if not aid or not name:
        return None

    lid = identity.product_id("hm", aid)
    region = raw_doc.get("region", product.get("region", "in"))
    currency = product.get("price_currency") or "INR"

    # composition → fibers + fabrics
    fibers, fabrics = _parse_composition(product.get("compositions") or [])

    # colors: primary variant first, then all others
    color_palette: list[ColorSwatch] = []
    seen_names: set[str] = set()
    primary_name = product.get("name")  # H&M's "name" here is the color-descriptor
    primary_hex = product.get("rgb") or (product.get("swatch") or {}).get("hex")
    if primary_name and primary_name not in seen_names:
        seen_names.add(primary_name)
        color_palette.append(ColorSwatch(
            name=primary_name,
            hex=primary_hex,
            role="dominant",
            confidence=1.0,
        ))
    for v in product.get("variants") or []:
        cn = v.get("color_name")
        if not cn or cn in seen_names:
            continue
        seen_names.add(cn)
        color_palette.append(ColorSwatch(
            name=cn,
            hex=v.get("hex") or (v.get("swatch") or {}).get("hex"),
            role="accent",
            confidence=1.0,
        ))

    # garment
    garment_type = normalize_garment_type(name)
    garment = Garment(
        garment_id="g0",
        piece=name,
        garment_type=garment_type,
        composition=fibers,
        color_palette=color_palette,
        fabrics=fabrics,
    )

    # images: primary variant tagged as c0, each additional variant as c1, c2 …
    images: list[Image] = []
    for ii, img in enumerate(product.get("images") or []):
        url = _resolve_img(img)
        if not url:
            continue
        images.append(Image(
            image_id=f"c0_img{ii}",
            role=_image_role(img.get("assetType")),
            kind="image_url",
            url=url,
            description=f"{primary_name} / {img.get('altText') or img.get('assetType') or ''}".strip(" /"),
        ))
    for vi, v in enumerate(product.get("variants") or [], start=1):
        cname = v.get("color_name") or f"variant_{vi}"
        for ii, img in enumerate(v.get("images") or []):
            url = _resolve_img(img)
            if not url:
                continue
            images.append(Image(
                image_id=f"c{vi}_img{ii}",
                role=_image_role(img.get("assetType")),
                kind="image_url",
                url=url,
                description=f"{cname} / {img.get('altText') or img.get('assetType') or ''}".strip(" /"),
            ))

    # price
    price = None
    pv = product.get("price_value")
    if pv is not None:
        try:
            price = Price(amount=float(pv), currency=currency)
        except (TypeError, ValueError):
            price = None

    # H&M's alt-text descriptions are our richest text signal — concatenate them
    alt_descriptions = []
    for img in product.get("images") or []:
        at = img.get("altText")
        if at and len(at) > 30:  # skip short/generic captions
            alt_descriptions.append(at)
    swatch_alt = (product.get("swatch") or {}).get("altText")
    if swatch_alt:
        alt_descriptions.insert(0, swatch_alt)

    silhouette_desc = product.get("description") or ""
    if alt_descriptions:
        silhouette_desc = (silhouette_desc + " " + " ".join(alt_descriptions[:3])).strip()

    look_level = LookLevel(
        silhouette_description=silhouette_desc,
        color_story=[c.name for c in color_palette],
    )

    category_path = _category_path(product)

    return Look(
        look_id=lid,
        source=Source(
            type="hm",
            source_url=product.get("source_url") or product.get("url"),
            source_ref=aid,
            captured_at=raw_doc.get("scraped_at"),
            extra={
                "content_hash": raw_doc.get("content_hash"),
                "region": region,
                "base_product_code": product.get("base_product_code"),
                "product_key": product.get("product_key"),
                "main_category": product.get("main_category"),
                "concept": product.get("concept"),
                "care_instructions": product.get("care_instructions"),
                "material_information": product.get("material_information"),
                "product_attributes": product.get("product_attributes"),
                "variants": [
                    {
                        "article_id": v.get("article_id"),
                        "color_name": v.get("color_name"),
                        "hex_code": v.get("hex"),
                        "url": v.get("url"),
                        "image_count": len(v.get("images") or []),
                    }
                    for v in (product.get("variants") or [])
                ],
            },
        ),
        context=Context(
            brand="H&M",
            brand_slug="hm",
            garment_type=garment_type,
            product_id=aid,
            price=price,
            category_path=category_path,
            season=_infer_season_from_concept(product.get("concept") or []),
            provenance_confidence="stated",
        ),
        images=images,
        native_text={
            "product_name": name,
            "description": product.get("description"),
            "color_name": primary_name,
            "concept": product.get("concept"),
            "care_instructions": product.get("care_instructions"),
            "attributes": product.get("product_attributes"),
            "image_alt_texts": [i.get("altText") for i in (product.get("images") or []) if i.get("altText")],
        },
        extraction=Extraction(garments=[garment], look_level=look_level),
        meta=Meta(scraper_ver="hm-v1", scraped_at=raw_doc.get("scraped_at")),
    )
