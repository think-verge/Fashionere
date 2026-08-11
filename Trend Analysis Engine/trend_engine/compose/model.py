"""Composer — builds the report skeleton from the trend sheet. Fills ONLY the
numeric/evidence fields (deterministic). Prose is left blank for the narrator.
Rising/fading lists include only trustworthy momentum. See DESIGN.md §11.2.
"""
from __future__ import annotations

from trend_engine.schema.report import CollageImage, ReportModel, ReportRankedItem, ReportSection
from trend_engine.schema.trends import TrendSheet

LABELS = {"colors": "Colour", "fabrics": "Fabric", "patterns": "Pattern",
          "silhouettes": "Silhouette", "themes": "Mood", "details": "Details"}
ORDER = ["colors", "fabrics", "patterns", "silhouettes", "themes", "details"]

# Weighted image allocation for the per-section collage: (min share, #images).
# Anything below the last cutoff gets NO image — the light/clean threshold.
COLLAGE_TIERS = [(0.40, 3), (0.25, 2), (0.15, 1)]
COLLAGE_MAX = 6  # cap images per section


def _collage(agg) -> list[CollageImage]:
    """Pick images per attribute, weighted by dominance; skip attributes under
    the threshold. Draws from each value's evidence looks that carry an image URL."""
    out: list[CollageImage] = []
    seen: set[str] = set()
    for rv in agg.ranked:
        want = next((n for thr, n in COLLAGE_TIERS if rv.share >= thr), 0)
        if not want:
            continue
        added = 0
        for ev in rv.evidence:
            if not ev.image or ev.image in seen:
                continue
            seen.add(ev.image)
            out.append(CollageImage(image=ev.image, value=rv.value,
                                    collection_id=ev.collection_id, look_number=ev.look_number))
            added += 1
            if added >= want or len(out) >= COLLAGE_MAX:
                break
        if len(out) >= COLLAGE_MAX:
            break
    return out


def _item(rv) -> ReportRankedItem:
    m = rv.momentum
    return ReportRankedItem(
        value=rv.value, share=rv.share, signature=rv.signature_score,
        kind=(m.kind if m else None), delta=(m.yoy_delta if m else None),
        trustworthy=(m.trustworthy if m else True),
    )


def build_report_model(sheet: TrendSheet) -> ReportModel:
    sections = []
    for dim in ORDER:
        agg = sheet.dimensions.get(dim)
        if not agg or not agg.ranked:
            continue
        rising = sorted(
            (_item(rv) for rv in agg.ranked
             if rv.momentum and rv.momentum.trustworthy and rv.momentum.kind in ("rising", "emerging")),
            key=lambda i: (i.delta or 0), reverse=True)
        fading = sorted(
            (_item(rv) for rv in agg.ranked
             if rv.momentum and rv.momentum.trustworthy and rv.momentum.kind in ("fading", "dropped")),
            key=lambda i: (i.delta or 0))
        sections.append(ReportSection(
            dimension=dim, label=LABELS[dim],
            top=[_item(rv) for rv in agg.ranked[:6]],
            rising=rising[:4], fading=fading[:4],
            palette=agg.palette[:6],
            evidence=agg.ranked[0].evidence,
            collage=_collage(agg),
        ))
    return ReportModel(
        brand=sheet.brand, report_type=sheet.report_type,
        window={"years": sheet.window_years, "collections": sheet.collections, "looks": sheet.total_looks},
        sections=sections,
        provenance={"sources": ["vogue"], "generated_for_year": max(sheet.window_years), **sheet.generated},
    )
