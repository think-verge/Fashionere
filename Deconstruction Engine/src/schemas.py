"""Pydantic models — the single source of truth for the deconstruction schema.

`VisionResult` is passed directly to Gemini as ``response_schema`` (the SDK
converts a Pydantic model into the structured-output schema), used to validate
the reply, and documents the on-disk record shape. One definition, three jobs.

The deconstruction is **look-level, not per-garment**: the vision model returns
the whole look's color palette, its distinct fabrics, and its distinct patterns
(deduplicated across garments) — plus a look-level silhouette + color story.
Provenance, processing metadata, and generated-swatch asset paths are added by
the pipeline (see `LookRecord`).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ColorRole = Literal["dominant", "secondary", "accent"]
Confidence = Literal["high", "medium", "low"]
PatternType = Literal["none", "repeat", "placement_appliqué"]
Status = Literal["complete", "partial", "failed"]


# --- Vision output (what Gemini returns) — look-level element sets ----------

class ColorSwatch(BaseModel):
    name: str = Field(description="Human color name, e.g. 'champagne'")
    pantone: str = Field(
        description="Nearest Pantone TCX estimate, e.g. '19-3922 TCX Navy Blazer' "
        "(the designer-facing value)"
    )
    hex: str = Field(description="Approximate hex estimate — used only to render the chip")
    role: ColorRole


class SourceRegion(BaseModel):
    """Where this element is clearest in the uploaded images, for cropping.

    Images are numbered from 0 in the order provided (runway first, then details).
    ``box`` = [ymin, xmin, ymax, xmax], normalized 0-1000 (Gemini's convention),
    tightly around a clean patch of ONLY this fabric/pattern — no face/skin/bg.
    """

    image_index: int = Field(description="Index of the clearest image (0-based)")
    box: list[int] = Field(description="[ymin, xmin, ymax, xmax], 0-1000")


class FabricSwatch(BaseModel):
    name: str = Field(description="Short label incl. color, e.g. 'black tweed'")
    material: str = Field(description="Best-guess material, e.g. 'wool tweed'")
    weight: str = Field(description="lightweight / medium / heavy")
    finish: str = Field(description="e.g. sheer, matte, glossy, textured")
    confidence: Confidence
    description: str = Field(description="ONE short line — minimal, for a caption")
    source: SourceRegion


class PatternSwatch(BaseModel):
    name: str = Field(description="Short label, e.g. 'salt-and-pepper tweed weave'")
    type: PatternType
    motif: str = Field(description="Motif name, or '' if none")
    scale: str = Field(description="small / medium / large, or ''")
    colors: list[str] = Field(description="Hex colors of the pattern")
    description: str = Field(description="ONE short line — minimal, for a caption")
    source: SourceRegion


class Garment(BaseModel):
    """One apparel garment, with its OWN color palette, fabrics, and patterns."""

    piece: str = Field(description="Garment type, e.g. 'double-breasted tweed jacket'")
    color_palette: list[ColorSwatch] = Field(description="This garment's palette")
    fabrics: list[FabricSwatch] = Field(description="This garment's distinct fabrics")
    patterns: list[PatternSwatch] = Field(description="This garment's patterns; [] if none")


class LookLevel(BaseModel):
    silhouette_description: str = Field(
        description="Cut/construction of the whole look, as a designer would note it"
    )
    color_story: list[str]


class VisionResult(BaseModel):
    """Exactly what the vision model must return (Gemini response_schema)."""

    garments: list[Garment] = Field(description="Each distinct apparel garment")
    look_level: LookLevel


# --- Stored variants (add generated-swatch asset references) ----------------

class StoredFabric(FabricSwatch):
    swatch_asset: str = ""  # assets/<look_id>/g<gi>_fabric_<fi>.png


class StoredPattern(PatternSwatch):
    swatch_asset: str = ""  # assets/<look_id>/g<gi>_pattern_<pi>.png


class StoredGarment(BaseModel):
    piece: str
    color_palette: list[ColorSwatch] = Field(default_factory=list)
    fabrics: list[StoredFabric] = Field(default_factory=list)
    patterns: list[StoredPattern] = Field(default_factory=list)


class StoredLookLevel(LookLevel):
    sketch_asset: str = ""  # assets/<look_id>/sketch.png


# --- Full on-disk record ----------------------------------------------------

class Provenance(BaseModel):
    designer: str
    collection: str = ""
    source_runway_url: str = ""
    runway_image: str = ""
    detail_images: list[str] = Field(default_factory=list)


class Processing(BaseModel):
    model_vision: str
    model_image: str
    status: Status
    errors: list[str] = Field(default_factory=list)


class LookRecord(BaseModel):
    look_id: str
    provenance: Provenance
    garments: list[StoredGarment] = Field(default_factory=list)
    look_level: StoredLookLevel
    processing: Processing
