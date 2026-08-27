"""Brand identity resolution — maps any source's brand token to a canonical
(name, slug). Unknown brands are derived on the fly so ingestion works for any
brand, not just those pre-registered. See DESIGN.md §6.3.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_BRANDS_FILE = Path(__file__).with_name("brands.json")


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").strip().lower()).strip("-")
    return s or "unknown"


def _titleize(slug: str) -> str:
    return " ".join(w.capitalize() for w in slug.split("-")) or "Unknown"


@lru_cache(maxsize=1)
def _load() -> dict:
    with open(_BRANDS_FILE, encoding="utf-8") as fh:
        return json.load(fh)


def _find_brand(key: str, source: str | None = None) -> dict | None:
    """Find a brand entry by slug, alias, or source-specific name."""
    key = (key or "").strip().lower()
    for b in _load().get("brands", []):
        if key and key == b["slug"]:
            return b
        if key in {a.lower() for a in b.get("aliases", [])}:
            return b
        if source and b.get("source_names", {}).get(source, "").lower() == key and key:
            return b
    return None


def resolve_brand(raw_key: str, source: str | None = None) -> tuple[str, str]:
    """Return (canonical_name, slug) for a source brand token like 'prada'."""
    b = _find_brand(raw_key, source)
    if b:
        return b["canonical_name"], b["slug"]
    slug = slugify(raw_key)
    return _titleize(slug), slug


def brand_tier(raw_key: str) -> str | None:
    """Return 'luxury', 'premium', or 'retail' for a known brand; None otherwise."""
    b = _find_brand(raw_key)
    return b.get("tier") if b else None


def brands_by_tier(tier: str) -> list[dict]:
    """Return all brand entries for a tier ('luxury', 'premium', 'retail')."""
    return [b for b in _load().get("brands", []) if b.get("tier") == tier]


def all_brands() -> list[dict]:
    """Return every registered brand entry."""
    return list(_load().get("brands", []))
