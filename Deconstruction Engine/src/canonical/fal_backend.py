"""fal backend for the deconstruction MVP — segmentation + swatch generation.

Finalized model stack (see repo DECONSTRUCTION_FAL_PLAN.md / memory fal-swatch-models):
  - segment : fal-ai/evf-sam            ($0.005)  text-referring-expression mask
  - fabric  : fal-ai/bytedance/seedream/v4/edit  ($0.03)   flat mill-sample swatch
  - pattern : fal-ai/patina/material/extract     (~$0.17)  seamless tileable + PBR

Key lesson baked in: PATINA (and Gemini/Nano) hard-block on skin, so patterns are fed a
CLEAN eroded interior crop. Seedream is robust and takes the box crop directly. All
outputs are capped small to hold cost near the $0.03 megapixel floor.
"""
from __future__ import annotations

import io

import fal_client
import requests
from PIL import Image, ImageFilter

# --- model slugs + tunables --------------------------------------------------
EVF_SAM = "fal-ai/evf-sam"
SEEDREAM = "fal-ai/bytedance/seedream/v4/edit"
KONTEXT = "fal-ai/flux-pro/kontext"           # fabric fallback when Seedream content-blocks
PATINA = "fal-ai/patina/material/extract"
NANO = "fal-ai/nano-banana/edit"              # technical-flat sketches (pure B&W line-art)

SWATCH_PX = 512           # Seedream/PATINA output size -> ~1 MP floor
# grayscale std-dev above which a crop is "busy" enough to be a pattern. Combined
# with a canonical-motif check in routing (a busy crop alone isn't enough — e.g. a
# soft watercolour print scores ~31, plain wool ~9, so the bar sits between them).
PATTERN_BUSYNESS = 20.0
_UA = {"User-Agent": "Mozilla/5.0"}

# per-call prices (USD) for the running tally
PRICE = {"evf_sam": 0.005, "seedream": 0.03, "kontext": 0.04, "patina": 0.17, "nano": 0.039}


class Cost:
    """Running fal spend tally for one run."""
    def __init__(self):
        self.by_model: dict[str, float] = {}
    def add(self, model: str):
        self.by_model[model] = self.by_model.get(model, 0.0) + PRICE[model]
    @property
    def total(self) -> float:
        return round(sum(self.by_model.values()), 4)
    def __str__(self):
        parts = ", ".join(f"{k}=${v:.3f}" for k, v in self.by_model.items())
        return f"${self.total:.3f} ({parts})"


# --- helpers -----------------------------------------------------------------
def fetch(url: str) -> bytes:
    r = requests.get(url, timeout=90, headers=_UA); r.raise_for_status(); return r.content


def upload(data: bytes, content_type: str = "image/png") -> str:
    return fal_client.upload(data, content_type)


def busyness(png: bytes) -> float:
    """Grayscale std-dev — a cheap 'is it patterned?' signal."""
    img = Image.open(io.BytesIO(png)).convert("L")
    px = list(img.getdata())
    if not px:
        return 0.0
    m = sum(px) / len(px)
    return (sum((p - m) ** 2 for p in px) / len(px)) ** 0.5


def dominant_colors(png: bytes, k: int = 5) -> list[dict]:
    """Free per-crop palette via PIL quantize. Returns [{hex, weight}] sorted by area."""
    img = Image.open(io.BytesIO(png)).convert("RGB").resize((128, 128))
    q = img.quantize(colors=k, method=Image.Quantize.FASTOCTREE)
    pal = q.getpalette()
    counts = sorted(q.getcolors(), reverse=True)  # [(count, index), ...]
    total = sum(c for c, _ in counts) or 1
    out = []
    for count, idx in counts[:k]:
        r, g, b = pal[idx * 3: idx * 3 + 3]
        out.append({"hex": f"#{r:02x}{g:02x}{b:02x}", "weight": round(count / total, 3)})
    return out


# --- segmentation + clean crop ----------------------------------------------
def segment_mask(image_url: str, prompt: str, cost: Cost, *, expand: int = 0) -> bytes | None:
    """EVF-SAM2 binary mask (white=match) for a referring expression, or None if empty."""
    res = fal_client.subscribe(EVF_SAM, arguments={
        "prompt": prompt, "image_url": image_url, "mask_only": True,
        "fill_holes": True, "expand_mask": expand,
    }, with_logs=False)
    cost.add("evf_sam")
    img = (res or {}).get("image")
    if not img:
        return None
    mask = fetch(img["url"])
    # reject an all-black (empty) or all-white (whole-image) mask as useless
    m = Image.open(io.BytesIO(mask)).convert("L")
    lo, hi = m.getextrema()
    if hi < 20:            # nothing selected
        return None
    return mask


