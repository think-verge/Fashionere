"""Attach TREND to the canonical layer — build recency-weighted trend sheets.

Per brand: read canonical_looks → bridge → normalize (colours deterministic +
attributes via Gemini) → recency-weighted aggregate → store the sheet.

Normalized (tagged) looks are CACHED in Mongo (`tagged_looks`) keyed by
look_id + vocab/prompt version, so re-runs don't re-call the LLM. Normalization
runs in parallel. Additive: no legacy trend file is modified.

    python -m trend_engine.canonical.build_sheets --env ../.env [--brand chanel] [--limit N]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "core"))

from dotenv import dotenv_values
from pymongo import MongoClient

from fashionairre_core.store import CanonicalStore
from trend_engine.canonical import aggregate_weighted as agg
from trend_engine.canonical.bridge import look_from_canonical
from trend_engine.config import config as tconfig
from trend_engine.normalize.pipeline import normalize_look
from trend_engine.schema.look import Look as TrendLook
from trend_engine.schema.trends import TrendSheet


def _gemini(api_key: str):
    from google import genai
    from google.genai import types
    # hard per-request timeout (ms) so a hung call fails fast → our retry/skip handles it,
    # instead of blocking a worker forever (that was the 4-hour stall).
    return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=90000))


def build_brand_sheet(
    bslug: str,
    *,
    canon: CanonicalStore,
    tagged_coll,
    sheets_coll,
    gclient,
    limit: int | None = None,
    drop_cache: bool = False,
    window_only: bool = False,
    on_progress: Callable[[str, dict], None] | None = None,
) -> tuple[TrendSheet | None, list[str], dict]:
    """Per-brand pipeline: canonical looks -> tag/normalize (cached) -> recency-
    weighted aggregate -> TrendSheet. Extracted from main()'s loop body so both
    the CLI and the live-generation API call the identical logic.

    Returns (sheet, review_summaries, stats) where summaries are deduped-by-
    collection Vogue review text for narration, stats is {"cached", "normalized"}
    look counts, and sheet is None if the brand has no looks.
    """
    vv, pv = tconfig.VOCAB_VER, tconfig.PROMPT_VER
    canon_looks = list(canon.iter(brand_slug=bslug))

    if window_only:
        # Pre-filter to the same {C-1,C(,C-2)} recency window agg.build_sheet()
        # would apply anyway — avoids LLM-tagging looks that get discarded,
        # which matters for an interactive/live request but is left off for the
        # CLI's batch job (window_only=False, unchanged) so tagged_looks stays
        # warm across a brand's full history for future rolling-window shifts.
        years_all = sorted({cl.context.year for cl in canon_looks if cl.context.year})
        window = set(years_all[-3:])
        canon_looks = [cl for cl in canon_looks if cl.context.year in window]

    if limit:
        canon_looks = canon_looks[:limit]
    if not canon_looks:
        return None, [], {"cached": 0, "normalized": 0}

    # 1) reuse cached tags; normalize the rest in parallel
    tagged, todo = [], []
    for cl in canon_looks:
        doc = None if drop_cache else tagged_coll.find_one(
            {"_id": cl.look_id, "vocab_ver": vv, "prompt_ver": pv})
        if doc:
            tagged.append(TrendLook.model_validate(doc["look"]))
        else:
            todo.append(cl)

    def _work(cl):
        # retry transient errors (503/429/high-demand); skip (not crash) if it never succeeds
        for attempt in range(4):
            try:
                tl = look_from_canonical(cl)
                normalize_look(tl, do_colors=True, do_attributes=True, client=gclient)
                return tl
            except Exception as e:  # noqa: BLE001
                if attempt < 3:
                    time.sleep(2 * (2 ** attempt))
                else:
                    print(f"   ! skip {cl.look_id}: {type(e).__name__}: {str(e)[:70]}")
                    return None

    cached_count = len(tagged)
    normalized = 0
    if on_progress:
        on_progress("normalizing_start", {"cached": cached_count, "todo": len(todo)})
    if todo:
        print(f"[{bslug}] normalizing {len(todo)} looks ({len(tagged)} cached)…", flush=True)
        done = 0
        with ThreadPoolExecutor(max_workers=6) as ex:
            for tl in ex.map(_work, todo):
                done += 1
                if done % 20 == 0:
                    print(f"   [{bslug}] {done}/{len(todo)} processed", flush=True)
                if on_progress:
                    on_progress("normalizing_progress", {"done": done, "todo": len(todo)})
                if tl is None:
                    continue
                tagged_coll.replace_one(
                    {"_id": tl.look_id},
                    {"_id": tl.look_id, "vocab_ver": vv, "prompt_ver": pv, "look": tl.model_dump()},
                    upsert=True)
                tagged.append(tl)
                normalized += 1

    # 2) recency-weighted aggregate → sheet
    if on_progress:
        on_progress("aggregating_start", {})
    brand_name = tagged[0].brand if tagged else bslug
    sheet = agg.build_sheet(tagged, brand_name, bslug)

    # 3) collect collection-level review summaries (for narration), deduped by
    # collection, restricted to the sheet's in-scope window years — this data
    # lives on the canonical record (native_text["summary"]) but was never
    # wired through this Mongo path before (only the disconnected local-file
    # jobs/report.py path had it, via a differently-shaped Collection object).
    window_years = set(sheet.window_years)
    seen_coll_ids: set[str] = set()
    summaries: list[str] = []
    for cl in canon_looks:
        cid = cl.context.collection_id
        if cl.context.year in window_years and cid and cid not in seen_coll_ids:
            seen_coll_ids.add(cid)
            s = cl.native_text.get("summary")
            if s:
                summaries.append(s)

    return sheet, summaries, {"cached": cached_count, "normalized": normalized}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="build_sheets.py")
    ap.add_argument("--env", default=".env")
    ap.add_argument("--brand", default=None, help="single brand slug (default: all)")
    ap.add_argument("--limit", type=int, default=None, help="cap looks per brand (validation)")
    ap.add_argument("--drop-cache", action="store_true", help="ignore cached tags, re-normalize")
    ap.add_argument("--out", default="output/trends_canonical")
    a = ap.parse_args(argv)

    env = dotenv_values(a.env)
    uri, key = env.get("MONGO_URI"), env.get("GEMINI_API_KEY")
    if not uri or not key:
        print("MONGO_URI / GEMINI_API_KEY missing in --env", file=sys.stderr)
        return 2

    m = MongoClient(uri, serverSelectionTimeoutMS=15000)
    canon = CanonicalStore(m["Fashionere"]["canonical_looks"])
    tagged_coll = m["Fashionere"]["tagged_looks"]
    sheets_coll = m["Fashionere"]["trend_sheets"]
    gclient = _gemini(key)

    brands = [a.brand] if a.brand else canon.brands()
    out_dir = Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    for bslug in brands:
        sheet, _summaries, stats = build_brand_sheet(
            bslug, canon=canon, tagged_coll=tagged_coll, sheets_coll=sheets_coll,
            gclient=gclient, limit=a.limit, drop_cache=a.drop_cache,
        )
        if sheet is None:
            print(f"[{bslug}] no canonical looks; skipping")
            continue

        sheets_coll.replace_one({"_id": bslug}, {"_id": bslug, **sheet.model_dump(mode="json")}, upsert=True)
        (out_dir / f"{bslug}-overall.json").write_text(
            json.dumps(sheet.model_dump(mode="json"), indent=2, ensure_ascii=False), encoding="utf-8")

        # summary
        print(f"\n[{sheet.brand}]  window {sheet.window_years} (2025 weight {agg.DECAY}) · "
              f"{sheet.total_looks} looks · reused {stats['cached']} cached / normalized {stats['normalized']}",
              flush=True)
        for dim in ("colors", "fabrics", "silhouettes"):
            top = sheet.dimensions[dim].ranked[:4]
            def fmt(rv):
                mk = (rv.momentum.kind if rv.momentum else "?")
                dd = (f"{rv.momentum.yoy_delta*100:+.0f}pt" if rv.momentum and rv.momentum.yoy_delta is not None else "")
                return f"{rv.value} {rv.share*100:.0f}% [{mk} {dd}]"
            print(f"   {dim:12}: " + " · ".join(fmt(r) for r in top), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
