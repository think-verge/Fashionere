"""Query service — Mongo queries + card assembly for the app API.

All Mongo access lives here so routes stay thin."""

from __future__ import annotations

import base64
from typing import Optional

from ..db import canonical_looks, deconstructions
from ..models import Card, CardSummary, LookListResponse, TagValueSummary, TagValuesResponse
from . import cards

# Which tag dimensions we expose filters on
FILTERABLE_TAG_DIMS = {
    "colors": "tags.colors.family",
    "fibers": "tags.fibers.value",
    "fabrics": "tags.fabrics.value",
    "patterns": "tags.patterns.value",
    "silhouettes": "tags.silhouettes.value",
    "details": "tags.details.value",
    "themes": "tags.themes.value",
}


def _cursor_encode(oid: str) -> str:
    return base64.urlsafe_b64encode(oid.encode()).decode().rstrip("=")


def _cursor_decode(cursor: str) -> str | None:
    try:
        pad = "=" * (-len(cursor) % 4)
        return base64.urlsafe_b64decode(cursor + pad).decode()
    except Exception:
        return None


def _deconstructed_ids(look_ids: list[str]) -> set[str]:
    if not look_ids:
        return set()
    cursor = deconstructions().find(
        {"look_id": {"$in": look_ids}, "status": "complete"},
        {"look_id": 1},
    )
    return {d["look_id"] for d in cursor}


def list_looks(
    *,
    brand: Optional[str] = None,
    source_type: Optional[str] = None,  # "runway" | "retail"
    garment_type: Optional[str] = None,
    color: Optional[str] = None,
    fiber: Optional[str] = None,
    fabric: Optional[str] = None,
    pattern: Optional[str] = None,
    silhouette: Optional[str] = None,
    season: Optional[str] = None,
    year: Optional[int] = None,
    tagged_only: bool = True,
    limit: int = 24,
    cursor: Optional[str] = None,
) -> LookListResponse:
    q: dict = {}
    if tagged_only:
        q["tags"] = {"$exists": True}
    if brand:
        q["context.brand_slug"] = brand
    if source_type == "runway":
        q["source.type"] = {"$nin": list(cards.RETAIL_SOURCES)}
    elif source_type == "retail":
        q["source.type"] = {"$in": list(cards.RETAIL_SOURCES)}
    if garment_type:
        q["extraction.garments.garment_type"] = garment_type
    if color:
        q["tags.colors.family"] = color
    if fiber:
        q["tags.fibers.value"] = fiber
    if fabric:
        q["tags.fabrics.value"] = fabric
    if pattern:
        q["tags.patterns.value"] = pattern
    if silhouette:
        q["tags.silhouettes.value"] = silhouette
    if season:
        q["context.season"] = season
    if year:
        q["context.year"] = year

    from bson import ObjectId
    if cursor:
        if decoded := _cursor_decode(cursor):
            try:
                q["_id"] = {"$gt": ObjectId(decoded)}
            except Exception:
                pass

    total = canonical_looks().count_documents(q)
    docs = list(canonical_looks().find(q).sort("_id", 1).limit(limit + 1))
    has_more = len(docs) > limit
    docs = docs[:limit]

    look_ids = [d["look_id"] for d in docs]
    deconstructed = _deconstructed_ids(look_ids)

    items = [cards.summary_from_canonical(d, deconstructed=d["look_id"] in deconstructed) for d in docs]

    next_cursor = None
    if has_more and docs:
        next_cursor = _cursor_encode(str(docs[-1]["_id"]))

    return LookListResponse(items=items, total=total, next_cursor=next_cursor)


def get_look(look_id: str) -> Card | None:
    doc = canonical_looks().find_one({"look_id": look_id})
    if not doc:
        return None
    decon = deconstructions().find_one({"look_id": look_id, "status": "complete"})
    return cards.build_card(doc, decon)


def get_similar(look_id: str, limit: int = 12) -> list[CardSummary]:
    """Simple similarity: shared silhouette + fabric tags, same source_type."""
    doc = canonical_looks().find_one({"look_id": look_id})
    if not doc:
        return []
    tags = doc.get("tags") or {}
    silhouettes = [s.get("value") for s in (tags.get("silhouettes") or []) if s.get("value")]
    fabrics = [f.get("value") for f in (tags.get("fabrics") or []) if f.get("value")]
    if not silhouettes and not fabrics:
        return []
    q: dict = {"look_id": {"$ne": look_id}, "tags": {"$exists": True}}
    or_clauses: list[dict] = []
    if silhouettes:
        or_clauses.append({"tags.silhouettes.value": {"$in": silhouettes}})
    if fabrics:
        or_clauses.append({"tags.fabrics.value": {"$in": fabrics}})
    q["$or"] = or_clauses
    docs = list(canonical_looks().find(q).limit(limit))
    look_ids = [d["look_id"] for d in docs]
    deconstructed = _deconstructed_ids(look_ids)
    return [cards.summary_from_canonical(d, deconstructed=d["look_id"] in deconstructed) for d in docs]


def tag_values(dimension: str, limit: int = 200) -> TagValuesResponse:
    """Available values in one tag dimension, with counts — for filter sidebars."""
    field = FILTERABLE_TAG_DIMS.get(dimension)
    if not field:
        return TagValuesResponse(dimension=dimension, values=[])
    pipeline = [
        {"$match": {"tags": {"$exists": True}}},
        {"$unwind": f"${field.rsplit('.', 1)[0]}"},
        {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
        {"$match": {"_id": {"$ne": None}}},
        {"$sort": {"count": -1}},
        {"$limit": limit},
    ]
    rows = list(canonical_looks().aggregate(pipeline))
    return TagValuesResponse(
        dimension=dimension,
        values=[TagValueSummary(value=str(r["_id"]), count=r["count"]) for r in rows],
    )


def looks_for_tag(dimension: str, value: str, limit: int = 24) -> list[CardSummary]:
    """List of cards carrying a specific tag value."""
    field = FILTERABLE_TAG_DIMS.get(dimension)
    if not field:
        return []
    q = {field: value, "tags": {"$exists": True}}
    docs = list(canonical_looks().find(q).limit(limit))
    look_ids = [d["look_id"] for d in docs]
    deconstructed = _deconstructed_ids(look_ids)
    return [cards.summary_from_canonical(d, deconstructed=d["look_id"] in deconstructed) for d in docs]


def brands_summary() -> list[dict]:
    """Every brand with count — for a global filter surface."""
    pipeline = [
        {"$match": {"tags": {"$exists": True}}},
        {"$group": {"_id": {"slug": "$context.brand_slug", "name": "$context.brand",
                             "type": "$source.type"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    out = []
    for r in canonical_looks().aggregate(pipeline):
        st = r["_id"].get("type", "").lower()
        source_type = "retail" if st in cards.RETAIL_SOURCES else "runway"
        out.append({
            "brand_slug": r["_id"].get("slug"),
            "brand": r["_id"].get("name"),
            "source_type": source_type,
            "count": r["count"],
        })
    return out
