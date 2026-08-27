"""Look endpoints — browse grid + detail card + similar."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..models import Card, CardSummary, LookListResponse
from ..services import looks_service

router = APIRouter(prefix="/looks", tags=["looks"])


@router.get("", response_model=LookListResponse)
def list_looks(
    brand: str | None = Query(None, description="brand_slug filter"),
    source_type: str | None = Query(None, pattern="^(runway|retail)$"),
    garment_type: str | None = None,
    color: str | None = Query(None, description="color family (e.g. black, cream)"),
    fiber: str | None = None,
    fabric: str | None = None,
    pattern: str | None = None,
    silhouette: str | None = None,
    season: str | None = None,
    year: int | None = None,
    limit: int = Query(24, ge=1, le=100),
    cursor: str | None = None,
):
    return looks_service.list_looks(
        brand=brand, source_type=source_type, garment_type=garment_type,
        color=color, fiber=fiber, fabric=fabric, pattern=pattern,
        silhouette=silhouette, season=season, year=year,
        limit=limit, cursor=cursor,
    )


@router.get("/{look_id:path}/similar", response_model=list[CardSummary])
def similar(look_id: str, limit: int = Query(12, ge=1, le=48)):
    return looks_service.get_similar(look_id, limit=limit)


@router.get("/{look_id:path}", response_model=Card)
def get_look(look_id: str):
    card = looks_service.get_look(look_id)
    if not card:
        raise HTTPException(status_code=404, detail=f"look_id not found: {look_id}")
    return card
