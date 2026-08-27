"""Card assembly — the heart of the app read model.

Takes a canonical_looks doc (+ optional deconstruction doc) and returns the
unified Card the frontend consumes. When deconstruction is present, its
extracted visual assets override or supplement the categorical tags."""

from __future__ import annotations

from typing import Optional

from ..models import (
    Card,
    CardSummary,
    ColorRef,
    FabricRef,
    GarmentBreakdown,
    ImageRef,
    PatternRef,
    PriceRef,
    TagRef,
)

RETAIL_SOURCES = {"zara", "hm", "mango", "uniqlo", "cos", "asos"}

ASSETS_PATH = "/api/v1/assets"  # matches routes/assets.py


def _asset_url(gridfs_id: str | None) -> str | None:
    return f"{ASSETS_PATH}/{gridfs_id}" if gridfs_id else None


def _source_type(canonical: dict) -> str:
    st = (canonical.get("source") or {}).get("type", "").lower()
    if st in RETAIL_SOURCES:
        return "retail"
    return "runway"


def _thumbnail(canonical: dict) -> Optional[str]:
    imgs = canonical.get("images") or []
    for img in imgs:
        if (img.get("role") == "product_front") or img.get("image_id", "").endswith("_img0"):
            return img.get("url")
    return imgs[0].get("url") if imgs else None


def _dominant_color(tags: dict) -> Optional[ColorRef]:
    for c in (tags or {}).get("colors") or []:
        if c.get("role") == "dominant":
            return ColorRef(
                name=c.get("name", ""),
                hex=c.get("hex"),
                pantone=c.get("pantone"),
                family=c.get("family"),
                role=c.get("role"),
            )
    # fall back to the first color
    for c in (tags or {}).get("colors") or []:
        return ColorRef(
            name=c.get("name", ""), hex=c.get("hex"), pantone=c.get("pantone"),
            family=c.get("family"), role=c.get("role"),
        )
    return None


def summary_from_canonical(canonical: dict, deconstructed: bool = False) -> CardSummary:
    ctx = canonical.get("context") or {}
    tags = canonical.get("tags") or {}
    price = None
    if ctx.get("price"):
        price = PriceRef(
            amount=ctx["price"].get("amount", 0.0),
            currency=ctx["price"].get("currency", ""),
        )
    return CardSummary(
        look_id=canonical["look_id"],
        brand=ctx.get("brand", ""),
        brand_slug=ctx.get("brand_slug", ""),
        piece=_piece_name(canonical),
        garment_type=_primary_garment_type(canonical),
        source_type=_source_type(canonical),
        is_deconstructed=deconstructed,
        thumbnail_url=_thumbnail(canonical),
        dominant_color=_dominant_color(tags),
        price=price,
        season=ctx.get("season"),
        year=ctx.get("year"),
    )


def _piece_name(canonical: dict) -> Optional[str]:
    # retail products get their name from native_text.product_name;
    # runway garments come from extraction.garments[0].piece
    nt = canonical.get("native_text") or {}
    if nt.get("product_name"):
        return nt["product_name"]
    for g in (canonical.get("extraction") or {}).get("garments") or []:
        if g.get("piece"):
            return g["piece"]
    return None


def _primary_garment_type(canonical: dict) -> Optional[str]:
    garments = (canonical.get("extraction") or {}).get("garments") or []
    for g in garments:
        if g.get("garment_type"):
            return g["garment_type"]
    return None


def _colors_from_deconstruction(decon: dict) -> list[ColorRef]:
    """Deconstruction stores per-garment sampled colors as {hex, weight}.
    Merge across garments, dedup by hex, keep the highest weight."""
    by_hex: dict[str, ColorRef] = {}
    for g in decon.get("garments") or []:
        for c in g.get("colors") or []:
            hx = (c.get("hex") or "").lower()
            if not hx:
                continue
            existing = by_hex.get(hx)
            w = float(c.get("weight") or 0.0)
            if existing and (existing.weight or 0.0) >= w:
                continue
            by_hex[hx] = ColorRef(
                hex=c.get("hex"),
                weight=w or None,
                name=c.get("name"),
                pantone=c.get("pantone"),
                family=c.get("family"),
                role="dominant" if w >= 0.4 else "accent",
            )
    return sorted(by_hex.values(), key=lambda c: -(c.weight or 0.0))


def _colors_from_tags(canonical: dict) -> list[ColorRef]:
    out: list[ColorRef] = []
    for c in (canonical.get("tags") or {}).get("colors") or []:
        out.append(ColorRef(
            name=c.get("name", ""),
            hex=c.get("hex"),
            pantone=c.get("pantone"),
            family=c.get("family"),
            role=c.get("role"),
        ))
    return out


def _fabrics_from_tags(canonical: dict) -> list[FabricRef]:
    out: list[FabricRef] = []
    for f in (canonical.get("tags") or {}).get("fabrics") or []:
        out.append(FabricRef(
            value=f.get("value"),
            material=f.get("material"),
            part=f.get("garment") or f.get("part"),
        ))
    return out


