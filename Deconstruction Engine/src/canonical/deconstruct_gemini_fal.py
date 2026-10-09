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


def _download(look: dict, *, mode: str = "runway") -> tuple[bytes | None, list[bytes]]:
    """Download images from a look, returning (primary, details).

    In retail mode: prefer product_detail (garment-only / flat-lay) images for
    extraction and keep one on-model product_front for the technical flat.
    Deduplicates by URL.
    """
    if mode == "retail":
        return _download_retail(look)
    primary, details = None, []
    PRIMARY_ROLES = {"runway", "product_front"}
    for im in look.get("images", []):
        url = im.get("url")
        if not url:
            continue
        try:
            b = fb.fetch(url)
        except Exception:  # noqa: BLE001 — skip an unfetchable image
            continue
        if im.get("role") in PRIMARY_ROLES and primary is None:
            primary = b
        else:
            details.append(b)
    return primary, details


def _download_retail(look: dict) -> tuple[bytes | None, list[bytes]]:
    """Retail image selection: garment-only images first, one on-model for flat."""
    seen_urls: set[str] = set()
    on_model: bytes | None = None
    detail_images: list[bytes] = []

    for im in look.get("images", []):
        url = im.get("url")
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        try:
            b = fb.fetch(url)
        except Exception:  # noqa: BLE001
            continue
        role = im.get("role", "")
        if role == "product_detail":
            detail_images.append(b)
        elif role == "product_front" and on_model is None:
            on_model = b

    if detail_images:
        # Primary = first garment-only image (best for fabric crops).
        # On-model shot goes into details so it's still available for tech flat.
        primary = detail_images[0]
        rest = detail_images[1:]
        if on_model is not None:
            rest.append(on_model)
        return primary, rest

    # Fallback: no detail images, use on-model as primary
    return on_model, detail_images


def _retail_flatlay(look: dict, cv=None, ordered: list[bytes] | None = None) -> bytes | None:
    """Pick the best garment-only image as the retail flat-lay.

    Gemini's vision read identifies the best full-garment flat-lay via
    `best_flatlay_index` — trust it over any heuristic.
    """
    if cv and ordered:
        idx = getattr(cv, "best_flatlay_index", None)
        if idx is not None and idx >= 0 and idx < len(ordered):
            return ordered[idx]

    # Fallback: first product_detail image
    for im in look.get("images", []):
        if im.get("role") == "product_detail":
            url = im.get("url")
            if url:
                return fb.fetch(url)
    return None


def _colors(color_palette) -> list[dict]:
    out = []
    for c in color_palette or []:
        out.append({"name": c.name, "pantone": (c.pantone or None),
                    "hex": c.hex, "role": c.role})
    return out


def deconstruct_look(look: dict, store: DeconstructionStore, cost: fb.Cost,
                     *, force: bool = False, quality: bool = False,
                     sketches: bool = True, mode: str = "runway") -> dict:
    look_id = look["look_id"]
    if store.is_done(look_id) and not force:
        return {"look_id": look_id, "status": "skipped_done"}

    brand, collection_id = (look_id.split(":") + ["", ""])[:2]
    runway, details = _download(look, mode=mode)
    if runway is None and not details:
        rec = {"look_id": look_id, "status": "failed", "errors": ["no images"]}
        store.save_record(rec); return rec

    # --- Gemini vision read (the brain) ---
    cfg = RunConfig(input_dir="", output_dir="", quality=quality)
    _ext, cv = extractor.extract(runway, details, quality=quality, mode=mode)
    if cv is None:
        rec = {"look_id": look_id, "status": "failed", "errors": ["vision read empty"]}
        store.save_record(rec); return rec

    ordered = dc.order_images(runway, details)   # index-aligned with cv boxes

    # For technical flats: in retail mode prefer the on-model shot (last in ordered,
    # appended by _download_retail) for a better silhouette reading; fall back to primary.
    if mode == "retail" and len(ordered) > 1:
        flat_src = ordered[-1]  # on-model shot appended at end by _download_retail
    else:
        flat_src = runway if runway is not None else (ordered[0] if ordered else None)
    flat_url = fb.upload(flat_src, "image/jpeg") if (sketches and flat_src) else None

    def make_flat(piece: str | None, tag: str) -> dict:
        """Generate+store one technical flat (deduped by piece+runway bytes)."""
        key = sha256_bytes(b"flat|" + (piece or "whole").encode() + b"|" + flat_src)
        fid = store.lookup_swatch(key)
        if fid is not None:
            return {"gridfs_id": fid, "source_hash": key, "model": "nano-banana", "reused": True}
        png = fb.technical_flat(flat_url, cost, piece=piece)
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
        if mode == "retail":
            # Retail: store the best garment-only image as the flat-lay (no AI generation)
            try:
                flatlay_bytes = _retail_flatlay(look, cv=cv, ordered=ordered)
                if flatlay_bytes:
                    h = sha256_bytes(b"flatlay|" + look_id.encode())
                    fid = store.lookup_swatch(h)
                    reused = fid is not None
                    if not reused:
                        fid, reused = store.put_swatch(flatlay_bytes, look_id=look_id,
                                                       tag=f"{gid}_flatlay", source_hash=h)
                    detail_url = next((i.get("url") for i in look.get("images", [])
                                      if i.get("role") == "product_detail"), None)
                    garment["flat"] = {"gridfs_id": fid, "source_hash": h,
                                       "model": "product_detail", "reused": reused,
                                       "source_url": detail_url}
            except Exception as e:  # noqa: BLE001
                errors.append(f"{gid} flatlay: {type(e).__name__}: {e}")
        elif flat_url:
            # Runway: generate technical flat via Nano Banana
            try:
                garment["flat"] = make_flat(g.piece or f"garment {gi}", f"{gid}_flat")
            except Exception as e:  # noqa: BLE001
                errors.append(f"{gid} flat: {type(e).__name__}: {e}")
        if fabrics or patterns or garment["flat"]:
            garments.append(garment)

    # whole-look technical flat — runway only (retail has a single garment, no need)
    sketch = None
    if flat_url and mode != "retail":
        try:
            sketch = make_flat(None, "sketch")
        except Exception as e:  # noqa: BLE001
            errors.append(f"sketch: {type(e).__name__}: {e}")

    rec = {
        "look_id": look_id, "brand": brand, "collection_id": collection_id,
        "source_url": next((i.get("url") for i in look.get("images", [])
                           if i.get("role") in {"runway", "product_front"}), None),
        "mode": mode,
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
