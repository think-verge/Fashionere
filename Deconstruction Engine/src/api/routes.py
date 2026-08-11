"""API endpoints — list looks, get one look's full deconstruction, stream an asset."""
from __future__ import annotations

from functools import lru_cache

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Query, Response

from ..canonical.store_mongo import DeconstructionStore
from . import serialize

router = APIRouter(prefix="/api")


@lru_cache(maxsize=1)
def get_store() -> DeconstructionStore:
    return DeconstructionStore()


@router.get("/looks")
def list_looks(brand: str | None = Query(None, description="filter by brand slug")):
    """List deconstructed looks (for a gallery)."""
    store = get_store()
    q: dict = {"status": "complete"}
    if brand:
        q["brand"] = brand
    return [serialize.serialize_summary(r)
            for r in store.decon.find(q).sort([("brand", 1), ("_id", 1)])]


@router.get("/looks/{look_id:path}")
def get_look(look_id: str):
    """Everything for one outfit — garments -> colors/fabrics/patterns/flats + asset URLs."""
    rec = get_store().get(look_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"look not found: {look_id}")
    return serialize.serialize_look(rec)


@router.get("/assets/{gridfs_id}")
def get_asset(gridfs_id: str):
    """Stream a swatch/flat PNG out of GridFS (this is what <img src> points at)."""
    store = get_store()
    try:
        oid = ObjectId(gridfs_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="invalid asset id")
    try:
        data = store.get_swatch_bytes(oid)
    except Exception:  # noqa: BLE001 — missing/deleted gridfs file
        raise HTTPException(status_code=404, detail="asset not found")
    return Response(content=data, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=86400"})
