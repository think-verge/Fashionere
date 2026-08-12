"""Normalized attribute tags (the "tidy piles").

Produced by the normalizers in Phase 2; empty at ingest time. Every tag is a
typed object carrying a vocabulary `value` (or "__unmapped__"), the raw
`evidence` phrase that justifies it, its `origin` (look vs detail shot), and a
`confidence`. `from` is a Python keyword, so the field is `origin` with an
alias of "from" for serialization.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Origin = Literal["look", "detail"]
UNMAPPED = "__unmapped__"


class ColorTag(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    family: str                       # vocabulary family, e.g. "navy"
    name: str                         # original color name, e.g. "Deep navy blue"
    hex: str                          # "#1E2A44"
    pantone: str | None = None
    role: Literal["dominant", "accent"] = "accent"
    origin: Origin = Field(default="look", alias="from")
    confidence: float = 1.0


class FabricTag(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    value: str                        # vocab id, e.g. "twill"
    material: str | None = None       # e.g. "cotton-wool"
    garment: str | None = None        # e.g. "suit", "bag"
    treatment: str | None = None      # e.g. "croc-embossed"
    evidence: str | None = None
    origin: Origin = Field(default="look", alias="from")
    confidence: float = 1.0


class PatternTag(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    value: str                        # e.g. "solid", "floral"
    motif: str | None = None
    evidence: str | None = None
    origin: Origin = Field(default="look", alias="from")
    confidence: float = 1.0


class SilhouetteTag(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    value: str                        # e.g. "tailored-suit"
    garment: str | None = None
    fit: str | None = None            # e.g. "sharp", "oversized"
    evidence: str | None = None
    origin: Origin = Field(default="look", alias="from")
    confidence: float = 1.0


class ThemeTag(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    value: str                        # e.g. "military"
    evidence: str | None = None
    origin: Origin = Field(default="look", alias="from")
    confidence: float = 1.0


class DetailTag(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    value: str                        # e.g. "top-handle-bag"
    type: str | None = None           # e.g. "bag", "jewelry"
    evidence: str | None = None
    origin: Origin = Field(default="look", alias="from")
    confidence: float = 1.0


class Tags(BaseModel):
    """Container of per-dimension tag lists. All empty until normalization."""
    colors: list[ColorTag] = Field(default_factory=list)
    fabrics: list[FabricTag] = Field(default_factory=list)
    patterns: list[PatternTag] = Field(default_factory=list)
    silhouettes: list[SilhouetteTag] = Field(default_factory=list)
    themes: list[ThemeTag] = Field(default_factory=list)
    details: list[DetailTag] = Field(default_factory=list)
