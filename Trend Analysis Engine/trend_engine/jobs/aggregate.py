"""Tally stage — read the tagged snapshot, build & print the trend sheet (Phase 3).

Usage:
    python -m trend_engine.jobs.aggregate            # reads output/normalized/
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from trend_engine.aggregate.engine import build_trend_sheet
from trend_engine.schema.collection import Collection
from trend_engine.schema.look import Look
from trend_engine.scope import policies

_ARROW = {"rising": "UP  ", "fading": "DOWN", "emerging": "NEW ", "dropped": "GONE", "steady": "--  "}
_LABELS = {"colors": "COLOR", "fabrics": "FABRIC (garment only)", "patterns": "PATTERN",
           "silhouettes": "SILHOUETTE", "themes": "MOOD", "details": "DETAILS"}


def load_normalized(dirpath: str):
    collections, looks = [], []
    for f in sorted(Path(dirpath).glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        collections.append(Collection.model_validate(data["collection"]))
        looks.extend(Look.model_validate(x) for x in data["looks"])
    return collections, looks


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the trend sheet (Phase 3, Tally).")
    ap.add_argument("--normalized", default="output/normalized")
    ap.add_argument("--report-type", default="overall")
    ap.add_argument("--out", default="output/trends")
    ap.add_argument("--top", type=int, default=6)
    args = ap.parse_args()

    collections, looks = load_normalized(args.normalized)
    if not looks:
        print("No normalized looks — run `python -m trend_engine.jobs.tag` first.", file=sys.stderr)
        sys.exit(1)

    brand_slug, brand = collections[0].brand_slug, collections[0].brand
    years = sorted({c.year for c in collections})
    scope = policies.resolve(args.report_type, brand_slug, available_years=years)
    sheet = build_trend_sheet(collections, looks, scope, brand, brand_slug, args.report_type)

    print(f"\n{brand.upper()} — {args.report_type} trend sheet · window {sheet.window_years} · "
          f"{sheet.collections} collections · {sheet.total_looks} looks")
    print("(share = % of looks · sig = signature 0-1 · move = year-over-year; ? = not confirmed by like-season)\n")

    for dim in ["colors", "fabrics", "patterns", "silhouettes", "themes", "details"]:
        agg = sheet.dimensions[dim]
        print(f"{_LABELS[dim]}   [{agg.omitted_count} rare values hidden]")
        for rv in agg.ranked[:args.top]:
            m = rv.momentum
            move = ""
            if m:
                mark = "" if m.trustworthy else "?"
                move = f"{_ARROW.get(m.kind, '')}{(m.yoy_delta or 0) * 100:+4.0f}pt{mark}"
            print(f"   {rv.value:<22} {rv.share * 100:>4.0f}%   sig {rv.signature_score:.2f}   {move}")
        if dim == "colors" and agg.palette:
            print("   palette: " + "  ".join(f"{p.family} {p.hex}({p.share * 100:.0f}%)"
                                              for p in agg.palette[:6]))
        print()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    of = out_dir / f"{brand_slug}-{args.report_type}.json"
    of.write_text(json.dumps(sheet.model_dump(mode="json"), indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote trend sheet -> {of}")


if __name__ == "__main__":
    main()
