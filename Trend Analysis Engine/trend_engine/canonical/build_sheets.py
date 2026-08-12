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

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "core"))

from dotenv import dotenv_values
from pymongo import MongoClient

from fashionairre_core.store import CanonicalStore
from trend_engine.canonical import aggregate_weighted as agg
from trend_engine.canonical.bridge import look_from_canonical
from trend_engine.config import config as tconfig
from trend_engine.normalize.pipeline import normalize_look
from trend_engine.schema.look import Look as TrendLook


def _gemini(api_key: str):
    from google import genai
    from google.genai import types
    # hard per-request timeout (ms) so a hung call fails fast → our retry/skip handles it,
    # instead of blocking a worker forever (that was the 4-hour stall).
    return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=90000))


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
    vv, pv = tconfig.VOCAB_VER, tconfig.PROMPT_VER

    brands = [a.brand] if a.brand else canon.brands()
    out_dir = Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    for bslug in brands:
        canon_looks = list(canon.iter(brand_slug=bslug))
        if a.limit:
            canon_looks = canon_looks[: a.limit]
        if not canon_looks:
            print(f"[{bslug}] no canonical looks; skipping")
            continue

        # 1) reuse cached tags; normalize the rest in parallel
        tagged, todo = [], []
        for cl in canon_looks:
            doc = None if a.drop_cache else tagged_coll.find_one(
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

        normalized = 0
        if todo:
            print(f"[{bslug}] normalizing {len(todo)} looks ({len(tagged)} cached)…", flush=True)
            done = 0
            with ThreadPoolExecutor(max_workers=6) as ex:
                for tl in ex.map(_work, todo):
                    done += 1
                    if done % 20 == 0:
                        print(f"   [{bslug}] {done}/{len(todo)} processed", flush=True)
                    if tl is None:
                        continue
                    tagged_coll.replace_one(
                        {"_id": tl.look_id},
                        {"_id": tl.look_id, "vocab_ver": vv, "prompt_ver": pv, "look": tl.model_dump()},
                        upsert=True)
                    tagged.append(tl)
                    normalized += 1

        # 2) recency-weighted aggregate → sheet
        brand_name = tagged[0].brand if tagged else bslug
        sheet = agg.build_sheet(tagged, brand_name, bslug)
        sheets_coll.replace_one({"_id": bslug}, {"_id": bslug, **sheet.model_dump(mode="json")}, upsert=True)
        (out_dir / f"{bslug}-overall.json").write_text(
            json.dumps(sheet.model_dump(mode="json"), indent=2, ensure_ascii=False), encoding="utf-8")

        # 3) summary
        print(f"\n[{brand_name}]  window {sheet.window_years} (2025 weight {agg.DECAY}) · "
              f"{sheet.total_looks} looks · reused {len(tagged)-normalized} cached / normalized {normalized}",
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
