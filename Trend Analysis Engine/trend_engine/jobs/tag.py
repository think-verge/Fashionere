"""Tidy stage (Phase 2, full) — color + AI attribute tagging for every look.

Colors are tagged deterministically for all looks; the five text dimensions are
tagged by Gemini concurrently (with retries). Prints the attribute piles and an
unmapped summary, then writes the normalized snapshot.

Usage:
    python -m trend_engine.jobs.tag --input Prada --limit 12   # small test
    python -m trend_engine.jobs.tag --input Prada              # full run
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from trend_engine.config import config
from trend_engine.jobs.ingest import ingest
from trend_engine.normalize.attributes import _client, extract_look, map_to_tags
from trend_engine.normalize.color import color_tags_for_look
from trend_engine.scope import policies

DIMS = ["fabrics", "patterns", "silhouettes", "themes", "details"]


def _tag_one(look, client, retries: int = 3):
    for attempt in range(retries):
        try:
            return map_to_tags(look, extract_look(look, client=client)), None
        except Exception as e:  # transient API / rate-limit errors
            if attempt == retries - 1:
                return [], f"{type(e).__name__}: {str(e)[:140]}"
            time.sleep(2 * (attempt + 1))
    return [], "unknown"


def main() -> None:
    ap = argparse.ArgumentParser(description="Color + AI attribute tagging (Phase 2).")
    ap.add_argument("--input", default="Prada")
    ap.add_argument("--report-type", default="overall")
    ap.add_argument("--limit", type=int, default=0, help="tag only the first N looks (0 = all)")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--out", default="output/normalized")
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    collections, looks = ingest(Path(args.input))
    for lk in looks:
        lk.tags.colors = color_tags_for_look(lk)  # deterministic, everyone

    targets = looks[: args.limit] if args.limit else looks
    client = _client()  # raises clearly if GEMINI_API_KEY missing

    print(f"AI-tagging {len(targets)} looks · {args.workers} workers · model={config.NORMALIZE_MODEL}")
    t0 = time.time()
    unmapped: list[tuple[str, str]] = []
    failures: list[tuple[str, str]] = []
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(_tag_one, lk, client): lk for lk in targets}
        for fut in as_completed(futs):
            lk = futs[fut]
            um, err = fut.result()
            done += 1
            if err:
                failures.append((lk.look_id, err))
            else:
                unmapped.extend((u.dimension, u.raw_phrase) for u in um)
            if done % 25 == 0 or done == len(targets):
                print(f"  {done}/{len(targets)}  ({time.time() - t0:.0f}s)")

    print(f"\nDone in {time.time() - t0:.0f}s · failures={len(failures)}")
    for lid, err in failures[:5]:
        print(f"   FAIL {lid}: {err}")

    # ---- attribute piles across the window ----
    brand_slug = collections[0].brand_slug
    years = sorted({c.year for c in collections})
    scope = policies.resolve(args.report_type, brand_slug, available_years=years)
    in_scope = [lk for lk in targets if scope.matches(lk)]
    n = max(len(in_scope), 1)
    print(f"\nAttribute piles across window {scope.years} ({len(in_scope)} tagged looks in scope):")
    for dim in DIMS:
        counts: Counter = Counter()
        for lk in in_scope:
            counts.update({t.value for t in getattr(lk.tags, dim)})
        print(f"\n  {dim.upper()}")
        for val, cnt in counts.most_common(6):
            print(f"    {val:<24} {cnt:>3}  {100 * cnt / n:>4.0f}%")

    um_counts = Counter(f"{d}:{p}" for d, p in unmapped)
    print(f"\nTop unmapped phrases (vocab-growth candidates):")
    for phrase, cnt in um_counts.most_common(8):
        print(f"    {cnt:>3}  {phrase}")

    if not args.no_write:
        out_dir = Path(args.out)
        out_dir.mkdir(parents=True, exist_ok=True)
        for c in collections:
            payload = {
                "collection": c.model_dump(by_alias=True, mode="json"),
                "looks": [lk.model_dump(by_alias=True, mode="json")
                          for lk in looks if lk.collection_id == c.collection_id],
            }
            (out_dir / f"{c.collection_id}.json").write_text(
                json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nWrote normalized snapshot -> {out_dir}/")


if __name__ == "__main__":
    main()
