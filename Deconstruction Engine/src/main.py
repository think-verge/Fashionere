"""CLI orchestration: ingest -> per-look deconstruct -> store -> gallery.

    python -m src.main --input "/path/<Designer>/<Season>" --output ./output \\
        [--quality] [--force] [--limit N] [--gallery-only]

Per-look try/except means one failure never halts the batch.
"""

from __future__ import annotations

import argparse
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import config, deconstruct, gallery, ingest, store
from .config import RunConfig
from .ingest import Look
from .schemas import LookRecord


def _process_look(look: Look, cfg: RunConfig, out: Path) -> str:
    """Deconstruct one look into per-garment palette/fabrics/patterns + a sketch.

    Generates the whole-look sketch and one swatch per garment's fabric/pattern
    in parallel (cropped from the real source images, then AI-cleaned). Returns
    the look's status.
    """
    errors: list[str] = [f"missing source file: {m}" for m in look.missing_files]

    # 1) Vision read: per-garment palette, fabrics, patterns.
    data, v_err = deconstruct.read_elements(look, cfg)
    if v_err:
        errors.append(v_err)
    data = data or {}
    garments_in = data.get("garments", []) or []
    ll = data.get("look_level", {}) or {}

    runway_bytes = (
        look.runway_image_path.read_bytes() if look.runway_image_path.exists() else None
    )
    detail_bytes = [p.read_bytes() for p in look.detail_image_paths if p.exists()]
    ordered = deconstruct.order_images(runway_bytes, detail_bytes)

    # 2) Generate in parallel: one sketch + one swatch per garment fabric/pattern.
    per_garment_patterns = [
        [p for p in (g.get("patterns", []) or []) if (p.get("type") or "none") != "none"]
        for g in garments_in
    ]
    with ThreadPoolExecutor(max_workers=8) as ex:
        fut_sketch = ex.submit(deconstruct.generate_sketch_from_vision, data, cfg)
        fab_futs = {
            (gi, fi): ex.submit(deconstruct.generate_fabric_swatch, f, ordered, cfg)
            for gi, g in enumerate(garments_in)
            for fi, f in enumerate(g.get("fabrics", []) or [])
        }
        pat_futs = {
            (gi, pi): ex.submit(deconstruct.generate_pattern_swatch, p, ordered, cfg)
            for gi, pats in enumerate(per_garment_patterns)
            for pi, p in enumerate(pats)
        }
        sketch_png, s_err = fut_sketch.result()
        fab_res = {k: fut.result() for k, fut in fab_futs.items()}
        pat_res = {k: fut.result() for k, fut in pat_futs.items()}
    if s_err:
        errors.append(s_err)

    # 3) Save assets + build per-garment records.
    sketch_rel = store.save_sketch(out, look.look_id, sketch_png) if sketch_png else ""
    garment_records = []
    for gi, g in enumerate(garments_in):
        piece = g.get("piece", "") or "garment"
        fab_recs = []
        for fi, fab in enumerate(g.get("fabrics", []) or []):
            png, err = fab_res.get((gi, fi), (None, ""))
            rel = store.save_asset(out, look.look_id, f"g{gi}_fabric_{fi}.png", png) if png else ""
            fab_recs.append({**fab, "swatch_asset": rel})
            if err:
                errors.append(f"[{piece} / {fab.get('name', 'fabric')}] {err}")
        pat_recs = []
        for pi, pat in enumerate(per_garment_patterns[gi]):
            png, err = pat_res.get((gi, pi), (None, ""))
            rel = store.save_asset(out, look.look_id, f"g{gi}_pattern_{pi}.png", png) if png else ""
            pat_recs.append({**pat, "swatch_asset": rel})
            if err:
                errors.append(f"[{piece} / {pat.get('name', 'pattern')}] {err}")
        garment_records.append(
            {
                "piece": piece,
                "color_palette": g.get("color_palette", []) or [],
                "fabrics": fab_recs,
                "patterns": pat_recs,
            }
        )

    vision_ok = bool(garments_in)
    status = "failed" if not vision_ok and not sketch_png else ("partial" if errors else "complete")

    record = LookRecord.model_validate(
        {
            "look_id": look.look_id,
            "provenance": {
                "designer": look.designer,
                "collection": look.collection,
                "source_runway_url": look.source_runway_url,
                "runway_image": look.runway_image_rel,
                "detail_images": list(look.detail_images_rel),
            },
            "garments": garment_records,
            "look_level": {
                "silhouette_description": ll.get("silhouette_description", ""),
                "color_story": ll.get("color_story", []),
                "sketch_asset": sketch_rel,
            },
            "processing": {
                "model_vision": cfg.vision_model,
                "model_image": cfg.image_model,
                "status": status,
                "errors": errors,
            },
        }
    )
    store.save_record(out, record.model_dump())
    return status


