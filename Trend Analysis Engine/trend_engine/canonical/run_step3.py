"""Step-3 demo — attach real trend momentum to a look's deconstructed elements.

1) Prada look (its brand HAS a produced TrendSheet) → real, correct-brand badges.
2) Chanel deconstruction look vs the Prada sheet → illustrative cross-brand check
   (shows the badge mechanism on real deconstruction elements; a Chanel/industry
   sheet would replace the Prada one for correct numbers).

    python -m trend_engine.canonical.run_step3
"""

from __future__ import annotations

import glob
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "core"))

from fashionairre_core.adapters import vogue_text  # noqa: E402
from trend_engine.canonical import trends_lookup as tl  # noqa: E402

BASE = Path("/Users/sompande/JOBS/ThinkVerge/Centoire")
SHEET = BASE / "Fashionairre/Trend Analysis Engine/output/trends/prada-overall.json"
PRADA_RAW = BASE / "Fashionairre/Trend Analysis Engine/Prada/Spring_2026_Ready_to_Wear"
DECON = sorted(glob.glob(str(BASE / "Fashionairre/Strategy/mvp/output_canonical/looks/*.json")))


def _print(enriched: dict, title: str):
    print(f"\n{title}")
    print(f"  look: {enriched['look_id']}  |  trend scope: {enriched['trend_scope']['brand']} "
          f"{enriched['trend_scope']['window_years']}")
    for dim, items in enriched["elements"].items():
        if not items:
            continue
        print(f"  {dim}:")
        for it in items:
            print(f"     {it['label']:<28} {tl.badge(it['trend'])}")


def main() -> int:
    sheet = tl.load_sheet(SHEET)
    print("=" * 74)
    print("STEP 3 — trend momentum joined onto a look's deconstructed elements")
    print("=" * 74)

    # 1) Real, correct-brand: a Prada look against the Prada trend sheet
    prada_raw = json.load(open(sorted(glob.glob(str(PRADA_RAW / "*.json")))[0]))[0]
    prada_canon = vogue_text.parse_look(prada_raw, brand="Prada")
    _print(tl.enrich(prada_canon, sheet), "① PRADA look → PRADA trends (real, correct brand):")

    # 2) Illustrative cross-brand: a Chanel deconstruction look vs the Prada sheet
    if DECON:
        chanel = json.load(open(DECON[-1]))["look"]
        _print(tl.enrich(chanel, sheet),
               "② CHANEL deconstruction look → PRADA trends (ILLUSTRATIVE cross-brand;\n"
               "   a Chanel/industry sheet would give correct numbers):")

    print("\n" + "=" * 74)
    print("✅ Deconstructed elements now carry a trend badge (rising/fading/steady),")
    print("   sourced from the trend engine's momentum — present when the sheet covers the value.")
    print("=" * 74)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
