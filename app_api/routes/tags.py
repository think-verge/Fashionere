"""Tag & filter endpoints — sidebar values, brands, tag-filtered lists."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..models import CardSummary, TagValuesResponse
from ..services import looks_service

router = APIRouter(prefix="/tags", tags=["tags"])

VALID_DIMS = ("colors", "fibers", "fabrics", "patterns", "silhouettes", "details", "themes")


@router.get("/{dimension}", response_model=TagValuesResponse)
def tag_values(dimension: str, limit: int = Query(200, ge=1, le=500)):
    if dimension not in VALID_DIMS:
        raise HTTPException(400, f"unknown dimension: {dimension}. valid: {VALID_DIMS}")
    return looks_service.tag_values(dimension, limit=limit)


@router.get("/{dimension}/{value}/looks", response_model=list[CardSummary])
def looks_for_tag(dimension: str, value: str, limit: int = Query(24, ge=1, le=100)):
    if dimension not in VALID_DIMS:
        raise HTTPException(400, f"unknown dimension: {dimension}. valid: {VALID_DIMS}")
    return looks_service.looks_for_tag(dimension, value, limit=limit)


brands_router = APIRouter(prefix="/brands", tags=["brands"])


@brands_router.get("", response_model=list[dict])
def brands():
    return looks_service.brands_summary()
