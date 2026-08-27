"""Trend chip endpoint (placeholder state).

Returns designer-signal payload today; will/is/dropped classification returns
`state: "unknown"` until the classifier ships. Response shape is stable — only
the state field changes when the classifier is wired."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..models import TrendResponse
from ..services import trends_service

router = APIRouter(prefix="/trends", tags=["trends"])

VALID_DIMS = ("colors", "fibers", "fabrics", "patterns", "silhouettes", "details", "themes")


@router.get("/{dimension}/{value}", response_model=TrendResponse)
def trend(
    dimension: str,
    value: str,
    sample_limit: int = Query(8, ge=1, le=24),
    pairs_top: int = Query(8, ge=1, le=20),
):
    if dimension not in VALID_DIMS:
        raise HTTPException(400, f"unknown dimension: {dimension}. valid: {VALID_DIMS}")
    return trends_service.trend(dimension, value, sample_limit=sample_limit, pairs_top=pairs_top)
