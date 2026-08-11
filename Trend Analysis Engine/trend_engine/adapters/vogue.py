"""Vogue Runway adapter — maps the current Vogue mapping JSON into the
canonical model. Handles the known raw-data quirks (DESIGN.md §5.1):
brand from source_url, `Colors` structured array, inconsistent
`collection_name` casing, and the per-look repeated `summary`.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.parse import urlparse

from trend_engine.adapters.base import SourceAdapter
from trend_engine.registries.brands import resolve_brand, slugify
from trend_engine.schema.collection import Collection
from trend_engine.schema.look import (
    DetailImage,
    DetailShot,
    Images,
    Look,
    RawColor,
    RawLook,
    RunwayImage,
)

# Rank orders shows within a year (Spring shown before Fall). Extend for
# Couture/Resort when such data arrives (DESIGN.md §18).
SEASON_RANK = {"spring": 1, "fall": 2, "resort": 3, "pre-fall": 4, "couture": 5, "menswear": 6}
_SEASON_NORM = {
    "spring": "Spring", "fall": "Fall", "autumn": "Fall",
    "pre-fall": "Pre-Fall", "resort": "Resort", "cruise": "Resort",
}
_CATEGORY_MAP = {
    "ready-to-wear": "RTW", "couture": "Couture", "resort": "Resort",
    "pre-fall": "Pre-Fall", "menswear": "Menswear",
}


def _norm_season(raw: str) -> str:
    return _SEASON_NORM.get(raw, raw.replace("-", " ").title() if raw else "Unknown")


def _parse_collection_name(name: str) -> tuple[str, int | None, str]:
    """'Spring-2026-ready-to-wear' -> ('Spring', 2026, 'RTW')."""
    parts = [p for p in (name or "").split("-") if p]
    yidx = next((i for i, p in enumerate(parts) if p.isdigit() and len(p) == 4), None)
    if yidx is None:
        season = _norm_season(parts[0].lower()) if parts else "Unknown"
        return season, None, "Unknown"
    year = int(parts[yidx])
    season = _norm_season("-".join(parts[:yidx]).lower())
    cat_raw = "-".join(parts[yidx + 1:]).lower()
    category = _CATEGORY_MAP.get(cat_raw, cat_raw.replace("-", " ").title() if cat_raw else "Unknown")
    return season, year, category


def _season_order(year: int | None, season: str) -> int:
    return (year or 0) * 10 + SEASON_RANK.get((season or "").lower(), 9)


def _brand_key_from_url(url: str | None) -> str:
    segs = [s for s in urlparse(url or "").path.split("/") if s]
    return segs[-1] if segs else ""


def _colors(raw_list) -> list[RawColor]:
    out: list[RawColor] = []
    for c in raw_list or []:
        if isinstance(c, dict):
            out.append(RawColor(
                name=c.get("color_name") or c.get("name"),
                hex=c.get("hex_code") or c.get("hex"),
                pantone=c.get("pantone_code") or c.get("pantone"),
            ))
        elif isinstance(c, str):
            out.append(RawColor(name=c))
    return out


# Keys a source scraper might use for the direct image-file URL, best first.
_IMG_KEYS = ("runway_img_src", "image_url", "img_src", "image_src", "runway_image_url")
_IMG_RE = re.compile(r"\.(jpg|jpeg|png|webp|avif)(\?|$)", re.I)


def _clean_url(u: str | None) -> str | None:
    # strip copy artifacts: surrounding quotes and a trailing encoded quote (%22)
    if not u:
        return None
    u = u.strip().strip("\"'").replace("%22", "").strip()
    return u or None


def _runway_image(record: dict) -> RunwayImage | None:
    """A direct image URL if the source provides one; otherwise the page link.
    kind='image' means it's embeddable via <img src>; 'page_link' is not."""
    direct = next((_clean_url(record.get(k)) for k in _IMG_KEYS if _clean_url(record.get(k))), None)
    url = direct or _clean_url(record.get("runway_img"))
    if not url:
        return None
    is_image = bool(_IMG_RE.search(url)) or "assets.vogue.com" in url
    return RunwayImage(url=url, kind="image" if is_image else "page_link")


class VogueAdapter(SourceAdapter):
    source_name = "vogue"

    def parse_collection(self, raw, *, file_hint=""):
        if not raw:
            raise ValueError(f"Empty collection file: {file_hint}")
        first = raw[0]
        source = first.get("source", "vogue")
        source_url = first.get("source_url")
        season, year, category = _parse_collection_name(first.get("collection_name", ""))

        brand_key = _brand_key_from_url(source_url)
        if not brand_key and (first.get("designer") or "").lower() not in ("", "unknown"):
            brand_key = first["designer"]
        brand_name, brand_slug = resolve_brand(brand_key, source=source)

        collection_id = f"{brand_slug}-{slugify(season)}-{year}-{slugify(category)}"
        s_order = _season_order(year, season)

        # summary is repeated on every look -> dedupe onto the Collection
        summary = next((r["summary"] for r in raw if r.get("summary")), "")

        looks = [
            self._parse_look(r, brand_name, brand_slug, source, source_url,
                             collection_id, season, year, category, s_order)
            for r in raw
        ]
        collection = Collection(
            collection_id=collection_id, brand=brand_name, brand_slug=brand_slug,
            source=source, source_url=source_url, season=season, year=year or 0,
            category=category, season_order=s_order, summary=summary,
            look_count=len(looks), ingested_at=datetime.now(timezone.utc),
        )
        return collection, looks

    def _parse_look(self, r, brand_name, brand_slug, source, source_url,
                    collection_id, season, year, category, s_order):
        detail_shots, detail_images = [], []
        for d in r.get("details_images") or []:
            detail_shots.append(DetailShot(
                url=d.get("details_img_url"),
                description=d.get("description"),
                fabric_text=d.get("fabric"),
                theme_text=d.get("theme"),
                keywords=list(d.get("keywords") or []),
                colors=_colors(d.get("Colors") or d.get("colors")),
            ))
            detail_images.append(DetailImage(
                url=d.get("details_img_url"), description=d.get("description")))

        raw_look = RawLook(
            description=r.get("image_description"),
            fabric_text=r.get("fabric"),
            theme_text=r.get("theme"),
            keywords=list(r.get("keywords") or []),
            colors=_colors(r.get("Colors") or r.get("colors")),
            detail_shots=detail_shots,
        )
        runway = _runway_image(r)
        look_number = int(r.get("look_number") or 0)
        return Look(
            look_id=f"{brand_slug}:{collection_id}:{look_number}",
            brand=brand_name, brand_slug=brand_slug, source=source, source_url=source_url,
            collection_id=collection_id, season=season, year=year or 0, category=category,
            season_order=s_order, look_number=look_number,
            images=Images(runway=runway, details=detail_images), raw=raw_look,
        )