def _fibers_from_tags(canonical: dict) -> list[FabricRef]:
    out: list[FabricRef] = []
    for f in (canonical.get("tags") or {}).get("fibers") or []:
        out.append(FabricRef(
            value=f.get("value"),
            material=f.get("value"),
            percentage=f.get("percentage"),
            part=f.get("part"),
        ))
    return out


def _patterns_from_deconstruction(decon: dict) -> list[PatternRef]:
    """Deconstruction stores at most one `pattern` per garment (dict with gridfs_id + motif)."""
    out: list[PatternRef] = []
    for g in decon.get("garments") or []:
        p = g.get("pattern")
        if not p:
            continue
        out.append(PatternRef(
            value=p.get("value"),
            motif=p.get("motif") or p.get("kind"),
            tile_url=_asset_url(p.get("gridfs_id")),
        ))
    return out


def _garment_breakdowns(decon: dict) -> list[GarmentBreakdown]:
    """Per-garment slices from a deconstruction doc — bbox + colors + fabric + pattern."""
    out: list[GarmentBreakdown] = []
    for g in decon.get("garments") or []:
        colors = [
            ColorRef(
                hex=c.get("hex"),
                weight=float(c.get("weight")) if c.get("weight") is not None else None,
                role="dominant" if float(c.get("weight") or 0.0) >= 0.4 else "accent",
            )
            for c in (g.get("colors") or []) if c.get("hex")
        ]
        fab = g.get("fabric") or {}
        pat = g.get("pattern") or {}
        out.append(GarmentBreakdown(
            garment_id=g.get("garment_id", ""),
            piece=g.get("piece"),
            garment_type=g.get("garment_type"),
            bbox=g.get("bbox"),
            colors=colors,
            materials_candidates=g.get("materials_candidates") or [],
            fabric_macro_url=_asset_url(fab.get("gridfs_id")),
            pattern_tile_url=_asset_url(pat.get("gridfs_id")),
        ))
    return out


def _patterns_from_tags(canonical: dict) -> list[PatternRef]:
    out: list[PatternRef] = []
    for p in (canonical.get("tags") or {}).get("patterns") or []:
        out.append(PatternRef(value=p.get("value"), motif=p.get("motif")))
    return out


def _simple_tags(tag_list: list) -> list[TagRef]:
    return [TagRef(value=t.get("value", ""), evidence=t.get("evidence")) for t in (tag_list or [])]


def _images(canonical: dict) -> list[ImageRef]:
    return [
        ImageRef(
            image_id=img.get("image_id", ""),
            role=img.get("role", ""),
            url=img.get("url", ""),
            description=img.get("description"),
        )
        for img in (canonical.get("images") or []) if img.get("url")
    ]


def _technical_flat_url(decon: dict | None) -> Optional[str]:
    if not decon:
        return None
    # try top-level and per-garment gridfs pointers
    tf = decon.get("technical_flat") or {}
    if isinstance(tf, dict):
        if url := _asset_url(tf.get("gridfs_id")):
            return url
    for g in decon.get("garments") or []:
        tf = g.get("technical_flat") or g.get("flat") or {}
        if isinstance(tf, dict):
            if url := _asset_url(tf.get("gridfs_id")):
                return url
    return None


def build_card(canonical: dict, deconstruction: dict | None = None) -> Card:
    """Build the unified Card. Deconstruction assets take precedence when present."""
    ctx = canonical.get("context") or {}
    tags = canonical.get("tags") or {}

    # colors: prefer deconstructed swatches when available; else fall back to tag colors
    if deconstruction and deconstruction.get("garments"):
        colors = _colors_from_deconstruction(deconstruction) or _colors_from_tags(canonical)
        patterns = _patterns_from_deconstruction(deconstruction) or _patterns_from_tags(canonical)
    else:
        colors = _colors_from_tags(canonical)
        patterns = _patterns_from_tags(canonical)

    price = None
    if ctx.get("price"):
        price = PriceRef(
            amount=ctx["price"].get("amount", 0.0),
            currency=ctx["price"].get("currency", ""),
        )

    return Card(
        look_id=canonical["look_id"],
        brand=ctx.get("brand", ""),
        brand_slug=ctx.get("brand_slug", ""),
        piece=_piece_name(canonical),
        garment_type=_primary_garment_type(canonical),
        is_deconstructed=bool(deconstruction),
        source_type=_source_type(canonical),
        colors=colors,
        fibers=_fibers_from_tags(canonical),
        fabrics=_fabrics_from_tags(canonical),
        patterns=patterns,
        silhouettes=_simple_tags(tags.get("silhouettes")),
        details=_simple_tags(tags.get("details")),
        themes=_simple_tags(tags.get("themes")),
        images=_images(canonical),
        source_runway_url=(deconstruction or {}).get("source_runway_url"),
        garments=_garment_breakdowns(deconstruction) if deconstruction else [],
        technical_flat_url=_technical_flat_url(deconstruction),
        season=ctx.get("season"),
        year=ctx.get("year"),
        category_path=ctx.get("category_path") or [],
        price=price,
        source_url=(canonical.get("source") or {}).get("source_url"),
        description=(
            (canonical.get("native_text") or {}).get("description")
            or ((canonical.get("extraction") or {}).get("look_level") or {}).get("silhouette_description")
        ),
    )
