"""Assembles pulled/written/generated elements into a Moodboard.

Palette and badges are **pulled** straight from trend data here — never
generated. The composer only arranges; the pipeline drives the model calls.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.models import (
    GeneratedImage,
    Moodboard,
    PaletteSwatch,
    Target,
    TrendBadge,
    TrendObject,
)

_PALETTE_ROLES = ["base", "accent", "contrast"]
_MAX_PALETTE = 6
_MAX_BADGES = 8


def build_palette(color_trends: list[TrendObject]) -> list[PaletteSwatch]:
    """Read swatches straight from color trend objects (no model)."""
    swatches: list[PaletteSwatch] = []
    seen: set[str] = set()
    for trend in color_trends:
        for c in trend.attributes.get("colors", []):
            hex_val = c.get("hex")
            if not hex_val or hex_val.lower() in seen:
                continue
            seen.add(hex_val.lower())
            role = _PALETTE_ROLES[min(len(swatches), len(_PALETTE_ROLES) - 1)]
            swatches.append(
                PaletteSwatch(
                    name=c.get("name", trend.label),
                    hex=hex_val,
                    family=c.get("family", ""),
                    role=role,
                )
            )
            if len(swatches) >= _MAX_PALETTE:
                return swatches
    return swatches


def build_badges(top_trends: list[TrendObject]) -> list[TrendBadge]:
    """One badge per top trend, with a one-line human-readable justification."""
    badges: list[TrendBadge] = []
    for t in top_trends[:_MAX_BADGES]:
        badges.append(
            TrendBadge(
                label=t.label,
                type=t.type,
                confidence_score=t.confidence_score,
                lifecycle_stage=t.lifecycle_stage,
                sources=t.sources,
                why=(
                    f"{t.label.capitalize()} is {t.lifecycle_stage} with "
                    f"{t.confidence_score}% confidence across {t.source_count} sources."
                ),
            )
        )
    return badges


def compose(
    target: Target,
    palette: list[PaletteSwatch],
    badges: list[TrendBadge],
    images: list[GeneratedImage],
    text: dict,
) -> Moodboard:
    by_kind: dict[str, list[GeneratedImage]] = {}
    for img in images:
        by_kind.setdefault(img.kind, []).append(img)

    return Moodboard(
        moodboard_id=uuid.uuid4().hex,
        target=target,
        narrative=text.get("narrative", ""),
        keywords=list(text.get("keywords", [])),
        name_suggestions=list(text.get("name_suggestions", [])),
        palette=palette,
        badges=badges,
        hero_images=by_kind.get("hero", []),
        silhouettes=by_kind.get("silhouette", []),
        textures=by_kind.get("texture", []),
        patterns=by_kind.get("pattern", []),
        details=by_kind.get("detail", []),
        styling=by_kind.get("styling", []),
        colorways=by_kind.get("colorway", []),
        created_at=datetime.now(timezone.utc),
    )
