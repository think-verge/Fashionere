"""Canonical vision extractor — image → `fashionairre_core` Extraction.

Its own LLM-facing schema (per-garment colors/fabrics/patterns + source regions,
PLUS theme + details — the two dimensions the legacy extractor lacked). One
Gemini call, then mapped onto the shared canonical `Extraction`. Reuses only the
legacy engine's Gemini client/config (schema-agnostic); defines its own schema so
it has no dependency on src/schemas.py.
"""

from __future__ import annotations

from typing import Literal

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from src import config as dcfg  # legacy config: API key + model ids (not schema)

# canonical (source of truth) — read-only
from fashionairre_core.schema import (  # noqa: E402  (import after sys.path shim in __init__)
    ColorSwatch,
    DetailTag,
    Extraction,
    Fabric,
    Garment,
    LookLevel,
    Pattern,
    SourceRegion,
    ThemeTag,
)

_Role = Literal["dominant", "secondary", "accent"]
_Conf = Literal["high", "medium", "low"]
_Repeat = Literal["none", "repeat", "placement_appliqué"]
_CONF = {"high": 0.9, "medium": 0.6, "low": 0.3}


# --- LLM-facing response schema (kept separate from canonical) ---------------
class _Box(BaseModel):
    image_index: int
    box: list[int] = Field(description="[ymin, xmin, ymax, xmax] normalized 0-1000")


class _Color(BaseModel):
    name: str
    pantone: str = Field(description="nearest Pantone TCX, e.g. '19-4005 TCX Caviar'")
    hex: str
    role: _Role


class _Fabric(BaseModel):
    name: str
    material: str
    weight: str
    finish: str
    confidence: _Conf
    description: str
    source: _Box


class _Pattern(BaseModel):
    name: str
    type: _Repeat
    motif: str
    scale: str
    colors: list[str]
    description: str
    is_brand_mark: bool
    source: _Box


class _Garment(BaseModel):
    piece: str
    color_palette: list[_Color]
    fabrics: list[_Fabric]
    patterns: list[_Pattern]


class _Theme(BaseModel):
    value: str


class _Detail(BaseModel):
    value: str
    type: str


class CanonicalVision(BaseModel):
    """Exactly what the vision model returns for one look."""
    garments: list[_Garment]
    silhouette_description: str
    color_story: list[str]
    themes: list[_Theme]
    details: list[_Detail]


PROMPT = (
    "You are a fashion technical analyst. Images are numbered from 0 in order. "
    "Split the look FINELY into distinct apparel garments/layers/fabric sections "
    "(e.g. a tweed jacket and a tulle skirt are two garments). For each garment: "
    "piece; color_palette (name, nearest Pantone TCX, approximate hex, role); "
    "fabrics (name incl. colour, material, weight, finish, confidence, one-line "
    "description, and source={image_index, box[ymin,xmin,ymax,xmax] 0-1000 around a "
    "clean patch of ONLY that fabric — avoid face/skin/background}); patterns "
    "(name, type[none|repeat|placement_appliqué], motif, scale, colors, one-line "
    "description, is_brand_mark, source). Do NOT tag brand logos/monograms/crests as "
    "patterns — set is_brand_mark true and exclude them. Then look-level: "
    "silhouette_description, color_story, themes (mood/theme values), and details "
    "(accessories: bag, gloves, jewelry, with a type). Ignore shoes only for "
    "garments but DO list them under details. Output must match the JSON schema."
)


def extract(runway_bytes: bytes | None, detail_images: list[bytes], *, quality: bool = False):
    """Run the vision extraction. Returns (canonical Extraction, raw CanonicalVision)."""
    # Reuse the legacy engine's cached client + schema-agnostic helpers (read-only).
    from src.deconstruct import order_images, _part_from_bytes, _ClientHolder

    images = order_images(runway_bytes, detail_images)
    if not images:
        return Extraction(), None

    contents: list = [types.Part.from_text(text=PROMPT)]
    for i, img in enumerate(images):
        role = "runway" if (i == 0 and runway_bytes) else "detail"
        contents.append(types.Part.from_text(text=f"Image {i} ({role}):"))
        contents.append(_part_from_bytes(img))

    model = dcfg.VISION_MODEL_QUALITY if quality else dcfg.VISION_MODEL_FAST
    resp = _ClientHolder.get().models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json", response_schema=CanonicalVision
        ),
    )
    cv = resp.parsed if isinstance(resp.parsed, CanonicalVision) else CanonicalVision.model_validate_json(resp.text)
    return to_canonical(cv), cv


def to_canonical(cv: CanonicalVision) -> Extraction:
    """Map the LLM result onto the shared canonical Extraction."""
    def region(b: _Box | None) -> SourceRegion | None:
        return SourceRegion(image_id=f"img{b.image_index}", box=b.box) if b else None

    garments = []
    for gi, g in enumerate(cv.garments):
        garments.append(Garment(
            garment_id=f"g{gi}",
            piece=g.piece,
            color_palette=[ColorSwatch(name=c.name, pantone=c.pantone or None, hex=c.hex, role=c.role)
                           for c in g.color_palette],
            fabrics=[Fabric(material=f.material, weight=f.weight, finish=f.finish,
                            description=f.description, confidence=_CONF.get(f.confidence),
                            source_region=region(f.source))
                     for f in g.fabrics],
            patterns=[Pattern(repeat_type=p.type, motif=p.motif, scale=p.scale, colors=p.colors,
                              description=p.description, is_brand_mark=p.is_brand_mark,
                              source_region=region(p.source))
                      for p in g.patterns if not p.is_brand_mark],
        ))
    return Extraction(
        garments=garments,
        look_level=LookLevel(
            silhouette_description=cv.silhouette_description,
            color_story=cv.color_story,
            themes=[ThemeTag(value=t.value) for t in cv.themes],
            details=[DetailTag(value=d.value, type=d.type) for d in cv.details],
        ),
    )
