"""POST /api/generate/stream — live single-brand trend report generation
(Flow 2 only). Streams NDJSON stage-progress events, then persists the
narrated TrendSheet to Fashionere.trend_sheets so the dashboard picks it up
on its next fetch.

Wire format (one JSON object per line, media_type=application/x-ndjson):
    {"type": "stage", "stage": "loading_looks", "brand_slug": "..."}
    {"type": "stage", "stage": "normalizing"}
    {"type": "progress", "stage": "normalizing_progress", "done": N, "todo": T}  (repeated)
    {"type": "stage", "stage": "aggregating"}
    {"type": "stage", "stage": "narrating"}
    {"type": "stage", "stage": "persisting"}
    {"type": "done", "sheet": {...TrendSheet incl. report...}}
    {"type": "error", "detail": "..."}   (any point, terminal)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pymongo import MongoClient

from fashionairre_core.store import CanonicalStore
from trend_engine.canonical import compare as cmp
from trend_engine.canonical.build_sheets import _gemini, build_brand_sheet
from trend_engine.compose.model import build_report_model
from trend_engine.compose.narrator import narrate
from trend_engine.compose.render import render_html
from trend_engine.config import config
from trend_engine.schema.trends import TrendReport, TrendReportPullQuote, TrendReportSection

router = APIRouter(prefix="/api")


class GenerateRequest(BaseModel):
    brand_slug: str


def _evt(type_: str, **kw) -> str:
    return json.dumps({"type": type_, **kw}, ensure_ascii=False, default=str) + "\n"


@router.post("/generate/stream")
def generate_stream(req: GenerateRequest) -> StreamingResponse:
    def generate():
        try:
            brand_slug = req.brand_slug.strip()
            if not brand_slug:
                yield _evt("error", detail="brand_slug is required")
                return

            if not config.MONGO_URI or not config.GEMINI_API_KEY:
                yield _evt("error", detail="MONGO_URI/GEMINI_API_KEY not configured")
                return

            m = MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=15000)
            canon = CanonicalStore(m["Fashionere"]["canonical_looks"])
            tagged_coll = m["Fashionere"]["tagged_looks"]
            sheets_coll = m["Fashionere"]["trend_sheets"]

            yield _evt("stage", stage="loading_looks", brand_slug=brand_slug)
            if canon.c.count_documents({"context.brand_slug": brand_slug}) == 0:
                yield _evt("error", detail=f"no canonical looks for brand_slug={brand_slug}")
                return

            gclient = _gemini(config.GEMINI_API_KEY)

            # build_brand_sheet's tagging loop is a blocking ThreadPoolExecutor
            # call — a plain generator can't yield from inside that nested
            # frame, so on_progress buffers events here and this generator
            # flushes them in one batch right after the call returns. Shipping
            # this coarser granularity first (one "it's working" gap during
            # tagging, then a catch-up burst) rather than rewriting the tagging
            # loop into a generator itself, which would be a larger change.
            buffered: list[dict] = []

            def on_progress(stage: str, data: dict) -> None:
                buffered.append({"stage": stage, **data})

            yield _evt("stage", stage="normalizing")
            sheet, summaries, _stats = build_brand_sheet(
                brand_slug, canon=canon, tagged_coll=tagged_coll, sheets_coll=sheets_coll,
                gclient=gclient, window_only=True, on_progress=on_progress,
            )
            for e in buffered:
                yield _evt("progress", **e)

            if sheet is None:
                yield _evt("error", detail=f"no canonical looks for brand_slug={brand_slug}")
                return

            yield _evt("stage", stage="aggregating")
            yield _evt("stage", stage="narrating")
            model = build_report_model(sheet)
            model = narrate(model, summaries, client=gclient)
            html = render_html(model)

            sheet.report = TrendReport(
                headline=model.headline,
                standfirst=model.standfirst,
                at_a_glance=model.at_a_glance,
                sections=[
                    TrendReportSection(
                        dimension=s.dimension, label=s.label, coined_name=s.coined_name,
                        narrative=s.narrative, designer_cue=s.designer_cue,
                    )
                    for s in model.sections
                ],
                pull_quote=TrendReportPullQuote(
                    text=model.pull_quote.text, attribution=model.pull_quote.attribution,
                ),
                rendered_html=html,
                generated_at=datetime.now(timezone.utc).isoformat(),
                narrate_model=config.NARRATE_MODEL,
            )

            yield _evt("stage", stage="persisting")
            sheets_coll.replace_one(
                {"_id": brand_slug}, {"_id": brand_slug, **sheet.model_dump(mode="json")}, upsert=True,
            )

            yield _evt("done", sheet=sheet.model_dump(mode="json"))
        except Exception as exc:  # noqa: BLE001
            yield _evt("error", detail=str(exc))

    return StreamingResponse(generate(), media_type="application/x-ndjson",
                              headers={"Cache-Control": "no-cache"})


# --- on-demand comparison endpoints (runtime compute from cached sheets) -----
@lru_cache(maxsize=1)
def _sheets_coll():
    return MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=15000)["Fashionere"]["trend_sheets"]


@router.get("/compare/options")
def compare_options():
    """Brands available to compare (drives the dropdown)."""
    return {"brands": cmp.brand_options(_sheets_coll())}


@router.get("/season/options")
def season_options():
    """(year, season, category) buckets with >=2 brands (drives the dropdown)."""
    return {"seasons": cmp.season_options(_sheets_coll())}


@router.get("/compare")
def compare(a: str = Query(..., description="brand slug A"),
            b: str = Query(..., description="brand slug B")):
    """Brand-vs-brand comparison + editorial narration, computed live."""
    try:
        data = cmp.compare_brands(_sheets_coll(), a, b)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    try:
        data["report"] = cmp.narrate_compare(data)   # editorial prose (best-effort)
    except Exception:  # noqa: BLE001 — never fail the numbers if narration hiccups
        data["report"] = None
    return data


@router.get("/season")
def season(year: int = Query(..., description="e.g. 2026"),
           season: str = Query(..., description="e.g. Fall"),
           category: str = Query("rtw", description="rtw | couture | resort | pre-fall")):
    """Season-wide cross-brand comparison + editorial narration, computed live."""
    try:
        data = cmp.season_report(_sheets_coll(), year, season, category)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    try:
        data["report"] = cmp.narrate_season(data)     # editorial prose (best-effort)
    except Exception:  # noqa: BLE001
        data["report"] = None
    return data
