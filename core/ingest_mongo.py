"""Ingestion job — Fashionere.Raw Data → canonical `Look` records → canonical_looks.

Reads MONGO_URI from a .env (via --env), maps each raw doc through the mongo_raw
adapter, and upserts valid canonical Looks into the output collection.

    python ingest_mongo.py --env "../Trend Analysis Engine/.env" [--limit N] [--drop]
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import dotenv_values
from pymongo import MongoClient

from fashionairre_core.adapters import mongo_raw
from fashionairre_core.store import CanonicalStore


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="ingest_mongo.py")
    p.add_argument("--env", default="../Trend Analysis Engine/.env", help=".env with MONGO_URI")
    p.add_argument("--raw-db", default="Fashionere")
    p.add_argument("--raw-coll", default="Raw Data")
    p.add_argument("--out-db", default="Fashionere")
    p.add_argument("--out-coll", default="canonical_looks")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--drop", action="store_true", help="drop the output collection first")
    a = p.parse_args(argv)

    uri = dotenv_values(a.env).get("MONGO_URI")
    if not uri:
        print(f"MONGO_URI not found in {a.env}", file=sys.stderr)
        return 2

    client = MongoClient(uri, serverSelectionTimeoutMS=15000)
    client.admin.command("ping")
    raw = client[a.raw_db][a.raw_coll]
    out = client[a.out_db][a.out_coll]
    if a.drop:
        out.drop()
    store = CanonicalStore(out)

    cursor = raw.find({})
    if a.limit:
        cursor = cursor.limit(a.limit)

    read = ingested = skipped = failed = 0
    by_brand: Counter = Counter()
    for doc in cursor:
        read += 1
        if not mongo_raw.is_ingestable(doc):
            skipped += 1
            continue
        try:
            look = mongo_raw.parse_look(doc)
            store.upsert(look)
            ingested += 1
            by_brand[look.context.brand or "?"] += 1
        except Exception as e:  # noqa: BLE001 — record + continue
            failed += 1
            if failed <= 5:
                print(f"  ! {doc.get('look_id')}: {type(e).__name__}: {e}")

    print(f"\nread={read}  ingested={ingested}  skipped(unmatched/empty)={skipped}  failed={failed}")
    print(f"canonical_looks now holds: {store.count()} docs  → {a.out_db}.{a.out_coll}")
    print("per brand:")
    for b, n in by_brand.most_common():
        print(f"   {b:<18} {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
