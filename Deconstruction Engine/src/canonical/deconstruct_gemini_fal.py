"""Clean deconstruction — Gemini vision read + fal image generation.

The simple architecture (the original engine's shape, image backend swapped to fal):

    Gemini vision read (extractor.extract)  ->  per-garment fabrics/patterns with
        tight crop boxes + Pantone colours              [the brain, unchanged]
    crop each boxed region  ->  fal:
        fabric  -> Seedream v4 edit   (flat swatch)
        pattern -> PATINA             (seamless tile)   [the better swatch models]
    -> persist to Mongo (GridFS + deconstructions), deduped by source-crop hash.

No segmentation heuristics: Gemini already returns the garments, their fabrics/
patterns, and boxes drawn on clean patches (avoiding face/skin), so PATINA's
content-checker is satisfied and colours come straight from the model.

`look` is a plain dict from `Fashionere.canonical_looks`.
"""
from __future__ import annotations

from src import deconstruct as dc               # order_images, crop_region (schema-agnostic)
from src.config import RunConfig
from . import extractor                          # Gemini vision read
from . import fal_backend as fb
from .store_mongo import DeconstructionStore, sha256_bytes


def _download(look: dict) -> tuple[bytes | None, list[bytes]]:
    runway, details = None, []
    for im in look.get("images", []):
        url = im.get("url")
        if not url:
            continue
        try:
            b = fb.fetch(url)
        except Exception:  # noqa: BLE001 — skip an unfetchable image
            continue
        if im.get("role") == "runway" and runway is None:
            runway = b
        else:
            details.append(b)
    return runway, details


def _colors(color_palette) -> list[dict]:
    out = []
    for c in color_palette or []:
        out.append({"name": c.name, "pantone": (c.pantone or None),
                    "hex": c.hex, "role": c.role})
    return out


def deconstruct_look(look: dict, store: DeconstructionStore, cost: fb.Cost,
                     *, force: bool = False, quality: bool = False,
                     sketches: bool = True) -> dict:
    look_id = look["look_id"]
    if store.is_done(look_id) and not force:
        return {"look_id": look_id, "status": "skipped_done"}

    brand, collection_id = (look_id.split(":") + ["", ""])[:2]
    runway, details = _download(look)
    if runway is None and not details:
        rec = {"look_id": look_id, "status": "failed", "errors": ["no images"]}
        store.save_record(rec); return rec

    # --- Gemini vision read (the brain) ---
    cfg = RunConfig(input_dir="", output_dir="", quality=quality)
    _ext, cv = extractor.extract(runway, details, quality=quality)  # cv = raw per-garment
    if cv is None:
        rec = {"look_id": look_id, "status": "failed", "errors": ["vision read empty"]}
        store.save_record(rec); return rec

    ordered = dc.order_images(runway, details)   # index-aligned with cv boxes

    # Upload the runway once for technical flats (whole-look + per-garment, Nano B&W).
    flat_src = runway if runway is not None else (ordered[0] if ordered else None)
    runway_flat_url = fb.upload(flat_src, "image/jpeg") if (sketches and flat_src) else None

    def make_flat(piece: str | None, tag: str) -> dict:
        """Generate+store one technical flat (deduped by piece+runway bytes)."""
        key = sha256_bytes(b"flat|" + (piece or "whole").encode() + b"|" + flat_src)
        fid = store.lookup_swatch(key)
        if fid is not None:
            return {"gridfs_id": fid, "source_hash": key, "model": "nano-banana", "reused": True}
        png = fb.technical_flat(runway_flat_url, cost, piece=piece)
        fid, reused = store.put_swatch(png, look_id=look_id, tag=tag, source_hash=key)
        return {"gridfs_id": fid, "source_hash": key, "model": "nano-banana", "reused": reused}

    def crop_of(src) -> bytes | None:
        if not src:
            return None
        idx = src.image_index
        if not (isinstance(idx, int) and 0 <= idx < len(ordered)):
            idx = 0
        return dc.crop_region(ordered[idx], src.box)

    garments, errors = [], []
    for gi, g in enumerate(cv.garments):
        gid = f"g{gi}"
        fabrics, patterns = [], []
        # --- fabrics -> Seedream ---
        for fi, f in enumerate(g.fabrics):
            try:
                crop = crop_of(f.source)
                if not crop:
                    continue
                # key by KIND+crop so a fabric and a pattern sharing one box don't collide
                h = sha256_bytes(b"fabric|" + crop)
                fid = store.lookup_swatch(h)
                reused = fid is not None
                model = "seedream-v4-edit"
                if not reused:
                    png, model = fb.fabric_swatch(crop, cost)
                    fid, reused = store.put_swatch(png, look_id=look_id,
                                                   tag=f"{gid}_fabric{fi}", source_hash=h)
                fabrics.append({"name": f.name, "material": f.material, "weight": f.weight,
                                "finish": f.finish, "description": f.description,
                                "confidence": f.confidence, "gridfs_id": fid,
                                "source_hash": h, "model": model, "reused": reused})
            except Exception as e:  # noqa: BLE001
                errors.append(f"{gid} fabric{fi}: {type(e).__name__}: {e}")
        # --- patterns -> PATINA (skip brand marks) ---
        for pi, p in enumerate(g.patterns):
            if getattr(p, "is_brand_mark", False) or (p.type or "none") == "none":
                continue
            try:
                crop = crop_of(p.source)
                if not crop:
                    continue
                h = sha256_bytes(b"pattern|" + crop)
                fid = store.lookup_swatch(h)
                reused = fid is not None
                if not reused:
                    png = fb.pattern_tile(crop, p.motif or "all-over", cost)
                    fid, reused = store.put_swatch(png, look_id=look_id,
                                                   tag=f"{gid}_pattern{pi}", source_hash=h)
                patterns.append({"name": p.name, "motif": p.motif, "type": p.type,
                                 "scale": p.scale, "colors": p.colors,
                                 "description": p.description, "gridfs_id": fid,
                                 "source_hash": h, "model": "patina", "reused": reused})
            except Exception as e:  # noqa: BLE001
                errors.append(f"{gid} pattern{pi}: {type(e).__name__}: {e}")

        garment = {"garment_id": gid, "piece": g.piece,
                   "colors": _colors(g.color_palette),
                   "fabrics": fabrics, "patterns": patterns, "flat": None}
        # per-garment technical flat (isolated from the runway photo by instruction)
        if runway_flat_url:
            try:
                garment["flat"] = make_flat(g.piece or f"garment {gi}", f"{gid}_flat")
            except Exception as e:  # noqa: BLE001
                errors.append(f"{gid} flat: {type(e).__name__}: {e}")
        if fabrics or patterns or garment["flat"]:
            garments.append(garment)

    # whole-look technical flat (all garments in one sketch)
    sketch = None
    if runway_flat_url:
        try:
            sketch = make_flat(None, "sketch")
        except Exception as e:  # noqa: BLE001
            errors.append(f"sketch: {type(e).__name__}: {e}")

    rec = {
        "look_id": look_id, "brand": brand, "collection_id": collection_id,
        "source_runway_url": next((i.get("url") for i in look.get("images", [])
                                   if i.get("role") == "runway"), None),
        "silhouette": cv.silhouette_description,
        "sketch": sketch,                       # whole-look flat (gridfs ref)
        "garments": garments,                   # each garment has its own "flat"
        "models": {"vision": "gemini", "fabric": "seedream-v4-edit",
                   "pattern": "patina", "flat": "nano-banana"},
        "status": "complete" if garments else "failed",
        "errors": errors, "cost_usd": cost.total,
    }
    store.save_record(rec)
    return rec
