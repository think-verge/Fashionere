"""All Pydantic v2 models: Target, Trend*, Moodboard, API request/response."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

# ---------- Trend data (mirrors the Trend Agent output; MOCKED in MVP1) ----------

TrendType = Literal["color", "silhouette", "pattern", "material", "aesthetic", "item_style"]
Lifecycle = Literal["emerging", "rising", "peaking", "fading"]


class TrendContext(BaseModel):
    category: str                      # "dresses" | "denim" | "swimwear" ...
    season: Optional[str] = None       # "SS27"
    market: Optional[str] = None       # "womenswear" | "EU" ...
    gender: Optional[str] = None       # "women" | "men" | "unisex"


class ColorSwatch(BaseModel):
    name: str
    hex: str
    family: str                        # "yellow" | "neutral" ...


class TrendObject(BaseModel):
    trend_id: str
    type: TrendType
    label: str                         # "buttery yellow", "barrel-leg", "coastal minimal"
    attributes: dict                   # type-specific (colors[], silhouette, pattern, ...)
    context: TrendContext
    lifecycle_stage: Lifecycle
    demand_direction: Literal["rising", "peaking", "fading", "unknown"] = "unknown"
    confidence_score: int = Field(ge=0, le=100)
    source_count: int
    sources: list[str] = []            # provenance strings
    descriptor: str                    # clean text used to BUILD image prompts
    first_seen: Optional[date] = None
    last_seen: Optional[date] = None


# ---------- Target (the unified input) ----------

class Target(BaseModel):
    category: str
    attributes: dict = {}
    season: Optional[str] = None
    market: Optional[str] = None
    reference_image_url: Optional[str] = None   # upload path; unused for generation in MVP1
    raw_query: Optional[str] = None
    source_mode: Literal["query", "catalogue", "image"]


# ---------- Moodboard elements ----------

ImageKind = Literal["hero", "silhouette", "texture", "pattern", "detail", "styling", "colorway"]


class GeneratedImage(BaseModel):
    kind: ImageKind
    url: str
    prompt: str
    trend_refs: list[str] = []         # trend_ids that informed it


class PaletteSwatch(BaseModel):
    name: str
    hex: str
    family: str
    role: Optional[Literal["base", "accent", "contrast"]] = None


class TrendBadge(BaseModel):
    label: str
    type: TrendType
    confidence_score: int
    lifecycle_stage: Lifecycle
    sources: list[str] = []
    why: str                           # one-line human-readable justification


class Moodboard(BaseModel):
    moodboard_id: str
    target: Target
    # written (LLM)
    narrative: str
    keywords: list[str] = []
    name_suggestions: list[str] = []
    # pulled (from trend data)
    palette: list[PaletteSwatch] = []
    badges: list[TrendBadge] = []
    # generated (image model)
    hero_images: list[GeneratedImage] = []
    silhouettes: list[GeneratedImage] = []
    textures: list[GeneratedImage] = []
    patterns: list[GeneratedImage] = []
    details: list[GeneratedImage] = []
    styling: list[GeneratedImage] = []
    colorways: list[GeneratedImage] = []
    created_at: datetime


# ---------- API request/response ----------

class QueryRequest(BaseModel):
    query: str


class CatalogueRequest(BaseModel):
    catalogue_item_id: str


class ImageRequest(BaseModel):
    image_url: str                     # pre-uploaded URL (keep upload handling simple in MVP1)


class JobCreated(BaseModel):
    job_id: str
    status: Literal["pending", "running", "done", "error"] = "pending"


class JobStatus(BaseModel):
    job_id: str
    status: Literal["pending", "running", "done", "error"]
    moodboard: Optional[Moodboard] = None
    error: Optional[str] = None


class CatalogueItem(BaseModel):
    catalogue_item_id: str
    name: str
    category: str
    attributes: dict = {}