def run(cfg: RunConfig) -> int:
    out = Path(cfg.output_dir).resolve()
    store.ensure_dirs(out)

    # Gallery-only: skip all API work, just re-render from stored records.
    if getattr(cfg, "gallery_only", False):
        dest = gallery.render(out, cfg.input_dir)
        print(f"Gallery re-rendered: {dest}")
        return 0

    # Fail fast on a missing key rather than burning retries on every look.
    config.get_api_key()

    looks = ingest.ingest(cfg.input_dir)
    if cfg.limit is not None:
        looks = looks[: cfg.limit]
    print(f"Ingested {len(looks)} look(s) from {cfg.input_dir}")

    processed = store.load_index(out)
    n_done = n_skipped = n_failed = n_partial = 0

    for look in looks:
        if look.look_id in processed and not cfg.force:
            print(f"  {look.look_id}: skipped (already processed; use --force)")
            n_skipped += 1
            continue
        try:
            status = _process_look(look, cfg, out)
        except Exception as e:  # noqa: BLE001 — last-resort guard; never halt batch
            status = "failed"
            print(f"  {look.look_id}: UNEXPECTED ERROR {type(e).__name__}: {e}")

        processed.add(look.look_id)
        store.save_index(out, processed)  # persist after each look (crash-safe)

        if status == "complete":
            n_done += 1
        elif status == "partial":
            n_partial += 1
        else:
            n_failed += 1
        print(f"  {look.look_id}: {status}")

    dest = gallery.render(out, cfg.input_dir)

    print("\n--- Summary ---")
    print(f"  complete: {n_done}   partial: {n_partial}   "
          f"failed: {n_failed}   skipped: {n_skipped}")
    print(f"  records:  {out / config.LOOKS_DIRNAME}")
    print(f"  gallery:  {dest}")
    return 0


def parse_args(argv: list[str] | None = None) -> RunConfig:
    p = argparse.ArgumentParser(
        prog="python -m src.main",
        description="Deconstruct a fashion collection folder into structured "
        "color/fabric/pattern records + design sketches.",
    )
    p.add_argument("--input", required=True, help="Collection folder (<Designer>/<Season>)")
    p.add_argument("--output", default="./output", help="Output dir (default ./output)")
    p.add_argument("--quality", action="store_true", help="Use gemini-2.5-pro for vision")
    p.add_argument("--force", action="store_true", help="Reprocess already-done looks")
    p.add_argument("--limit", type=int, default=None, help="Process only the first N looks")
    p.add_argument("--gallery-only", action="store_true",
                   help="Skip API calls; just re-render index.html from stored records")
    a = p.parse_args(argv)
    cfg = RunConfig(
        input_dir=a.input,
        output_dir=a.output,
        quality=a.quality,
        force=a.force,
        limit=a.limit,
    )
    object.__setattr__(cfg, "gallery_only", a.gallery_only)  # frozen dataclass
    return cfg


def main(argv: list[str] | None = None) -> int:
    cfg = parse_args(argv)
    try:
        return run(cfg)
    except config.ConfigError as e:
        print(f"Config error: {e}", file=sys.stderr)
        return 2
    except FileNotFoundError as e:
        print(f"Input error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
