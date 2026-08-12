"""Write stage — trend sheet -> report model -> narrated -> magazine HTML (Phase 4).

Usage:
    python -m trend_engine.jobs.report            # reads output/normalized/
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from trend_engine.aggregate.engine import build_trend_sheet
from trend_engine.compose.model import build_report_model
from trend_engine.compose.narrator import narrate
from trend_engine.compose.render import render_html
from trend_engine.jobs.aggregate import load_normalized
from trend_engine.scope import policies


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate the magazine trend report (Phase 4).")
    ap.add_argument("--normalized", default="output/normalized")
    ap.add_argument("--report-type", default="overall")
    ap.add_argument("--out", default="output/reports")
    args = ap.parse_args()

    collections, looks = load_normalized(args.normalized)
    if not looks:
        print("No normalized looks — run tag first.", file=sys.stderr)
        sys.exit(1)

    brand_slug, brand = collections[0].brand_slug, collections[0].brand
    years = sorted({c.year for c in collections})
    scope = policies.resolve(args.report_type, brand_slug, available_years=years)

    print(f"Tally  → building trend sheet for {brand} ({scope.years})…")
    sheet = build_trend_sheet(collections, looks, scope, brand, brand_slug, args.report_type)
    model = build_report_model(sheet)

    summaries = [c.summary for c in collections if c.year in scope.years and c.summary]
    print(f"Write  → narrating ({len(summaries)} source reviews)…")
    model = narrate(model, summaries)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / f"{brand_slug}-{args.report_type}.html"
    json_path = out_dir / f"{brand_slug}-{args.report_type}.model.json"
    html_path.write_text(render_html(model), encoding="utf-8")
    json_path.write_text(json.dumps(model.model_dump(mode="json"), indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nHEADLINE:   {model.headline}")
    print(f"STANDFIRST: {model.standfirst}")
    print("SECTIONS:")
    for s in model.sections:
        print(f"   {s.label:<11} “{s.coined_name}”")
    if model.pull_quote.text:
        print(f"PULL QUOTE: “{model.pull_quote.text}” — {model.pull_quote.attribution}")
    print(f"\nWrote report -> {html_path}\n           and {json_path}")


if __name__ == "__main__":
    main()
