"""Per-COLLECTION trend sheets (report_type="collection") — additive, no LLM.

A brand sheet aggregates a brand across seasons (with momentum/recency weighting).
A single collection is ONE point in time, so momentum doesn't apply. Instead a
collection sheet carries:
  A) DOMINANCE  — ranked colors/fabrics/patterns/silhouettes/themes/details + shares
                  + palette (reuses aggregate_weighted.build_sheet on that one collection).
  B) vs_brand   — each ranked value's deviation from the brand's baseline share
                  (over-/under-indexed vs the house norm).

Pure re-aggregation of the already-cached `tagged_looks` (no Gemini). Stored in the
SAME `trend_sheets` collection, keyed `_id = "{brand_slug}:{collection_id}"`,
`report_type="collection"` — alongside the brand ("overall") sheets.

    python -m trend_engine.canonical.build_collection_sheets --env ../.env [--brand prada]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "core"))

from dotenv import dotenv_values
from pymongo import MongoClient

from trend_engine.canonical import aggregate_weighted as agg
from trend_engine.config import config as tconfig
from trend_engine.schema.look import Look as TrendLook

OVER_THRESH = 0.05   # +/-5 share points vs brand baseline => over/under-indexed


def _baselines(sheets_coll) -> dict:
    """brand_slug -> {dim -> {value -> brand_share}} from the 'overall' sheets."""
    out: dict = {}
    for s in sheets_coll.find({"report_type": "overall"}):
        dims = {}
        for dim, agg_ in (s.get("dimensions") or {}).items():
            dims[dim] = {rv["value"]: rv.get("share", 0.0) for rv in (agg_.get("ranked") or [])}
        out[s.get("brand_slug", s["_id"])] = dims
    return out


def _vs_brand(coll_share: float, brand_share: float) -> dict:
    delta = round(coll_share - brand_share, 4)
    kind = "over" if delta >= OVER_THRESH else "under" if delta <= -OVER_THRESH else "on_par"
    return {"brand_share": round(brand_share, 4), "delta": delta, "kind": kind}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="build_collection_sheets.py")
    ap.add_argument("--env", default=".env")
    ap.add_argument("--brand", default=None, help="single brand slug (default: all done brands)")
    ap.add_argument("--out", default="output/trends_canonical")
    a = ap.parse_args(argv)

    env = dotenv_values(a.env)
    uri = env.get("MONGO_URI")
    if not uri:
        print("MONGO_URI missing in --env", file=sys.stderr); return 2

    m = MongoClient(uri, serverSelectionTimeoutMS=15000)
    tagged_coll = m["Fashionere"]["tagged_looks"]
    sheets_coll = m["Fashionere"]["trend_sheets"]

    baselines = _baselines(sheets_coll)

    # group cached tagged looks by (brand_slug, collection_id)
    groups: dict = defaultdict(list)
    for doc in tagged_coll.find({}):
        tl = TrendLook.model_validate(doc["look"])
        if a.brand and tl.brand_slug != a.brand:
            continue
        groups[(tl.brand_slug, tl.collection_id)].append(tl)

    out_dir = Path(a.out); out_dir.mkdir(parents=True, exist_ok=True)
    built = skipped = 0
    for (bslug, cid), looks in sorted(groups.items()):
        # B (vs_brand) needs a valid brand baseline; skip brands with no 'overall' sheet
        # (e.g. gucci — only partially tagged, no finished brand sheet).
        if bslug not in baselines:
            print(f"[skip] {bslug}:{cid} — no brand baseline; skipping (vs_brand would be invalid)")
            skipped += 1
            continue
        key = f"{bslug}:{cid}"
        brand_name = looks[0].brand
        sheet = agg.build_sheet(looks, brand_name, bslug, report_type="collection")
        d = sheet.model_dump(mode="json")

        # identity + collection context (TrendSheet has no collection_id field)
        d["_id"] = key
        d["collection_id"] = cid
        d["season"] = looks[0].season
        d["year"] = looks[0].year

        # B) deviation vs brand baseline; drop the (meaningless for 1 collection) momentum/signature
        base = baselines.get(bslug, {})
        for dim, agg_ in d["dimensions"].items():
            bmap = base.get(dim, {})
            for rv in agg_["ranked"]:
                rv["vs_brand"] = _vs_brand(rv.get("share", 0.0), bmap.get(rv["value"], 0.0))
                rv["momentum"] = None          # no time axis within one collection
                rv["signature_score"] = None   # signature is a cross-collection measure
        d["generated"]["note"] = ("collection report: momentum/signature N/A; "
                                   "vs_brand = share deviation from the brand 'overall' baseline")

        sheets_coll.replace_one({"_id": key}, d, upsert=True)
        (out_dir / f"{key.replace(':', '__')}-collection.json").write_text(
            json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
        built += 1
        # summary line: top colors with vs-brand deviation
        top = d["dimensions"]["colors"]["ranked"][:3]
        tops = " · ".join(f"{rv['value']} {rv['share']*100:.0f}% ({rv['vs_brand']['kind']} "
                          f"{rv['vs_brand']['delta']*100:+.0f}pt)" for rv in top)
        print(f"[{key}]  {d['total_looks']} looks · colors: {tops}")

    print(f"\nbuilt {built} collection sheets into trend_sheets (report_type='collection'); "
          f"skipped {skipped} (no baseline)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
