"""Step-2 demo — trend engine reads a canonical Look and produces its own output (tags).

Loads a real deconstruction canonical record (`{look, assets}`), bridges the
`look` into a trend `Look`, runs the existing normalizer, and prints the trend
tags. Proves the trend engine now consumes the shared canonical schema.

    python -m trend_engine.canonical.run [path/to/canonical_look.json]
"""

from __future__ import annotations

import glob
import json
import sys
from pathlib import Path

from trend_engine.canonical.bridge import normalize_from_canonical

DECON_GLOB = ("/Users/sompande/JOBS/ThinkVerge/Centoire/Fashionairre/"
              "Strategy/mvp/output_canonical/looks/*.json")


def main(argv=None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    path = argv[0] if argv else sorted(glob.glob(DECON_GLOB))[-1]
    rec = json.load(open(path))
    clook = rec.get("look", rec)   # accept {look,assets} or a bare canonical Look

    print(f"Source canonical look: {clook['look_id']}  (from {Path(path).name})")
    print("Running trend normalizer (colors deterministic + attributes via Gemini)…\n")

    look = normalize_from_canonical(clook)   # canonical → trend Look → tags
    t = look.tags

    def show(label, items, fmt):
        print(f"  {label:12} ({len(items)}): " + ", ".join(fmt(x) for x in items) or f"  {label}: —")

    print(f"TREND TAGS for {look.look_id}  [{look.brand} · {look.season} {look.year}]")
    show("colors", t.colors, lambda c: f"{c.family}({c.name})")
    show("fabrics", t.fabrics, lambda f: f"{f.value}")
    show("patterns", t.patterns, lambda p: f"{p.value}")
    show("silhouettes", t.silhouettes, lambda s: f"{s.value}")
    show("themes", t.themes, lambda x: f"{x.value}")
    show("details", t.details, lambda d: f"{d.value}")
    print(f"\n  vibe_phrases: {look.vibe_phrases}")
    print("\n✅ Trend engine consumed the canonical schema and produced its own output (vocab tags).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
