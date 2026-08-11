"""vogue_text adapter — the existing pre-scraped Vogue JSON → canonical `Look`.

For legacy text data (e.g. Prada): images are page-links (no files), and the
attribute fields already present in the JSON are mapped in as **free-form**
`extraction` (vocab `value`/`family` stay None — a downstream normalizer fills
them). This source is look-level, so `extraction` holds a single garment with
`piece=None` (whole-look).
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
    Source,
    ThemeTag,
)


def parse_look(raw: dict, *, brand: str = "Prada") -> Look:
    brand_slug = identity.slugify(brand)
    season, year, category = identity.parse_collection_name(raw.get("collection_name", ""))
    cid = identity.collection_id(brand_slug, season, year, category)
    look_no = raw.get("look_number")
    lid = identity.look_id(brand_slug, cid, look_no)

    # images — page-links only (legacy data has no files)
    images: list[Image] = []
    if raw.get("runway_img"):
        images.append(Image(image_id="img0", role="runway", kind="page_link",
                            source_page=raw["runway_img"],
                            description=raw.get("image_description")))
    for i, di in enumerate(raw.get("details_images", []) or [], start=1):
        images.append(Image(image_id=f"img{i}", role="detail", kind="page_link",
                            source_page=di.get("details_img_url"),
                            description=di.get("description")))

    # extraction — look-level → one garment with piece=None
    colors = [
        ColorSwatch(name=c.get("color_name") or "", hex=c.get("hex_code"),
                    pantone=c.get("pantone_code"),
                    role="dominant" if j == 0 else "accent", confidence=1.0)
        for j, c in enumerate(raw.get("Colors", []) or [])
    ]
    fabrics: list[Fabric] = []
    if raw.get("fabric"):
        fabrics.append(Fabric(material=raw["fabric"], description=raw["fabric"],
                              evidence=raw["fabric"], confidence=0.7))
    garment = Garment(garment_id="g0", piece=None, color_palette=colors,
                      fabrics=fabrics, patterns=[])
    themes = [ThemeTag(value=raw["theme"], evidence=raw["theme"], confidence=0.7)] if raw.get("theme") else []
    look_level = LookLevel(
        silhouette_description=raw.get("image_description") or raw.get("description"),
        color_story=[c.name for c in colors], themes=themes, details=[],
    )

    return Look(
        look_id=lid,
        source=Source(type="vogue", source_url=raw.get("source_url"), source_ref=f"{cid}#{look_no}"),
        context=Context(brand=brand, brand_slug=brand_slug, collection_id=cid,
                        collection_name=raw.get("collection_name"), season=season,
                        year=year, category=category, provenance_confidence="stated"),
        images=images,
        native_text={"keywords": raw.get("keywords", []) or [], "summary": raw.get("summary"),
                    "image_description": raw.get("image_description")},
        extraction=Extraction(garments=[garment], look_level=look_level),
        meta=Meta(scraper_ver="vogue-legacy-json"),
    )
