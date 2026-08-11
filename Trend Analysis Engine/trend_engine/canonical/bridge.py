"""Bridge: a shared-core canonical Look → a trend `Look`, then normalize.

Populates the trend `Look.raw` from the canonical `extraction`, so the EXISTING
normalizer (deterministic colours + LLM vocab attributes) tags it exactly like the
Vogue text path. Nothing in the legacy engine changes.
"""

from __future__ import annotations

from trend_engine.adapters.vogue import _season_order
from trend_engine.normalize.pipeline import normalize_look
from trend_engine.registries.brands import slugify
from trend_engine.schema.look import Images, Look, RawColor, RawLook

# canonical (source of truth) — read-only
from fashionairre_core.schema import Look as CanonLook  # noqa: E402


def _as_canon(clook) -> CanonLook:
    return clook if isinstance(clook, CanonLook) else CanonLook.model_validate(clook)


def look_from_canonical(clook) -> Look:
    """Map a canonical Look into a trend `Look` (with `raw` populated, `tags` empty)."""
    c = _as_canon(clook)
    ctx, ex = c.context, c.extraction

    brand = ctx.brand or "Unknown"
    brand_slug = ctx.brand_slug or slugify(brand)
    season = ctx.season or "Unknown"
    year = ctx.year or 0
    category = ctx.category or "Unknown"
    collection_id = ctx.collection_id or f"{brand_slug}-{slugify(season)}-{year}-{slugify(category)}"
    try:
        look_number = int(str(c.look_id).rsplit(":", 1)[-1])
    except (ValueError, IndexError):
        look_number = 0

    # Flatten the canonical extraction into the trend `raw` text shape.
    colors: list[RawColor] = []
    fabric_bits: list[str] = []
    keywords: list[str] = list(c.native_text.get("keywords") or [])
    if ex:
        for g in ex.garments:
            if g.piece:
                keywords.append(g.piece)
            for col in g.color_palette:
                colors.append(RawColor(name=col.name, hex=col.hex, pantone=col.pantone))
            for f in g.fabrics:
                bit = f.description or f.material
                if bit:
                    fabric_bits.append(f"{bit} ({g.piece})" if g.piece else bit)
            for p in g.patterns:
                if p.motif:
                    keywords.append(p.motif)
                if p.description:
                    keywords.append(p.description)
        keywords += [d.value for d in ex.look_level.details if d.value]
        theme_text = ", ".join(t.value for t in ex.look_level.themes)
        description = ex.look_level.silhouette_description or ""
    else:
        theme_text, description = "", ""

    raw = RawLook(
        description=description,
        fabric_text="; ".join(fabric_bits),
        theme_text=theme_text,
        keywords=keywords,
        colors=colors,
        detail_shots=[],
    )
    return Look(
        look_id=c.look_id, brand=brand, brand_slug=brand_slug,
        source=c.source.type, source_url=c.source.source_url,
        collection_id=collection_id, season=season, year=year, category=category,
        season_order=_season_order(year, season), look_number=look_number,
        images=Images(), raw=raw,
    )


def normalize_from_canonical(clook, *, client=None, do_attributes: bool = True) -> Look:
    """Full path: canonical Look → trend Look → normalized tags (colours + attributes)."""
    look = look_from_canonical(clook)
    return normalize_look(look, do_colors=True, do_attributes=do_attributes, client=client)
