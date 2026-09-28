"""Retail batch runner — deconstruct retail product looks (single-garment mode).

    python -m src.canonical.run_retail --per-brand 5
    python -m src.canonical.run_retail --brand zara --per-brand 10
    python -m src.canonical.run_retail --dry-run-one
    python -m src.canonical.run_retail --look-id "zara:product:3046-276"

Reads env MONGO_URI + FAL_KEY (loads .env files from engine + trend dirs).
Skips looks already done (unless --force). Prints a running fal-cost tally.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]

RETAIL_BRANDS = {"zara", "hm", "uniqlo"}


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
    """Pick retail looks: products with product_front or product_detail images."""
    by_brand: dict[str, list] = {}
    q = {"images.role": {"$in": ["product_front", "product_detail"]}}
    for d in canon.find(q, {"look_id": 1}):
        brand = d["look_id"].split(":")[0]
        if brand not in RETAIL_BRANDS:
            continue
        if only_brand and brand != only_brand:
            continue
        by_brand.setdefault(brand, []).append(d["look_id"])
    picked = []
    for brand, ids in sorted(by_brand.items()):
        ids = sorted(ids)
        n = len(ids)
        if n <= per_brand:
            picked += ids
        else:
            picked += [ids[int((i + 1) * n / (per_brand + 1))] for i in range(per_brand)]
    return picked


def main(argv=None) -> int:
    _load_env()
    ap = argparse.ArgumentParser(prog="run_retail")
    ap.add_argument("--per-brand", type=int, default=5)
    ap.add_argument("--brand", default=None)
    ap.add_argument("--look-id", default=None, help="deconstruct a single look by ID")
    ap.add_argument("--dry-run-one", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args(argv)

    sys.path.insert(0, str(_ROOT / "Deconstruction Engine"))
    from pymongo import MongoClient
    from src.canonical.store_mongo import DeconstructionStore
    from src.canonical import deconstruct_gemini_fal as df
    from src.canonical import fal_backend as fb

    store = DeconstructionStore()
    canon = MongoClient(os.environ["MONGO_URI"],
                        serverSelectionTimeoutMS=15000)["Fashionere"]["canonical_looks"]

    if args.look_id:
        picks = [args.look_id]
    else:
        picks = _pick_looks(canon, args.per_brand, args.brand)
    if args.dry_run_one:
        picks = picks[:1]
    print(f"selected {len(picks)} retail looks: {picks}\n")

    cost = fb.Cost()
    done = fail = 0
    for i, lid in enumerate(picks, 1):
        look = canon.find_one({"look_id": lid})
        if not look:
            print(f"[{i}/{len(picks)}] {lid}: NOT FOUND")
            fail += 1
            continue
        name = (look.get("native_text") or {}).get("product_name", "?")
        rec = df.deconstruct_look(look, store, cost, force=args.force, mode="retail")
        st = rec["status"]
        ng = len(rec.get("garments", []))
        print(f"[{i}/{len(picks)}] {lid}: {st}  garments={ng}  cost={cost}  ({name})")
        if rec.get("errors"):
            print(f"      errors: {rec['errors']}")
        done += st == "complete"
        fail += st == "failed"

    print(f"\n==== DONE: {done} complete, {fail} failed ====")
    print(f"fal spend this run: {cost}")
    print(f"store stats: {store.stats()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
