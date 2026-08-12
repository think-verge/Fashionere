"""Ingest runway data -> canonical Looks/Collections (the CLEAN stage).

Runs adapter-per-source over a brand's data folder, prints verification stats,
resolves the report window on the real data, writes a canonical JSON snapshot,
and (optionally) upserts to MongoDB.

Usage:
    python -m trend_engine.jobs.ingest --input Prada            # dry run + snapshot
    python -m trend_engine.jobs.ingest --input Prada --store    # also write to Mongo
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

from trend_engine.adapters.registry import get_adapter
from trend_engine.scope import policies


def _find_files(input_dir: Path) -> list[Path]:
    files: list[Path] = []
    for p in sorted(input_dir.glob("*/*.json")) + sorted(input_dir.glob("*.json")):
        if p not in files:
            files.append(p)
    return files


def ingest(input_dir: Path):
    collections, looks = [], []
    for f in _find_files(input_dir):
        raw = json.loads(f.read_text(encoding="utf-8"))
        source = raw[0].get("source", "vogue") if raw else "vogue"
        coll, lks = get_adapter(source).parse_collection(raw, file_hint=str(f))
        collections.append(coll)
        looks.extend(lks)
    return collections, looks


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest runway data -> canonical looks (Clean).")
    ap.add_argument("--input", default="Prada", help="brand data folder (collection subfolders inside)")
    ap.add_argument("--report-type", default="overall")
    ap.add_argument("--store", action="store_true", help="also upsert to MongoDB")
    ap.add_argument("--out", default="output/canonical", help="canonical JSON snapshot dir")
    ap.add_argument("--no-write", action="store_true", help="skip the JSON snapshot")
    args = ap.parse_args()

    input_dir = Path(args.input)
    collections, looks = ingest(input_dir)
    if not collections:
        print(f"No JSON collection files under {input_dir}", file=sys.stderr)
        sys.exit(1)

    # ---- per-collection stats ----
    print(f"\nIngested from: {input_dir}")
    print(f"{'collection_id':<26} {'brand':<8} {'season':<7} {'year':<5} {'cat':<5} {'looks':>5} {'details':>8}")
    print("-" * 74)
    detail_total = 0
    brand_years: dict[str, set[int]] = defaultdict(set)
    details_by_collection = defaultdict(int)
    for lk in looks:
        details_by_collection[lk.collection_id] += len(lk.raw.detail_shots)
    for c in sorted(collections, key=lambda x: x.season_order):
        d = details_by_collection[c.collection_id]
        detail_total += d
        brand_years[c.brand_slug].add(c.year)
        print(f"{c.collection_id:<26} {c.brand_slug:<8} {c.season:<7} {c.year:<5} {c.category:<5} {c.look_count:>5} {d:>8}")
    print("-" * 74)
    print(f"TOTAL: {len(collections)} collections, {len(looks)} looks, {detail_total} detail images")

    # ---- window resolution on real data ----
    print(f"\nScope resolution (report_type={args.report_type}, today={date.today().isoformat()}):")
    for brand_slug, years in brand_years.items():
        scope = policies.resolve(args.report_type, brand_slug, available_years=sorted(years))
        in_scope = [lk for lk in looks if scope.matches(lk)]
        by_year: dict[int, int] = defaultdict(int)
        for lk in in_scope:
            by_year[lk.year] += 1
        breakdown = ", ".join(f"{y}:{by_year[y]}" for y in sorted(by_year))
        excluded = sorted(set(years) - set(scope.years))
        print(f"  {brand_slug}: window={scope.years} -> {len(in_scope)} looks ({breakdown})"
              + (f"; excluded years {excluded}" if excluded else ""))

    # ---- integrity spot-check ----
    s = looks[0]
    print("\nIntegrity spot-check (first look):")
    print(f"  look_id     = {s.look_id}")
    print(f"  collection  = {s.collection_id}   season_order={s.season_order}")
    print(f"  raw.desc    = {(s.raw.description or '')[:66]!r}")
    print(f"  raw.colors  = {[(c.name, c.hex) for c in s.raw.colors]}")
    print(f"  tags empty  = colors:{len(s.tags.colors)} fabrics:{len(s.tags.fabrics)} themes:{len(s.tags.themes)}")
    print(f"  summary field on Look? {'summary' in s.model_dump()}  (expect False; it lives on Collection)")

    # ---- outputs ----
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
        print(f"\nWrote canonical snapshot -> {out_dir}/ ({len(collections)} files)")

    if args.store:
        from trend_engine.store.repo import Repo
        repo = Repo()
        repo.ensure_indexes()
        nl = repo.upsert_looks(looks)
        nc = repo.upsert_collections(collections)
        for brand_slug in brand_years:
            repo.bump_data_version(brand_slug)
        print(f"\nStored to MongoDB: {nc} collections, {nl} looks upserted.")


if __name__ == "__main__":
    main()
