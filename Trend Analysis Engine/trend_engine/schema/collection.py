"""The canonical Collection — one per show, with the deduped editorial summary.

`palette` is computed later (Tally, Phase 3); empty at ingest. See DESIGN.md §6.2.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PaletteEntry(BaseModel):
    hex: str
    family: str
    share: float
    pantone: str | None = None


class Collection(BaseModel):
    collection_id: str                 # "prada-spring-2026-rtw"
    brand: str
    brand_slug: str
    source: str
    source_url: str | None = None

    season: str
    year: int
    category: str
    season_order: int

    summary: str = ""                  # deduped from the per-look repetition
    look_count: int = 0

    palette: list[PaletteEntry] = Field(default_factory=list)  # computed in Tally
    ingested_at: datetime | None = None
