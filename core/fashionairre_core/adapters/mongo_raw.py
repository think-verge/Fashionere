"""mongo_raw adapter — one `Fashionere.Raw Data` doc → canonical `Look`.

The raw docs are attribute-rich (Colors+hex+pantone, fabric, theme, patterns,
keywords) AND carry direct image URLs (`runway_img_asset`, `details_img_asset`).
So a canonical record built here serves BOTH engines: trend reads the look-level
attributes directly; deconstruction downloads the image URLs and re-extracts
per-garment swatches. Attributes are look-level → one garment with `piece=None`.
"""

from __future__ import annotations

from fashionairre_core import identity
from fashionairre_core.schema import (
    ColorSwatch,
    Context,
    Extraction,
    Fabric,
    Garment,
    Image,
    LookLevel,
    Look,
    Meta,
    Pattern,
    Source,
    ThemeTag,
)


def is_ingestable(raw: dict) -> bool:
    """Skip unmatched-detail fragments and docs with no attributes at all."""
    if raw.get("is_unmatched_detail"):
        return False
    return bool(raw.get("Colors") or raw.get("fabric") or raw.get("theme"))


def _image(image_id, role, asset, page, desc) -> Image | None:
    if not (asset or page):
        return None
    return Image(
        image_id=image_id, role=role,
        kind="image_url" if asset else "page_link",
        url=asset or None, source_page=page or None,
        description=desc or None,
    )


def parse_look(raw: dict, *, default_source: str = "vogue") -> Look:
    designer = raw.get("designer") or "Unknown"
    brand_slug = identity.slugify(designer)
    season, year, category = identity.parse_collection_name(raw.get("collection_name", ""))
    cid = identity.collection_id(brand_slug, season, year, category)
    look_no = raw.get("look_number") or 0
    lid = identity.look_id(brand_slug, cid, look_no)

    # images (direct asset URL preferred; page link kept as provenance)
    images: list[Image] = []
    run = _image("img0", "runway", raw.get("runway_img_asset"), raw.get("runway_img"),
                 raw.get("image_description") or raw.get("runway_img_alt"))
    if run:
        images.append(run)
    for i, di in enumerate(raw.get("details_images") or [], start=1):
        det = _image(f"img{i}", "detail", di.get("details_img_asset"), di.get("details_img_url"),
                     di.get("image_description") or di.get("details_img_alt"))
        if det:
            images.append(det)

    # extraction — look-level attributes → one garment (piece=None)
    colors = [
        ColorSwatch(name=c.get("color_name") or "", hex=c.get("hex_code"),
                    pantone=c.get("pantone_code"),
                    role="dominant" if j == 0 else "accent", confidence=1.0)
        for j, c in enumerate(raw.get("Colors") or [])
    ]
    fabrics = []
    if raw.get("fabric"):
        fabrics.append(Fabric(material=raw["fabric"], description=raw["fabric"],
                              evidence=raw["fabric"], confidence=0.7))
    patterns = [
        Pattern(motif=p, description=p, repeat_type="none")
        for p in (raw.get("patterns") or []) if isinstance(p, str) and p
    ]
    garment = Garment(garment_id="g0", piece=None, color_palette=colors,
                      fabrics=fabrics, patterns=patterns)
    themes = [ThemeTag(value=raw["theme"], evidence=raw["theme"], confidence=0.7)] if raw.get("theme") else []
    look_level = LookLevel(silhouette_description=raw.get("image_description"),
                           color_story=[c.name for c in colors], themes=themes, details=[])

    return Look(
        look_id=lid,
        source=Source(
            type=raw.get("source") or default_source,
            source_url=raw.get("source_url"),
            source_ref=raw.get("look_id"),
            extra={"raw_look_id": raw.get("look_id"), "content_hash": raw.get("content_hash")},
        ),
        context=Context(brand=designer, brand_slug=brand_slug, collection_id=cid,
                        collection_name=raw.get("collection_name"), season=season, year=year,
                        category=category, provenance_confidence="stated"),
        images=images,
        native_text={
            "keywords": raw.get("keywords") or [],
            "collection_keywords": raw.get("collection_keywords") or [],
            "summary": raw.get("summary"),
            "image_description": raw.get("image_description"),
        },
        extraction=Extraction(garments=[garment], look_level=look_level),
        meta=Meta(scraper_ver="mongo-raw"),
    )
