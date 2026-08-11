"""Tidy stage — normalize color families and report the piles (Phase 2a).

Usage:
    python -m trend_engine.jobs.normalize --input Prada
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from trend_engine.jobs.ingest import ingest
from trend_engine.normalize.pipeline import normalize_looks
from trend_engine.scope import policies


def _presence(looks) -> Counter:
    """Distinct family per look -> share-of-looks counts."""
    counts: Counter = Counter()
    for lk in looks:
        counts.update({t.family for t in lk.tags.colors})
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(description="Normalize color families (Phase 2a).")
    ap.add_argument("--input", default="Prada")
    ap.add_argument("--report-type", default="overall")
    ap.add_argument("--out", default="output/normalized")
    ap.add_argument("--no-write", action="store_true")
    ap.add_argument("--top", type=int, default=12)
    args = ap.parse_args()

    collections, looks = ingest(Path(args.input))
    if not looks:
        print("No looks ingested.", file=sys.stderr)
        sys.exit(1)
    normalize_looks(looks, do_colors=True)

    brand_slug = collections[0].brand_slug
    years = sorted({c.year for c in collections})
    scope = policies.resolve(args.report_type, brand_slug, available_years=years)
    in_scope = [lk for lk in looks if scope.matches(lk)]
    n = len(in_scope)

    total_tags = sum(len(lk.tags.colors) for lk in looks)
    print(f"\nTagged {len(looks)} looks with {total_tags} color-family tags "
          f"({total_tags / len(looks):.1f}/look).")

    # ---- the piles: color families across the overall window ----
    pres = _presence(in_scope)
    bar_max = max(pres.values()) if pres else 1
    print(f"\nColor families across the OVERALL window {scope.years} ({n} looks) — share of looks:")
    for fam, cnt in pres.most_common(args.top):
        bar = "#" * round(30 * cnt / bar_max)
        print(f"  {fam:<9} {cnt:>3}  {100 * cnt / n:>4.0f}%  {bar}")

    # ---- dominant-color leaderboard ----
    dom: Counter = Counter()
    for lk in in_scope:
        dom.update({t.family for t in lk.tags.colors if t.role == "dominant"})
    print("\nDominant color of the look (top 6):")
    for fam, cnt in dom.most_common(6):
        print(f"  {fam:<9} {cnt:>3}  {100 * cnt / n:>4.0f}%")

    # ---- year-over-year: a taste of Phase 3 ----
    print("\nYear-over-year — share of looks per year (a taste of Phase 3):")
    yrs = scope.years
    per_year = {y: [lk for lk in in_scope if lk.year == y] for y in yrs}
    pres_year = {y: _presence(v) for y, v in per_year.items()}
    print(f"  {'family':<9}" + "".join(f"{y:>8}" for y in yrs) + "      move")
    for fam, _ in pres.most_common(args.top):
        shares = [(pres_year[y][fam] / len(per_year[y])) if per_year[y] else 0.0 for y in yrs]
        cells = "".join(f"{100 * s:>7.0f}%" for s in shares)
        move = ""
        if len(shares) >= 2:
            d = shares[-1] - shares[0]
            move = f"  {'up ' if d > 0.05 else ('down' if d < -0.05 else 'flat')} {100 * d:+.0f}pt"
        print(f"  {fam:<9}{cells}{move}")

    # ---- QA: unmatched families ----
    looks_with_other = sum(1 for lk in looks if any(t.family == "other" for t in lk.tags.colors))
    print(f"\nQA: 'other' (unmatched) family appears in {looks_with_other}/{len(looks)} looks.")

    # ---- spot-check the running example ----
    nav = next((lk for lk in looks if lk.look_id == "prada:prada-spring-2026-rtw:1"), None)
    if nav:
        print("\nSpot-check — Spring 2026, look 1:")
        for t in nav.tags.colors:
            print(f"  {t.family:<8} <- {t.name!r:<22} {t.hex}  ({t.role}, {t.origin})")

    # ---- write snapshot ----
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
        print(f"\nWrote normalized snapshot -> {out_dir}/ ({len(collections)} files)")


if __name__ == "__main__":
    main()
