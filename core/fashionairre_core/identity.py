"""Deterministic identity: brand slug, collection-name parsing, collection_id.

Same rules whatever the source, so the same show from two sources resolves to
the same ids (`look_id` reconciles the image half and the text half of a look).
"""

from __future__ import annotations

import re

SEASON_RANK = {"spring": 1, "fall": 2, "resort": 3, "pre-fall": 4, "couture": 5, "menswear": 6}


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


def normalize_category(s: str) -> str:
    s = (s or "").lower()
    if "ready" in s or "rtw" in s:
        return "RTW"
    if "couture" in s:
        return "Couture"
    if "resort" in s:
        return "Resort"
    if "pre" in s and "fall" in s:
        return "Pre-Fall"
    if "men" in s:
        return "Menswear"
    return s.upper() or "RTW"


def parse_collection_name(name: str) -> tuple[str, int | None, str]:
    """'Spring-2026-ready-to-wear' / 'fall-2024-ready-to-wear' / 'Spring_2026_Couture'
    -> ('Spring', 2026, 'RTW')."""
    parts = [p for p in re.split(r"[-_ ]+", (name or "").strip()) if p]
    season = parts[0].title() if parts else "Unknown"
    year = next((int(p) for p in parts if p.isdigit() and len(p) == 4), None)
    rest = " ".join(p for p in parts[1:] if not (p.isdigit() and len(p) == 4))
    return season, year, normalize_category(rest)


def collection_id(brand_slug: str, season: str, year: int | None, category: str) -> str:
    return f"{brand_slug}-{season.lower()}-{year}-{category.lower()}"


def look_id(brand_slug: str, coll_id: str, look_number) -> str:
    return f"{brand_slug}:{coll_id}:{look_number}"


def product_id(brand_slug: str, sku: str) -> str:
    """Deterministic ID for a retail product (no collection/look_number)."""
    return f"{brand_slug}:product:{sku}"


def season_order(year: int | None, season: str) -> int:
    return (year or 0) * 10 + SEASON_RANK.get((season or "").lower(), 9)
