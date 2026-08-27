"""Pydantic response models — the shapes the frontend consumes.

The `Card` model is the atomic unit: everything a UI card needs to render
one garment/product, whether it's assembled from a rich deconstruction or
the canonical-only fallback."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ColorRef(BaseModel):
    name: Optional[str] = None
    hex: Optional[str] = None
    pantone: Optional[str] = None
    family: Optional[str] = None
    role: Optional[str] = None       # dominant / accent
    weight: Optional[float] = None   # sampled from deconstruction — palette share (0..1)
    swatch_url: Optional[str] = None  # populated when deconstruction has one


class FabricRef(BaseModel):
    value: Optional[str] = None            # vocab id ("leather", "tweed")
    material: Optional[str] = None         # raw material text
    percentage: Optional[float] = None
    part: Optional[str] = None             # "shell", "lining"
    macro_url: Optional[str] = None        # populated when deconstruction has one


class PatternRef(BaseModel):
    value: Optional[str] = None            # vocab id
    motif: Optional[str] = None
    tile_url: Optional[str] = None         # extracted pattern tile from deconstruction


class TagRef(BaseModel):
    value: str
    evidence: Optional[str] = None


class ImageRef(BaseModel):
    image_id: str
    role: str
    url: str
    description: Optional[str] = None


class PriceRef(BaseModel):
    amount: float
    currency: str


class TrendChip(BaseModel):
    """Attached placeholder while the classifier is not yet wired."""
    state: Literal["will_trend", "is_trending", "dropped", "unknown"] = "unknown"
    cited_by: list[str] = Field(default_factory=list)


class GarmentBreakdown(BaseModel):
    """Per-garment card slice — populated from deconstruction for runway looks
    that have been processed. `bbox` is x1,y1,x2,y2 in the source runway image."""
    garment_id: str
    piece: Optional[str] = None
    garment_type: Optional[str] = None
    bbox: Optional[list[int]] = None
    colors: list[ColorRef] = Field(default_factory=list)
    materials_candidates: list[str] = Field(default_factory=list)
    fabric_macro_url: Optional[str] = None
    pattern_tile_url: Optional[str] = None


class Card(BaseModel):
    """Unified card shape — one product / one garment."""
    look_id: str
    brand: str
    brand_slug: str
    piece: Optional[str] = None
    garment_type: Optional[str] = None

    is_deconstructed: bool
    source_type: Literal["runway", "retail"]

    # aggregate-level (tag-derived) attributes
    colors: list[ColorRef] = Field(default_factory=list)
    fibers: list[FabricRef] = Field(default_factory=list)
    fabrics: list[FabricRef] = Field(default_factory=list)
    patterns: list[PatternRef] = Field(default_factory=list)
    silhouettes: list[TagRef] = Field(default_factory=list)
    details: list[TagRef] = Field(default_factory=list)
    themes: list[TagRef] = Field(default_factory=list)

    images: list[ImageRef] = Field(default_factory=list)
    source_runway_url: Optional[str] = None       # from deconstruction; original photo
    garments: list[GarmentBreakdown] = Field(default_factory=list)
    technical_flat_url: Optional[str] = None      # design sketch (deconstruction, when present)

    season: Optional[str] = None
    year: Optional[int] = None
    category_path: list[str] = Field(default_factory=list)
    price: Optional[PriceRef] = None
    source_url: Optional[str] = None
    description: Optional[str] = None


class CardSummary(BaseModel):
    """Compact card used in grid views. A leaner slice of Card."""
    look_id: str
    brand: str
    brand_slug: str
    piece: Optional[str] = None
    garment_type: Optional[str] = None
    source_type: Literal["runway", "retail"]
    is_deconstructed: bool
    thumbnail_url: Optional[str] = None
    dominant_color: Optional[ColorRef] = None
    price: Optional[PriceRef] = None
    season: Optional[str] = None
    year: Optional[int] = None


class LookListResponse(BaseModel):
    items: list[CardSummary]
    total: int
    next_cursor: Optional[str] = None


class TagValueSummary(BaseModel):
    value: str
    count: int


class TagValuesResponse(BaseModel):
    dimension: str
    values: list[TagValueSummary]


class TrendResponse(BaseModel):
    dimension: str
    value: str
    state: Literal["will_trend", "is_trending", "dropped", "unknown"] = "unknown"
    cited_by_designers: list[str] = Field(default_factory=list)
    in_retail: list[str] = Field(default_factory=list)
    season: Optional[str] = None
    sample_looks: list[CardSummary] = Field(default_factory=list)
    pairs_with: list[dict] = Field(default_factory=list)  # [{dimension, value, count}]
    scope: dict = Field(default_factory=dict)             # {n_runway, n_retail, brands}
