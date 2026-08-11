"""Shape a Mongo `deconstructions` doc into frontend JSON (gridfs_id -> asset URL).

Handles both schemas: the current gemini schema (fabrics/patterns lists + flat +
sketch) and the legacy heuristic schema (singular fabric/pattern). Internal fields
(source_hash, reused, gridfs_id) are stripped; every image becomes an `/api/assets/..`
URL the frontend can drop into <img src>.
"""
from __future__ import annotations

_INTERNAL = {"gridfs_id", "source_hash", "reused"}


def asset_url(gridfs_id) -> str:
    return f"/api/assets/{gridfs_id}"


def _element(el: dict) -> dict:
    """A fabric/pattern element -> its metadata + a swatch_url."""
    out = {k: v for k, v in el.items() if k not in _INTERNAL}
    if el.get("gridfs_id"):
        out["swatch_url"] = asset_url(el["gridfs_id"])
    return out


def _flat_url(node) -> str | None:
    if node and node.get("gridfs_id"):
        return asset_url(node["gridfs_id"])
    return None


def serialize_look(rec: dict) -> dict:
    """Full deconstruction for one look."""
    garments = []
    for g in rec.get("garments", []) or []:
        fabrics = g.get("fabrics") or ([g["fabric"]] if g.get("fabric") else [])
        patterns = g.get("patterns") or ([g["pattern"]] if g.get("pattern") else [])
        garments.append({
            "garment_id": g.get("garment_id"),
            "piece": g.get("piece"),
            "colors": g.get("colors", []),
            "flat": _flat_url(g.get("flat")),
            "fabrics": [_element(f) for f in fabrics if f],
            "patterns": [_element(p) for p in patterns if p],
        })
    return {
        "look_id": rec.get("look_id") or rec.get("_id"),
        "brand": rec.get("brand"),
        "collection_id": rec.get("collection_id"),
        "runway_url": rec.get("source_runway_url"),
        "silhouette": rec.get("silhouette"),
        "whole_look_flat": _flat_url(rec.get("sketch")),
        "garments": garments,
        "status": rec.get("status"),
    }


def serialize_summary(rec: dict) -> dict:
    """Compact row for the gallery list."""
    return {
        "look_id": rec.get("_id"),
        "brand": rec.get("brand"),
        "collection_id": rec.get("collection_id"),
        "runway_url": rec.get("source_runway_url"),
        "num_garments": len(rec.get("garments", []) or []),
        "has_flats": bool(rec.get("sketch")) or any(
            g.get("flat") for g in rec.get("garments", []) or []),
    }
