"""MVP batch runner — deconstruct N looks per brand, persist swatches, resumable.

    python -m src.canonical.run_mvp --per-brand 2            # the MVP batch
    python -m src.canonical.run_mvp --dry-run-one            # ONE look, end-to-end proof
    python -m src.canonical.run_mvp --brand prada --per-brand 2
    python -m src.canonical.run_mvp --export ./swatch_export # dump stored swatches to disk

Reads env MONGO_URI + FAL_KEY (loads Deconstruction Engine/src/.env and the Trend .env).
Skips looks already done (unless --force). Prints a running fal-cost tally.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

# .../Deconstruction Engine/src/canonical/run_mvp.py -> parents[3] = Fashionairre root
_ROOT = Path(__file__).resolve().parents[3]


def _load_env():
    for rel in ("Deconstruction Engine/src/.env", "Trend Analysis Engine/.env"):
        p = _ROOT / rel
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.+)$", line)
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip()
    os.environ.setdefault("FAL_KEY", os.environ.get("FAL_API_KEY", ""))


def _pick_looks(canon, per_brand: int, only_brand: str | None):
    """Pick `per_brand` looks per brand: evenly spaced by look number, runway present."""
    by_brand: dict[str, list] = {}
    q = {"images.role": "runway"}
    for d in canon.find(q, {"look_id": 1}):
        brand = d["look_id"].split(":")[0]
        if only_brand and brand != only_brand:
            continue
        by_brand.setdefault(brand, []).append(d["look_id"])
    picked = []
    for brand, ids in sorted(by_brand.items()):
        def _num(lid):
            tail = lid.rsplit(":", 1)[-1]
            return int(tail) if tail.isdigit() else 0
        ids = sorted(ids, key=_num)
        n = len(ids)
        if n <= per_brand:
            picked += ids
        else:
            # evenly spaced positions (avoids always taking look 1)
            picked += [ids[int((i + 1) * n / (per_brand + 1))] for i in range(per_brand)]
    return picked


def main(argv=None) -> int:
    _load_env()
    ap = argparse.ArgumentParser(prog="run_mvp")
    ap.add_argument("--per-brand", type=int, default=2)
    ap.add_argument("--brand", default=None)
    ap.add_argument("--dry-run-one", action="store_true", help="process a single look and stop")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--export", default=None, help="export stored swatches to this dir and exit")
    args = ap.parse_args(argv)

    sys.path.insert(0, str(_ROOT / "Deconstruction Engine"))
    from pymongo import MongoClient
    from src.canonical.store_mongo import DeconstructionStore
    from src.canonical import deconstruct_gemini_fal as df
    from src.canonical import fal_backend as fb

    store = DeconstructionStore()

    if args.export:
        n = 0
        for rec in store.decon.find({"status": "complete"}):
            n += len(store.export_look(rec["_id"], args.export))
        print(f"exported {n} swatches to {args.export}"); return 0

    canon = MongoClient(os.environ["MONGO_URI"], serverSelectionTimeoutMS=15000)["Fashionere"]["canonical_looks"]
    picks = _pick_looks(canon, args.per_brand, args.brand)
    if args.dry_run_one:
        picks = picks[:1]
    print(f"selected {len(picks)} looks: {picks}\n")

    cost = fb.Cost()
    done = fail = 0
    for i, lid in enumerate(picks, 1):
        look = canon.find_one({"look_id": lid})
        rec = df.deconstruct_look(look, store, cost, force=args.force)
        st = rec["status"]
        ng = len(rec.get("garments", []))
        print(f"[{i}/{len(picks)}] {lid}: {st}  garments={ng}  running={cost}")
        if rec.get("errors"):
            print(f"      errors: {rec['errors']}")
        done += st == "complete"; fail += st == "failed"

    print(f"\n==== DONE: {done} complete, {fail} failed ====")
    print(f"fal spend this run: {cost}")
    print(f"store stats: {store.stats()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
