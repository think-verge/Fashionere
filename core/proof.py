"""Step-0 proof — one canonical schema holds BOTH data sources (kept separate).

Runs offline (no API). Loads:
  A. a real Prada look from the pre-scraped Vogue TEXT JSON  → canonical Look
  B. a real Chanel runway IMAGE folder                       → canonical Look shell
  C. a real deconstruction-engine record (per-garment)       → canonical extraction

and asserts all validate under the single `Look` model.

    python proof.py
"""

from __future__ import annotations

import glob
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fashionairre_core.adapters import deconstruction, vision_folder, vogue_text  # noqa: E402
from fashionairre_core.schema import Look  # noqa: E402

BASE = Path("/Users/sompande/JOBS/ThinkVerge/Centoire")
PRADA_GLOB = str(BASE / "Fashionairre/Trend Analysis Engine/Prada/Spring_2026_Ready_to_Wear/*.json")
CHANEL_DIR = Path("/Users/sompande/Downloads/Fashion_Images_Data/Chanel/Spring_2026_Couture")
DECON_GLOB = str(BASE / "Fashionairre/Strategy/mvp/output/looks/*.json")


def _revalidate(look: Look) -> Look:
    """Round-trip through JSON to prove it fully serializes/validates."""
    return Look.model_validate(json.loads(look.model_dump_json()))


def main() -> int:
    print("=" * 72)
    print("STEP-0 PROOF — one canonical Look for two separate sources")
    print("=" * 72)

    # A. Prada — TEXT source ------------------------------------------------
    prada_raw = json.load(open(sorted(glob.glob(PRADA_GLOB))[0]))[0]
    prada = _revalidate(vogue_text.parse_look(prada_raw, brand="Prada"))
    g = prada.extraction.garments[0]
    print(f"\nA. TEXT source (Vogue/Prada)  →  {prada.look_id}")
    print(f"   source.type={prada.source.type}  images={len(prada.images)} ({prada.images[0].kind})")
    print(f"   context: {prada.context.brand} · {prada.context.season} {prada.context.year} · {prada.context.category}")
    print(f"   extraction: {len(prada.extraction.garments)} garment (piece={g.piece!r}), "
          f"{len(g.color_palette)} colors, {len(g.fabrics)} fabrics")
    if g.color_palette:
        c = g.color_palette[0]
        print(f"     color[0]: {c.name!r}  pantone={c.pantone!r}  hex={c.hex}")

    # B. Chanel — IMAGE source (shell, extraction pending) ------------------
    chanel = _revalidate(vision_folder.parse_folder(CHANEL_DIR, look_number=1))
    print(f"\nB. IMAGE source (Chanel folder)  →  {chanel.look_id}")
    print(f"   source.type={chanel.source.type}  images={len(chanel.images)} ({chanel.images[0].kind})")
    print(f"   image[0].file = {Path(chanel.images[0].file).name}  exists={Path(chanel.images[0].file).exists()}")
    print(f"   extraction = {chanel.extraction}  (← to be filled by the vision extractor)")

    # C. Deconstruction record — IMAGE extraction (per-garment) -------------
    rec = json.load(open(sorted(glob.glob(DECON_GLOB))[-1]))
    chanel.extraction = deconstruction.extraction_from_record(rec)
    chanel = _revalidate(chanel)          # re-validate with extraction attached
    print(f"\nC. VISION extraction (real deconstruction record → same schema)")
    print(f"   {len(chanel.extraction.garments)} garments (per-garment):")
    for gg in chanel.extraction.garments:
        fab = gg.fabrics[0] if gg.fabrics else None
        box = fab.source_region.box if (fab and fab.source_region) else None
        print(f"     • {gg.piece!r}: {len(gg.color_palette)} colors, {len(gg.fabrics)} fabrics, "
              f"{len(gg.patterns)} patterns" + (f"  (fabric source_region box={box})" if box else ""))

    # All three are valid canonical Looks.
    assert all(isinstance(x, Look) for x in (prada, chanel))
    print("\n" + "=" * 72)
    print("✅ PROOF PASSED — the SAME `Look` schema validated:")
    print("   • a TEXT-only source (Prada, page-link images, look-level attrs)")
    print("   • an IMAGE source (Chanel, real files) with per-garment vision extraction")
    print("   Two sources kept separate, one canonical source of truth.")
    print("=" * 72)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