def _erode(mask_L: Image.Image, px: int) -> Image.Image:
    """Erode the white region by ~px using repeated MinFilter (odd kernel)."""
    k = max(3, px | 1)
    out = mask_L
    # MinFilter kernel is capped small; repeat to reach the target erosion
    reps = max(1, k // 9)
    for _ in range(reps):
        out = out.filter(ImageFilter.MinFilter(9))
    return out


def clean_crops(runway_png: bytes, mask_png: bytes, *, interior_frac: float = 0.6):
    """From a runway image + EVF mask, produce clean crops robust to over-segmentation.

    Returns (interior_patch_png, masked_region_png, bbox) or None if the mask is too small.
    - masked_region: garment over WHITE, cropped to the eroded bbox (for PATINA).
    - interior_patch: central square of that region (pure fabric, no edges/skin).
    """
    img = Image.open(io.BytesIO(runway_png)).convert("RGB")
    W, H = img.size
    mask = Image.open(io.BytesIO(mask_png)).convert("L").resize((W, H))
    # erode proportionally to pull the boundary in off any skin/edges
    eroded = _erode(mask, max(9, int(min(W, H) * 0.02)))
    bbox = eroded.getbbox() or mask.getbbox()
    if not bbox:
        return None
    x0, y0, x1, y1 = bbox
    if x1 - x0 < 40 or y1 - y0 < 40:
        return None
    white = Image.new("RGB", (W, H), (255, 255, 255))
    masked = Image.composite(img, white, eroded).crop(bbox)
    # interior patch: central square of the masked region
    bw, bh = masked.size
    s = int(min(bw, bh) * interior_frac)
    l, t = (bw - s) // 2, (bh - s) // 2
    patch = masked.crop((l, t, l + s, t + s))

    def to_png(im):
        b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()
    return to_png(patch), to_png(masked), bbox


# --- swatch generators -------------------------------------------------------
# Pixel-driven swatch instruction (no material label — a merged canonical string
# like "nylon, cotton, leather, suede, plastic" makes editors render a multi-swatch card).
_FABRIC_PROMPT = ("Turn this photo of a garment fabric into a clean, flat, top-down fabric "
                  "swatch: even studio lighting, remove all folds, creases and shadows, fill "
                  "the frame edge to edge like a single mill sample. Reproduce the SAME single "
                  "fabric — keep its real colour, weave and texture faithful to the photo. No "
                  "background, no garment shape, no seams, no multiple swatches.")


def fabric_swatch(patch_png: bytes, cost: Cost) -> tuple[bytes, str]:
    """Flat fabric swatch, pixel-driven. Seedream primary; FLUX Kontext fallback.

    Seedream (ByteDance) sometimes content-blocks a crop ('partner_validation_failed');
    Kontext is more permissive and gave good fabric swatches in testing. Returns
    (png_bytes, model_name).
    """
    url = upload(patch_png)
    try:
        res = fal_client.subscribe(SEEDREAM, arguments={
            "image_urls": [url], "prompt": _FABRIC_PROMPT, "image_size": "square",
            "enable_safety_checker": False,
        }, with_logs=False)
        cost.add("seedream")
        return fetch(res["images"][0]["url"]), "seedream-v4-edit"
    except Exception:  # noqa: BLE001 — fall back to Kontext on block/error
        res = fal_client.subscribe(KONTEXT, arguments={
            "prompt": _FABRIC_PROMPT, "image_url": url,
        }, with_logs=False)
        cost.add("kontext")
        return fetch(res["images"][0]["url"]), "flux-kontext-pro"


def pattern_tile(masked_png: bytes, motif: str, cost: Cost) -> bytes:
    """PATINA -> seamless tileable pattern (fed the CLEAN masked crop, no skin)."""
    url = upload(masked_png)
    res = fal_client.subscribe(PATINA, arguments={
        "image_url": url, "prompt": f"the {motif} fabric pattern",
        "enable_safety_checker": False,
    }, with_logs=False)
    cost.add("patina")
    imgs = res.get("images") or []
    base = next((i for i in imgs if not i.get("map_type")), imgs[0])
    return fetch(base["url"])


# --- technical flats (Nano Banana, pure B&W line-art) ------------------------
_FLAT_DETAIL = ("front view, showing garment construction (seams, darts, collar, cuffs, "
                "plackets, zippers, buttons, pockets, hems, pleats, waistband)")
# hard "flat-laid, no body" clause — drapey looks made Nano draw a mannequin + legs + shading
_FLAT_NOBODY = (" Draw the garment LAID COMPLETELY FLAT as an invisible/ghost-mannequin "
                "technical flat: ABSOLUTELY NO human body, NO mannequin, NO legs, NO arms, "
                "NO neck, NO head, NO face, NO figure of any kind — only the garment's own "
                "flat outline. Symmetrical, as if pinned flat on a white table.")
_FLAT_BW = (" STRICTLY monochrome: pure black outlines on pure white, ABSOLUTELY NO colour, "
            "NO grey shading, NO fill, NO gradients — a clean CAD line drawing.")


def technical_flat(runway_url: str, cost: Cost, *, piece: str | None = None) -> bytes:
    """Nano Banana -> a black-line technical flat FROM the runway photo (image-to-image).

    piece=None -> whole-look flat (all garments); else an isolated single-garment flat.
    The garment is isolated by instruction (no crop needed); Nano even reconstructs a
    garment that is partly occluded in the photo.
    """
    if piece:
        instr = (f"Draw a clean fashion TECHNICAL FLAT of ONLY the {piece} from this outfit, "
                 f"{_FLAT_DETAIL}. Draw ONLY the {piece} — completely exclude every other "
                 "garment, accessories and background. One garment only.")
    else:
        instr = (f"Convert this runway photo into a clean fashion TECHNICAL FLAT of the whole "
                 f"look — every garment stacked as flats, {_FLAT_DETAIL}. No background, no "
                 "shoes or accessories. Keep the real silhouette and proportions faithful.")
    res = fal_client.subscribe(NANO, arguments={
        "prompt": instr + _FLAT_NOBODY + _FLAT_BW, "image_urls": [runway_url],
    }, with_logs=False)
    cost.add("nano")
    return fetch(res["images"][0]["url"])
