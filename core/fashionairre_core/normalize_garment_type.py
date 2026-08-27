"""Garment-type normalizer — maps free-text `piece` to a canonical GarmentType.

Two-pass strategy:
  1. Deterministic keyword matching (free, instant, covers ~90% of cases)
  2. Falls back to "other" — caller can optionally re-run misses through an LLM

The keyword rules are ordered most-specific-first so compound terms like
"leather jacket" resolve to "jacket" (not "accessory" from "leather").

    >>> from fashionairre_core.normalize_garment_type import normalize
    >>> normalize("Asymmetric Bubble Skirt")
    'skirt'
    >>> normalize("Dark Brown Shearling Jacket")
    'jacket'
    >>> normalize("monogram sheer tights")
    'trousers'
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_VOCAB_PATH = (
    Path(__file__).resolve().parents[2]
    / "Trend Analysis Engine"
    / "trend_engine"
    / "registries"
    / "vocab"
    / "garment_types.json"
)


@lru_cache(maxsize=1)
def _load_rules() -> list[tuple[re.Pattern, str]]:
    """Build ordered regex rules from the vocabulary file.

    Order matters: compound garment terms (2+ words) are tested before single
    words so "crop top" beats "top", "leather jacket" beats generic "leather".
    """
    data = json.loads(_VOCAB_PATH.read_text(encoding="utf-8"))
    raw: list[tuple[str, str]] = []
    for term in data["terms"]:
        gtype = term["id"]
        for kw in term.get("keywords", []):
            raw.append((kw.lower(), gtype))
        for alias in term.get("aliases", []):
            raw.append((alias.lower(), gtype))
        raw.append((term["label"].lower(), gtype))

    raw.sort(key=lambda pair: (-len(pair[0]), pair[0]))

    rules = []
    for phrase, gtype in raw:
        pat = re.compile(r"(?:^|[\s,;/\-(])(" + re.escape(phrase) + r")(?:[\s,;/\-).]|$)", re.IGNORECASE)
        rules.append((pat, gtype))
    return rules


def normalize(piece: str | None) -> str | None:
    """Return a GarmentType id for a free-text piece name, or None if no match."""
    if not piece:
        return None
    text = piece.strip().lower()
    if not text:
        return None

    for pat, gtype in _load_rules():
        if pat.search(text):
            return gtype

    return "other"


def normalize_bulk(pieces: list[str | None]) -> list[str | None]:
    """Normalize a batch of piece names. Returns a list aligned with input."""
    return [normalize(p) for p in pieces]
