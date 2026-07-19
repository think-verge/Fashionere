"""
temp_1.py — add `source_urls` to each trend record from the raw observations.

For every trend object, each id in `sources` is an observation_id from the
master_raw_object file. This script looks each one up, collects the DISTINCT
`source_url`s (dropping "NA"), and inserts them as a new `source_urls` key right
after `sources` — so you can update the trend objects with provenance URLs.

Defaults:
  --trends : latest Master_data/trend_records/trend_records_*.json
  --raw    : the master_raw_object_*.json with the SAME timestamp (else latest)
Output    : a new <trends>_with_source_urls.json  (use --in-place to overwrite)
"""

import argparse
import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
TREND_DIR = SCRIPT_DIR / "Master_data" / "trend_records"
RAW_DIR = SCRIPT_DIR / "Master_data" / "raw_objects"


def latest(directory: Path, pattern: str) -> Path:
    files = sorted(directory.glob(pattern))
    if not files:
        raise FileNotFoundError(f"No {pattern} found in {directory}")
    return files[-1]


def matching_raw_for(trend_file: Path) -> Path:
    """Prefer the raw file sharing the trends file's YYYYMMDD_HHMMSS stamp."""
    m = re.search(r"(\d{8}_\d{6})", trend_file.name)
    if m:
        candidate = RAW_DIR / f"master_raw_object_{m.group(1)}.json"
        if candidate.exists():
            return candidate
    return latest(RAW_DIR, "master_raw_object_*.json")


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def url_map_from_raw(raw_data) -> dict:
    obs = raw_data.get("observations", []) if isinstance(raw_data, dict) else raw_data
    url_by_id = {}
    for o in obs:
        oid = o.get("observation_id")
        if oid:
            url_by_id[oid] = o.get("source_url")
    return url_by_id


def enrich(records: list, url_by_id: dict):
    out_records = []
    missing_ids = set()
    for rec in records:
        urls = []
        for sid in rec.get("sources", []):
            url = url_by_id.get(sid)
            if sid not in url_by_id:
                missing_ids.add(sid)
                continue
            if not url or url == "NA":
                continue
            if url not in urls:            # distinct, order preserved
                urls.append(url)
        # rebuild the dict so source_urls sits right after sources
        new_rec = {}
        for key, value in rec.items():
            new_rec[key] = value
            if key == "sources":
                new_rec["source_urls"] = urls
        if "source_urls" not in new_rec:   # record had no `sources` key
            new_rec["source_urls"] = urls
        out_records.append(new_rec)
    return out_records, missing_ids


def main() -> None:
    ap = argparse.ArgumentParser(description="Add source_urls to trend records from raw observations.")
    ap.add_argument("--trends", type=Path, default=None, help="trend_records_*.json (default: latest)")
    ap.add_argument("--raw", type=Path, default=None, help="master_raw_object_*.json (default: same stamp)")
    ap.add_argument("--in-place", action="store_true", help="Overwrite the trends file instead of writing a new one.")
    args = ap.parse_args()

    trend_file = args.trends or latest(TREND_DIR, "trend_records_*.json")
    raw_file = args.raw or matching_raw_for(trend_file)
    print(f"Trends : {trend_file.name}")
    print(f"Raw    : {raw_file.name}")

    trend_data = load_json(trend_file)
    url_by_id = url_map_from_raw(load_json(raw_file))

    is_wrapped = isinstance(trend_data, dict) and "trend_records" in trend_data
    records = trend_data["trend_records"] if is_wrapped else trend_data

    enriched, missing = enrich(records, url_by_id)
    if is_wrapped:
        trend_data["trend_records"] = enriched
        payload = trend_data
    else:
        payload = enriched

    out_file = trend_file if args.in_place else trend_file.with_name(
        trend_file.stem + "_with_source_urls.json"
    )
    with out_file.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    with_urls = sum(1 for r in enriched if r.get("source_urls"))
    print(f"\nEnriched {len(enriched)} trend records ({with_urls} got at least one URL).")
    if missing:
        print(f"WARNING: {len(missing)} source id(s) not found in the raw file (skipped).")
    print(f"Wrote  : {out_file}")


if __name__ == "__main__":
    main()
