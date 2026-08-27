"""fashionairre-core — the canonical `Look`: one source-of-truth record shape.

Every source (Vogue text, runway images, Instagram, WGSN…) converges into this
via a thin adapter. Both engines read it: the **deconstruction** engine uses the
per-garment `extraction` + `source_region` (to crop swatches) + the images; the
**trend** engine flattens `extraction` to countable tags and aggregates.

Five layers, deliberately separated so new sources only touch the first two:

  source      — WHERE it came from (source-specific, loose)
  context     — WHAT show/brand/season (all optional; each source fills what it knows)
  images      — the media analysed (files preferred; page-links tolerated)
  native_text — free text the source hands over (captions, keywords) — NOT attributes
  extraction  — WHAT'S IN THE OUTFIT (the stable core, produced by the extractor)

Derived artefacts (swatch/sketch assets, vocab tags, trend momentum) are NOT
stored here — they are produced downstream by each engine.

Unification note: attribute objects carry both **free-form** fields (what the
vision/text extractor sees) and **optional derived** fields (`family` for colour,
`value` for fabric/pattern) that a downstream normalizer fills. A raw extraction
validates without them; the trend normalizer populates them later.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = "1.1"

ColorRole = Literal["dominant", "secondary", "accent"]
Confidence = Literal["high", "medium", "low"]
ImageKind = Literal["image_file", "image_url", "page_link"]
# image_file = downloaded local file · image_url = direct remote image (fetchable,
# not yet downloaded) · page_link = a webpage, not an image
# Structural repeat behaviour (deconstruction needs it for tiling swatches).
PatternRepeat = Literal["none", "repeat", "placement_appliqué"]
ProvConfidence = Literal["stated", "inferred", "unknown"]


# --- spatial ----------------------------------------------------------------
class SourceRegion(BaseModel):
    """Where an element is clearest, for cropping. Present only for image sources."""
    image_id: str
    box: list[int] = Field(description="[ymin, xmin, ymax, xmax], normalized 0-1000")


# --- attribute objects (free-form + optional derived) -----------------------
class ColorSwatch(BaseModel):
    name: str
    pantone: str | None = None          # designer-facing (estimate for images; from source for Vogue)
    hex: str | None = None              # renders the chip
    role: ColorRole = "accent"
    family: str | None = None           # DERIVED (colour normalizer, ΔE) — trend counts on this
    confidence: float | None = None


class Fabric(BaseModel):
    material: str | None = None         # free-form, e.g. "wool-blend tweed"
    weight: str | None = None
    finish: str | None = None
    treatment: str | None = None        # e.g. "croc-embossed"
    garment: str | None = None          # which garment part (from text sources)
    description: str | None = None
    value: str | None = None            # DERIVED (vocab id, e.g. "tweed") — trend
    evidence: str | None = None         # phrase from source text (grounding; text sources)
    confidence: float | None = None
    source_region: SourceRegion | None = None   # image sources only → crop swatch


class Pattern(BaseModel):
    repeat_type: PatternRepeat = "none"  # structural: none | repeat | placement_appliqué (deconstruction)
    motif: str | None = None
    scale: str | None = None
    colors: list[str] = Field(default_factory=list)
    description: str | None = None
    is_brand_mark: bool = False          # trademark guardrail — both engines exclude
    value: str | None = None             # DERIVED (vocab id, e.g. "floral") — trend
    evidence: str | None = None
    confidence: float | None = None
    source_region: SourceRegion | None = None


class ThemeTag(BaseModel):
    value: str                           # free-form or vocab id
    evidence: str | None = None
    confidence: float | None = None


class DetailTag(BaseModel):
    """Accessories (bag, gloves, jewelry). Trend counts these; deconstruction ignores."""
    value: str
    type: str | None = None
    evidence: str | None = None
    confidence: float | None = None


class FiberContent(BaseModel):
    """One fiber in a material composition, e.g. {"fiber": "wool", "pct": 60}."""
    fiber: str
    pct: float | None = None             # 0-100; None when composition is stated but not quantified


GarmentType = Literal[
    "jacket", "coat", "vest", "top", "shirt", "blouse", "sweater",
    "dress", "skirt", "trousers", "jeans", "shorts", "jumpsuit",
    "bodysuit", "lingerie", "swimwear", "activewear",
    "accessory", "footwear", "bag", "other",
]


class Garment(BaseModel):
    """One apparel garment. `piece=None` means the source is not garment-segmented
    (e.g. look-level text) — attributes describe the whole look."""
    garment_id: str | None = None
    piece: str | None = None             # free-text from source ("Asymmetric Bubble Skirt")
    garment_type: GarmentType | None = None  # DERIVED — normalized by garment-type normalizer
    composition: list[FiberContent] = Field(default_factory=list)  # structured material breakdown
    color_palette: list[ColorSwatch] = Field(default_factory=list)
    fabrics: list[Fabric] = Field(default_factory=list)
    patterns: list[Pattern] = Field(default_factory=list)


class LookLevel(BaseModel):
    silhouette_description: str | None = None
    color_story: list[str] = Field(default_factory=list)
    themes: list[ThemeTag] = Field(default_factory=list)
    details: list[DetailTag] = Field(default_factory=list)


class Extraction(BaseModel):
    """WHAT'S IN THE OUTFIT — identical shape for every source."""
    garments: list[Garment] = Field(default_factory=list)
    look_level: LookLevel = Field(default_factory=LookLevel)


# --- provenance / media -----------------------------------------------------
class Image(BaseModel):
    image_id: str
    role: str                            # runway | detail | post | editorial | …
    kind: ImageKind = "page_link"
    file: str | None = None              # local vault path (downloaded)
    url: str | None = None               # resolved <img src> (fetchable image)
    source_page: str | None = None       # original page-link (provenance only)
    description: str | None = None        # source caption


class Source(BaseModel):
    type: str                            # vogue | instagram | wgsn | upload | image_folder
    source_url: str | None = None
    source_ref: str | None = None        # native id in that source
    captured_at: str | None = None
    extra: dict = Field(default_factory=dict)   # source-specific payload


class Price(BaseModel):
    amount: float
    currency: str = "USD"                # ISO 4217
    original: float | None = None        # pre-discount price, if on sale


class Context(BaseModel):
    brand: str | None = None
    brand_slug: str | None = None
    collection_id: str | None = None
    collection_name: str | None = None
    season: str | None = None
    year: int | None = None
    category: str | None = None
    designer: str | None = None
    provenance_confidence: ProvConfidence = "unknown"
    product_id: str | None = None        # retailer SKU / product ID (retail sources)
    price: Price | None = None           # retail price at time of scrape
    category_path: list[str] = Field(default_factory=list)  # e.g. ["Women", "Dresses", "Midi"]


class Meta(BaseModel):
    schema_version: str = SCHEMA_VERSION
    scraper_ver: str | None = None
    extractor_model: str | None = None
    prompt_ver: str | None = None
    scraped_at: str | None = None
    extracted_at: str | None = None


# --- the canonical record ---------------------------------------------------
class Look(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    schema_version: str = SCHEMA_VERSION
    look_id: str                         # "{brand_slug}:{collection_id}:{look_number}"
    source: Source
    context: Context = Field(default_factory=Context)
    images: list[Image] = Field(default_factory=list)
    native_text: dict = Field(default_factory=dict)   # keywords, summary, captions — NOT attributes
    extraction: Extraction | None = None  # None until the extractor runs
    meta: Meta = Field(default_factory=Meta)
