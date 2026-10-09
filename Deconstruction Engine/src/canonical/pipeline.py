"""Canonical pipeline (Step 1) — produce ``{ look: <canonical>, assets: <derived> }``.

Consumes the shared canonical schema (read-only source of truth) and writes a NEW
combined record. Reuses the legacy engine's swatch/sketch generators (they take
plain dicts + bytes, no schema coupling). Writes to a SEPARATE output tree so the
legacy `output/` is untouched.

    python -m src.canonical.pipeline --folder "<Brand>/<Season>" --look 1 --output ./output_canonical
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from src import deconstruct as dc
from src.config import RunConfig
from . import extractor

# canonical (read-only) + its folder adapter
from fashionairre_core.adapters import vision_folder  # noqa: E402


def _safe(look_id: str) -> str:
    return look_id.replace(":", "__")


def build_from_bytes(shell, runway_bytes, detail_bytes, out_dir: Path, *, quality=False) -> dict:
    """Fill a canonical Look shell with extraction + generate derived assets.

    Returns the combined ``{look, assets}`` record. `shell` is a canonical Look
    (source/context/images) whose `extraction` we set; we never alter the schema.
    """
    cfg = RunConfig(input_dir="", output_dir=str(out_dir), quality=quality)
    ordered = dc.order_images(runway_bytes, detail_bytes)

    # 1) canonical extraction (vision) — the source of truth
    ext, cv = extractor.extract(runway_bytes, detail_bytes, quality=quality)
    shell.extraction = ext

    # 2) derived assets (NOT part of the canonical Look)
    look_id = _safe(shell.look_id)
    adir = out_dir / "assets" / look_id
    adir.mkdir(parents=True, exist_ok=True)

    sketch_png, _ = dc.generate_sketch_from_vision(
        {"look_level": {"silhouette_description": cv.silhouette_description if cv else ""}}, cfg)
    sketch_rel = ""
    if sketch_png:
        (adir / "sketch.png").write_bytes(sketch_png)
        sketch_rel = f"assets/{look_id}/sketch.png"

    garment_assets = []
    for gi, g in enumerate(cv.garments if cv else []):
        fabs, pats = [], []
        for fi, f in enumerate(g.fabrics):
            png, _ = dc.generate_fabric_swatch(f.model_dump(), ordered, cfg)
            rel = ""
            if png:
                (adir / f"g{gi}_fabric_{fi}.png").write_bytes(png)
                rel = f"assets/{look_id}/g{gi}_fabric_{fi}.png"
            fabs.append(rel)
        pi = 0
        for p in g.patterns:
            if p.is_brand_mark:
                continue  # never render a trademark swatch
            png, _ = dc.generate_pattern_swatch(p.model_dump(), ordered, cfg)
            rel = ""
            if png:
                (adir / f"g{gi}_pattern_{pi}.png").write_bytes(png)
                rel = f"assets/{look_id}/g{gi}_pattern_{pi}.png"
            pats.append(rel)
            pi += 1
        garment_assets.append({"piece": g.piece, "fabrics": fabs, "patterns": pats})

    # 3) combined output: canonical Look (verbatim) + derived assets block
    record = {"look": json.loads(shell.model_dump_json()),
              "assets": {"sketch": sketch_rel, "garments": garment_assets}}

    looks_dir = out_dir / "looks"
    looks_dir.mkdir(parents=True, exist_ok=True)
    (looks_dir / f"{look_id}.json").write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    return record


def run_folder(folder: str | Path, look_number: int, out_dir: str | Path, *, quality=False) -> dict:
    out_dir = Path(out_dir)
    shell = vision_folder.parse_folder(folder, look_number=look_number)  # canonical shell (images=files)
    runway_bytes, detail_bytes = None, []
    for im in shell.images:
        b = Path(im.file).read_bytes() if im.file and Path(im.file).exists() else None
        if b is None:
            continue
        if im.role in ("runway", "product_front"):
            runway_bytes = b
        else:
            detail_bytes.append(b)
    return build_from_bytes(shell, runway_bytes, detail_bytes, out_dir, quality=quality)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m src.canonical.pipeline")
    p.add_argument("--folder", required=True, help="<Brand>/<Season> image folder")
    p.add_argument("--look", type=int, default=1)
    p.add_argument("--output", default="./output_canonical")
    p.add_argument("--quality", action="store_true")
    a = p.parse_args(argv)
    rec = run_folder(a.folder, a.look, a.output, quality=a.quality)
    look = rec["look"]
    n_g = len(look["extraction"]["garments"]) if look.get("extraction") else 0
    print(f"Wrote canonical record: {look['look_id']}  ({n_g} garments)")
    print(f"  output: {Path(a.output).resolve()}/looks/{_safe(look['look_id'])}.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
