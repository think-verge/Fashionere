"""Trend chip service — placeholder implementation.

The Will/Is/Dropped classifier isn't built yet. Until it is, every chip returns
`state: "unknown"` but with the useful designer-signal payload: which brands
cite this tag, sample looks, and co-occurring attributes ("pairs with").

When the classifier ships, only the `state` field's population needs to change —
the response shape stays stable."""

from __future__ import annotations

from collections import Counter

from ..db import canonical_looks
from ..models import CardSummary, TrendResponse
from . import cards
from .looks_service import FILTERABLE_TAG_DIMS, _deconstructed_ids


def trend(dimension: str, value: str, sample_limit: int = 8, pairs_top: int = 8) -> TrendResponse:
    field = FILTERABLE_TAG_DIMS.get(dimension)
    if not field:
        return TrendResponse(dimension=dimension, value=value)
    q = {field: value, "tags": {"$exists": True}}
    matched = list(canonical_looks().find(q))
    if not matched:
        return TrendResponse(dimension=dimension, value=value)

    # cited-by breakdown
    designer_brands: list[str] = []
    retail_brands: list[str] = []
    for d in matched:
        ctx = d.get("context") or {}
        st = (d.get("source") or {}).get("type", "").lower()
        brand = ctx.get("brand")
        if not brand:
            continue
        if st in cards.RETAIL_SOURCES:
            retail_brands.append(brand)
        else:
            designer_brands.append(brand)

    unique_designers = sorted(set(designer_brands))
    unique_retailers = sorted(set(retail_brands))

    # sample looks — prefer runway, mix in retail
    runway_docs = [d for d in matched if (d.get("source") or {}).get("type", "").lower() not in cards.RETAIL_SOURCES]
    retail_docs = [d for d in matched if (d.get("source") or {}).get("type", "").lower() in cards.RETAIL_SOURCES]
    samples = (runway_docs[: max(1, sample_limit - 3)] + retail_docs[:3])[:sample_limit]
    sample_ids = [d["look_id"] for d in samples]
    deconstructed = _deconstructed_ids(sample_ids)
    sample_cards = [cards.summary_from_canonical(d, deconstructed=d["look_id"] in deconstructed) for d in samples]

    # pairs-with: what OTHER tags co-occur on the same looks
    pair_counter: Counter = Counter()
    for d in matched:
        tags = d.get("tags") or {}
        for other_dim in ("silhouettes", "fabrics", "patterns", "details", "themes", "colors"):
            if other_dim == dimension:
                continue
            for t in tags.get(other_dim) or []:
                v = t.get("value") or t.get("family")
                if v and v != value:
                    pair_counter[(other_dim, v)] += 1

    pairs = [
        {"dimension": dim, "value": v, "count": cnt}
        for (dim, v), cnt in pair_counter.most_common(pairs_top)
    ]

    return TrendResponse(
        dimension=dimension,
        value=value,
        state="unknown",  # classifier placeholder
        cited_by_designers=unique_designers,
        in_retail=unique_retailers,
        sample_looks=sample_cards,
        pairs_with=pairs,
        scope={
            "n_runway": len(runway_docs),
            "n_retail": len(retail_docs),
            "brands_runway": len(unique_designers),
            "brands_retail": len(unique_retailers),
        },
    )
