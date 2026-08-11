"""deconstruction adapter — a deconstruction-engine record → canonical `Extraction`.

The deconstruction engine already produces per-garment palette/fabrics/patterns
with pantone + `source` bounding boxes. This maps that record onto the canonical
`extraction` (the vision-source path). Its swatch/sketch asset paths are dropped
here — those are derived artefacts, not part of the source of truth.
"""

from __future__ import annotations

from fashionairre_core.schema import (
    ColorSwatch,
    Extraction,
    Fabric,
    Garment,
    LookLevel,
    Pattern,
    SourceRegion,
)

_CONF = {"high": 0.9, "medium": 0.6, "low": 0.3}


def _region(src: dict | None) -> SourceRegion | None:
    src = src or {}
    if src.get("box"):
        return SourceRegion(image_id=f"img{src.get('image_index', 0)}", box=src["box"])
    return None


def extraction_from_record(rec: dict) -> Extraction:
    garments = []
    for gi, g in enumerate(rec.get("garments", []) or []):
        colors = [
            ColorSwatch(name=c.get("name") or "", hex=c.get("hex"), pantone=c.get("pantone"),
                        role=c.get("role", "accent"))
            for c in g.get("color_palette", []) or []
        ]
        fabrics = [
            Fabric(material=f.get("material"), weight=f.get("weight"), finish=f.get("finish"),
                   description=f.get("description"), confidence=_CONF.get(f.get("confidence")),
                   source_region=_region(f.get("source")))
            for f in g.get("fabrics", []) or []
        ]
        patterns = [
            Pattern(repeat_type=p.get("type", "none"), motif=p.get("motif"), scale=p.get("scale"),
                    colors=p.get("colors", []) or [], description=p.get("description"),
                    source_region=_region(p.get("source")))
            for p in g.get("patterns", []) or []
        ]
        garments.append(Garment(garment_id=f"g{gi}", piece=g.get("piece"),
                                color_palette=colors, fabrics=fabrics, patterns=patterns))

    ll = rec.get("look_level", {}) or {}
    return Extraction(
        garments=garments,
        look_level=LookLevel(silhouette_description=ll.get("silhouette_description"),
                            color_story=ll.get("color_story", []) or [], themes=[], details=[]),
    )
