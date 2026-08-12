"""The canonical Look — one shape every source normalizes into.

`raw` is preserved verbatim and never overwritten; `tags` are derived from it
by the normalizers and are always re-derivable. See DESIGN.md §6.1.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from trend_engine.schema.tags import Tags


class RawColor(BaseModel):
    name: str | None = None
    hex: str | None = None
    pantone: str | None = None


class DetailShot(BaseModel):
    url: str | None = None
    description: str | None = None
    fabric_text: str | None = None
    theme_text: str | None = None
    keywords: list[str] = Field(default_factory=list)
    colors: list[RawColor] = Field(default_factory=list)


class RawLook(BaseModel):
    """Source content, verbatim."""
    description: str | None = None
    fabric_text: str | None = None
    theme_text: str | None = None
    keywords: list[str] = Field(default_factory=list)
    colors: list[RawColor] = Field(default_factory=list)
    detail_shots: list[DetailShot] = Field(default_factory=list)


class RunwayImage(BaseModel):
    url: str | None = None
    kind: Literal["page_link", "image"] = "page_link"


class DetailImage(BaseModel):
    url: str | None = None
    description: str | None = None
    kind: Literal["page_link", "image"] = "page_link"


class Images(BaseModel):
    runway: RunwayImage | None = None
    details: list[DetailImage] = Field(default_factory=list)


class LookMeta(BaseModel):
    vocab_ver: str | None = None
    prompt_ver: str | None = None
    normalize_model: str | None = None
    normalized_at: str | None = None


class Look(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # identity & provenance
    look_id: str                       # "{brand_slug}:{collection_id}:{look_number}"
    brand: str
    brand_slug: str
    source: str
    source_url: str | None = None
    collection_id: str

    # temporal facets (parsed)
    season: str                        # Title-case, e.g. "Spring"
    year: int
    category: str                      # normalized, e.g. "RTW"
    season_order: int                  # year*10 + season_rank; sorts all shows

    # content
    look_number: int
    images: Images = Field(default_factory=Images)
    raw: RawLook = Field(default_factory=RawLook)

    # derived (Phase 2+)
    tags: Tags = Field(default_factory=Tags)
    vibe_phrases: list[str] = Field(default_factory=list)
    embedding: list[float] | None = None

    meta: LookMeta = Field(default_factory=LookMeta)
