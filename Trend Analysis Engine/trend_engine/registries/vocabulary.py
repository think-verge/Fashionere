"""Loader for the versioned attribute vocabularies (registries/vocab/*.json).

The LLM attribute normalizer is constrained to these ids; anything it can't map
becomes "__unmapped__" and is logged for later vocab growth. See DESIGN.md §8.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_VOCAB_DIR = Path(__file__).with_name("vocab")

# The five LLM-normalized dimensions (color is handled deterministically).
DIMENSIONS = ["fabrics", "patterns", "silhouettes", "themes", "details"]


@lru_cache(maxsize=None)
def load(dimension: str) -> dict:
    path = _VOCAB_DIR / f"{dimension}.json"
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def terms(dimension: str) -> tuple[dict, ...]:
    return tuple(load(dimension)["terms"])


@lru_cache(maxsize=None)
def allowed_ids(dimension: str) -> frozenset[str]:
    return frozenset(t["id"] for t in terms(dimension))


def version(dimension: str) -> str:
    return load(dimension).get("version", "v1")


def prompt_block(dimension: str) -> str:
    """Allowed list for the LLM prompt: `- id (Label; aka alias, ...)` per line."""
    lines = []
    for t in terms(dimension):
        aka = f"; aka {', '.join(t['aliases'])}" if t.get("aliases") else ""
        lines.append(f"- {t['id']} ({t['label']}{aka})")
    return "\n".join(lines)
