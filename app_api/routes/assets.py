"""GridFS asset streaming — fabric macros, pattern tiles, sketches.

    GET /api/v1/assets/{gridfs_id}   → image/png stream from swatches.files
"""
from __future__ import annotations

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Response
from gridfs import GridFS, NoFile

from ..db import db

router = APIRouter(prefix="/assets", tags=["assets"])


def _fs() -> GridFS:
    # bucket name matches the deconstruction engine's writer
    return GridFS(db(), collection="swatches")


@router.get("/{gridfs_id}")
def get_asset(gridfs_id: str):
    try:
        oid = ObjectId(gridfs_id)
    except InvalidId:
        raise HTTPException(400, "invalid asset id")
    fs = _fs()
    try:
        f = fs.get(oid)
    except NoFile:
        raise HTTPException(404, "asset not found")
    data = f.read()
    # everything we store is PNG; if that ever changes, read content_type from f
    return Response(
        content=data,
        media_type=f.content_type or "image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
