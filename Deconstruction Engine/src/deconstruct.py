"""The deconstruction engine: Gemini vision read + Nano Banana swatch/sketch gen.

Look-level (not per-garment) extraction, each function isolated for debugging:

- ``read_elements_from_images(runway, details, cfg)`` -> (data, error): one
  vision call; returns the whole look's color_palette, fabrics, patterns +
  look_level.
- ``generate_sketch_from_vision(data, cfg)`` -> (png, error): a clean flat.
- ``generate_fabric_swatch(fabric, cfg)`` -> (png, error): a fabric texture tile.
- ``generate_pattern_swatch(pattern, cfg)`` -> (png, error): a pattern swatch.

All image gens are text-to-image (the model refuses to transform photos of real
people, and generating from facts matches the IP plan's "regenerate, don't
copy"). Every call retries with backoff and returns (None, error) on failure so
the batch keeps going.
"""

from __future__ import annotations

import io
import time
from pathlib import Path

from google import genai
from google.genai import types
from PIL import Image

from . import config
from .config import MAX_PALETTE_SIZE, RunConfig
from .schemas import VisionResult

# --- Prompts ----------------------------------------------------------------
VISION_PROMPT = (
    "You are a fashion technical analyst. The images are numbered starting at 0 in "
    "the order provided (image 0 first). Identify each DISTINCT apparel garment in "
    "the look (e.g. jacket, skirt, top, trousers, dress, layers) — ignore shoes, "
    "bags, jewelry, hosiery, hair, skin, and background.\n"
    "SPLIT FINELY: return a SEPARATE garment entry for every visually distinct "
    "piece, layer, or fabric section. If one construction combines clearly different "
    "fabrics or sections (e.g. a tweed bodice/jacket with a separate sheer tulle "
    "skirt, or a top layered over a slip), return EACH as its own garment entry "
    "(e.g. 'tweed jacket', 'sheer tulle skirt') rather than one combined piece. Aim "
    "for each garment entry to have a single primary fabric.\n"
    "Return `garments`: one entry per distinct garment/section, each with:\n"
    "- piece: the garment type.\n"
    "- color_palette: THAT garment's palette — each with a color name, the nearest "
    "Pantone TCX code (fashion textile standard, e.g. '19-3922 TCX Navy Blazer' — "
    "the designer-facing value), an approximate hex (used only to render the chip), "
    "and role (dominant/secondary/accent).\n"
    "- fabrics: THAT garment's distinct fabrics — each with a short name incl. color "
    "(e.g. 'black tweed'), best-guess material, weight, finish, a confidence level, "
    "and ONE short description line.\n"
    "- patterns: THAT garment's patterns/motifs — each with a short name, type "
    "(none | repeat | placement_appliqué), motif, scale, colors (hex), and ONE short "
    "description line. If a garment has no pattern, use an empty list.\n"
    "CRITICAL: do NOT include brand logos, monograms, house emblems, or trademarked "
    "marks (e.g. interlocking-letter logos, signature quilting used as a brand mark) "
    "as patterns — exclude them entirely. Only capture generic, non-trademarked "
    "prints/textures/motifs.\n"
    "For EACH fabric and EACH pattern you MUST also return `source`: the "
    "`image_index` of the image that shows it most clearly, and a `box` "
    "[ymin, xmin, ymax, xmax] normalized 0-1000, drawn tightly around a clean patch "
    "showing ONLY that fabric/pattern — avoid the face, skin, hands, and background. "
    "Prefer the close-up (detail) images for these regions.\n"
    "Also give look_level: a silhouette_description (whole look) and a color_story. "
    "Keep every description to a single short line. Output must match the JSON "
    "schema exactly."
)

# All image generations are text-to-image (see module docstring for why).
SKETCH_PROMPT_TEMPLATE = (
    "Draw a fashion technical flat (a designer's flat sketch / croquis) as clean "
    "black line art on a plain white background, front view. Show garment "
    "construction — seams, darts, collar, cuffs, plackets, pockets, and hems — as "
    "clean lines. No color, no shading, no human figure, no background, no "
    "accessories (omit shoes, bags, jewelry).\n\n"
    "The look: {silhouette}"
)

FABRIC_SWATCH_PROMPT = (
    "A realistic fabric swatch: a flat, top-down macro close-up of {name} "
    "({material}), {weight} weight, {finish} finish. The fabric fills the entire "
    "frame edge-to-edge, evenly and softly lit, no folds, no seams, no shadows, no "
    "background — just the material's true texture and color, like a mill sample."
)

PATTERN_SWATCH_REPEAT_PROMPT = (
    "A seamless, repeating all-over pattern swatch tile of {name}"
    "{motif}, in colors {colors}. Flat, top-down, evenly lit, fills the entire "
    "frame edge-to-edge, tileable, no background, no shadows."
)

PATTERN_SWATCH_PLACEMENT_PROMPT = (
    "A single {motif} motif ({name}) as a clean, standalone graphic design element, "
    "in colors {colors}, centered on a plain flat white background, evenly lit, no "
    "shadows — an isolated appliqué/placement graphic, not tiled."
)

# Image-to-image "clean up this real crop" prompts (the crop is a face-free patch
# of the actual garment, so the person-photo block does not apply). Preserves the
# real colors/weave while removing folds, shadows, and background.
FABRIC_CLEAN_PROMPT = (
    "This image is a cropped photo of a real garment fabric ({name}, {material}). "
    "Recreate it as a clean, flat, top-down fabric swatch: even lighting, no folds, "
    "no shadows, no seams, no background, no skin or body — just the material's true "
    "texture and colors, filling the frame edge-to-edge like a mill sample. Keep the "
    "real colors and weave faithful to the photo."
)
PATTERN_CLEAN_REPEAT_PROMPT = (
    "This image is a cropped photo of a real garment pattern ({name}). Recreate it as "
    "a clean, flat, seamless repeating tile of the SAME pattern and colors: even "
    "lighting, no folds, no shadows, no background, tileable, filling the frame. Keep "
    "the motif and colors faithful to the photo."
)
PATTERN_CLEAN_PLACEMENT_PROMPT = (
    "This image is a cropped photo of a real garment motif ({name}: {motif}). Isolate "
    "and recreate JUST that motif as a clean standalone graphic on a flat white "
    "background: even lighting, no shadows, no fabric, no body. Keep the motif shape "
    "and colors faithful to the photo."
)


def _build_sketch_prompt(vision_data: dict | None) -> str:
    """Compose the text-to-image sketch prompt from the look silhouette."""
    silhouette = ""
    if vision_data:
        silhouette = str(
            (vision_data.get("look_level") or {}).get("silhouette_description", "")
        ).strip()
    return SKETCH_PROMPT_TEMPLATE.format(
        silhouette=silhouette or "a coordinated apparel look"
    )


def _build_fabric_prompt(fabric: dict) -> str:
    return FABRIC_SWATCH_PROMPT.format(
        name=fabric.get("name") or fabric.get("material") or "fabric",
        material=fabric.get("material") or "textile",
        weight=fabric.get("weight") or "medium",
        finish=fabric.get("finish") or "matte",
    )


def _build_pattern_prompt(pattern: dict) -> str:
    colors = ", ".join(pattern.get("colors") or []) or "as shown"
    motif = pattern.get("motif") or ""
    name = pattern.get("name") or motif or "pattern"
    if (pattern.get("type") or "").startswith("placement"):
        return PATTERN_SWATCH_PLACEMENT_PROMPT.format(
            motif=motif or name, name=name, colors=colors
        )
    return PATTERN_SWATCH_REPEAT_PROMPT.format(
        name=name, motif=(f" ({motif})" if motif and motif != name else ""), colors=colors
    )


class _ClientHolder:
    """Lazily-created, reused Gemini client."""

    _client: genai.Client | None = None

    @classmethod
    def get(cls) -> genai.Client:
        if cls._client is None:
            cls._client = genai.Client(api_key=config.get_api_key())
        return cls._client


def _sniff_mime(data: bytes) -> str:
    """Detect image mime from magic bytes (jpeg/png/webp/gif); default jpeg."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "image/jpeg"


def _part_from_bytes(data: bytes) -> types.Part:
    """Wrap raw image bytes in a Gemini inline Part with a sniffed mime type."""
    return types.Part.from_bytes(data=data, mime_type=_sniff_mime(data))


def _load_image_part(path: Path) -> types.Part:
    """Read an image file into a Gemini inline Part."""
    return _part_from_bytes(path.read_bytes())


def _with_retry(fn, what: str):
    """Call ``fn`` with exponential backoff. Returns (result, error_str)."""
    last_err = ""
    for attempt in range(1, config.MAX_RETRIES + 1):
        try:
            return fn(), ""
        except Exception as e:  # noqa: BLE001 — pipeline must not crash on API errors
            last_err = f"{type(e).__name__}: {e}"
            if attempt < config.MAX_RETRIES:
                delay = config.RETRY_BASE_DELAY * (2 ** (attempt - 1))
                time.sleep(delay)
    return None, f"{what} failed after {config.MAX_RETRIES} attempts — {last_err}"


def _clamp_palettes(data: dict) -> None:
    """Cap each garment's color palette to MAX_PALETTE_SIZE entries, in place."""
    for garment in data.get("garments", []) or []:
        palette = garment.get("color_palette")
        if isinstance(palette, list) and len(palette) > MAX_PALETTE_SIZE:
            garment["color_palette"] = palette[:MAX_PALETTE_SIZE]


def order_images(runway_bytes: bytes | None, detail_images: list[bytes]) -> list[bytes]:
    """Canonical image order shared by the vision read and the crop step.

    Index 0 = runway (if present), then details in upload order. The vision
    model references these indices in each element's ``source.image_index``.
    """
    imgs: list[bytes] = []
    if runway_bytes:
        imgs.append(runway_bytes)
    imgs.extend([d for d in detail_images if d])
    return imgs


def read_elements_from_images(
    runway_bytes: bytes | None,
    detail_images: list[bytes],
    cfg: RunConfig,
) -> tuple[dict | None, str]:
    """Vision read from raw image bytes — the folder-agnostic core.

    Sends every image labelled with its index (runway first, then details) so
    the model can point each fabric/pattern at the image + region that shows it.

    Returns (data_dict, "") on success, or (None, error_string) on failure.
    """
    images = order_images(runway_bytes, detail_images)
    if not images:
        return None, "vision read skipped — no images provided"

    contents: list = [types.Part.from_text(text=VISION_PROMPT)]
    for i, img in enumerate(images):
        role = "runway, whole-look" if (i == 0 and runway_bytes) else "detail / macro"
        contents.append(types.Part.from_text(text=f"Image {i} ({role}):"))
        contents.append(_part_from_bytes(img))

    def _call():
        client = _ClientHolder.get()
        resp = client.models.generate_content(
            model=cfg.vision_model,
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=VisionResult,  # Pydantic model = the schema
            ),
        )
        # Prefer the SDK's parsed+validated object; fall back to parsing text.
        parsed = getattr(resp, "parsed", None)
        if isinstance(parsed, VisionResult):
            return parsed
        if not resp.text:
            raise ValueError("empty response from vision model")
        return VisionResult.model_validate_json(resp.text)

    result, err = _with_retry(_call, "vision read")
    if err:
        return None, err
    # Return a plain dict downstream (store/gallery/CLI are dict-based).
    data = result.model_dump()
    _clamp_palettes(data)
    return data, ""


def read_elements(look, cfg: RunConfig) -> tuple[dict | None, str]:
    """Vision read for a folder-ingested Look (delegates to the bytes core)."""
    runway_bytes = (
        look.runway_image_path.read_bytes()
        if look.runway_image_path.exists()
        else None
    )
    detail_images = [
        p.read_bytes() for p in look.detail_image_paths if p.exists()
    ]
    return read_elements_from_images(runway_bytes, detail_images, cfg)


# Appended on successive retries to dodge intermittent content blocks
# (IMAGE_RECITATION / IMAGE_OTHER) — the same prompt would just get re-blocked.
_IMG_RETRY_NUDGES = [
    "",
    " Render this as an original, generic studio sample — not a copy of any "
    "specific existing artwork or photograph.",
    " Produce a plain, original, generic rendering. Simplify; avoid any specific "
    "real-world design.",
]


def _generate_image(
    prompt: str, cfg: RunConfig, what: str, image_bytes: bytes | None = None
) -> tuple[bytes | None, str]:
    """Image generation core (text-to-image, or image-to-image if image_bytes given).

    Retries with a slightly varied prompt each attempt so intermittent content
    blocks (finish_reason IMAGE_RECITATION / IMAGE_OTHER) don't just re-trigger.
    """
    last_err = ""
    for attempt in range(config.MAX_RETRIES):
        nudge = _IMG_RETRY_NUDGES[min(attempt, len(_IMG_RETRY_NUDGES) - 1)]
        contents: list = [types.Part.from_text(text=prompt + nudge)]
        if image_bytes:
            contents.append(_part_from_bytes(image_bytes))
        try:
            client = _ClientHolder.get()
            resp = client.models.generate_content(
                model=cfg.image_model,
                contents=contents,
                config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
            )
            img = _extract_image_bytes(resp)
            if img is not None:
                return img, ""
            last_err = f"no image data (finish_reason={_finish_reason(resp)})"
        except Exception as e:  # noqa: BLE001 — pipeline must not crash on API errors
            last_err = f"{type(e).__name__}: {e}"
        if attempt < config.MAX_RETRIES - 1:
            time.sleep(config.RETRY_BASE_DELAY * (2 ** attempt))
    return None, f"{what} failed after {config.MAX_RETRIES} attempts — {last_err}"


def crop_region(image_bytes: bytes, box: list[int] | None) -> bytes | None:
    """Crop a [ymin,xmin,ymax,xmax] (0-1000) box from image bytes → PNG bytes.

    Coordinates are clamped; a degenerate/too-small box returns None so the
    caller can fall back. A little padding is added around the box.
    """
    if not box or len(box) != 4:
        return None
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:  # noqa: BLE001 — unreadable image
        return None
    w, h = img.size
    ymin, xmin, ymax, xmax = (max(0, min(1000, int(v))) for v in box)
    if xmax <= xmin or ymax <= ymin:
        return None
    pad = 20  # per-mille padding
    left = int(max(0, xmin - pad) / 1000 * w)
    top = int(max(0, ymin - pad) / 1000 * h)
    right = int(min(1000, xmax + pad) / 1000 * w)
    bottom = int(min(1000, ymax + pad) / 1000 * h)
    if right - left < 12 or bottom - top < 12:  # too small to be useful
        return None
    buf = io.BytesIO()
    img.crop((left, top, right, bottom)).save(buf, format="PNG")
    return buf.getvalue()


def _crop_for(item: dict, ordered_images: list[bytes]) -> bytes | None:
    """Crop the element's source region; fall back to a center crop of image 0."""
    src = item.get("source") or {}
    idx = src.get("image_index", 0)
    if isinstance(idx, int) and 0 <= idx < len(ordered_images):
        crop = crop_region(ordered_images[idx], src.get("box"))
        if crop is not None:
            return crop
    return _center_crop(ordered_images[0]) if ordered_images else None


def _center_crop(image_bytes: bytes, frac: float = 0.5) -> bytes | None:
    """Fallback: a centered square-ish crop (frac of the shorter side)."""
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:  # noqa: BLE001
        return None
    w, h = img.size
    s = int(min(w, h) * frac)
    left, top = (w - s) // 2, (h - s) // 2
    buf = io.BytesIO()
    img.crop((left, top, left + s, top + s)).save(buf, format="PNG")
    return buf.getvalue()


def generate_sketch_from_vision(
    vision_data: dict | None, cfg: RunConfig
) -> tuple[bytes | None, str]:
    """Generate a clean technical-flat PNG from the look silhouette (text-to-image)."""
    return _generate_image(_build_sketch_prompt(vision_data), cfg, "sketch generation")


def generate_fabric_swatch(
    fabric: dict, ordered_images: list[bytes], cfg: RunConfig
) -> tuple[bytes | None, str]:
    """Crop the real fabric region from the source photo, then AI-clean it.

    Falls back to the raw crop if cleaning is blocked, then to text-to-image.
    """
    crop = _crop_for(fabric, ordered_images)
    if crop is not None:
        prompt = FABRIC_CLEAN_PROMPT.format(
            name=fabric.get("name") or "fabric", material=fabric.get("material") or "textile"
        )
        png, err = _generate_image(prompt, cfg, "fabric swatch", image_bytes=crop)
        if png is not None:
            return png, ""
        return crop, f"fabric swatch: cleaning failed, using raw crop ({err})"
    return _generate_image(_build_fabric_prompt(fabric), cfg, "fabric swatch (no crop)")


def _detail_level(png_bytes: bytes) -> float:
    """Rough busy-ness of an image (grayscale std-dev). Near-blank crops score low."""
    try:
        img = Image.open(io.BytesIO(png_bytes)).convert("L")
    except Exception:  # noqa: BLE001
        return 0.0
    px = list(img.getdata())
    if not px:
        return 0.0
    mean = sum(px) / len(px)
    return (sum((p - mean) ** 2 for p in px) / len(px)) ** 0.5


# Below this grayscale std-dev, a cropped region is treated as having no real,
# capturable pattern — better to show nothing than to hallucinate a motif.
_MIN_PATTERN_DETAIL = 10.0


def generate_pattern_swatch(
    pattern: dict, ordered_images: list[bytes], cfg: RunConfig
) -> tuple[bytes | None, str]:
    """Crop the real pattern region, then AI-clean it into a flat tile.

    We always flatten the real crop into a tile (never "isolate a motif on white",
    which invents shapes on ambiguous crops). If the crop is near-blank, we decline
    rather than fabricate a pattern.
    """
    crop = _crop_for(pattern, ordered_images)
    if crop is None:
        return _generate_image(_build_pattern_prompt(pattern), cfg, "pattern swatch (no crop)")
    if _detail_level(crop) < _MIN_PATTERN_DETAIL:
        return None, "pattern region too faint to capture a real swatch"
    name = pattern.get("name") or pattern.get("motif") or "pattern"
    prompt = PATTERN_CLEAN_REPEAT_PROMPT.format(name=name)
    png, err = _generate_image(prompt, cfg, "pattern swatch", image_bytes=crop)
    if png is not None:
        return png, ""
    return crop, f"pattern swatch: cleaning failed, using raw crop ({err})"


def generate_sketch(
    look, cfg: RunConfig, vision_data: dict | None = None
) -> tuple[bytes | None, str]:
    """Look-based wrapper (CLI). Delegates to generate_sketch_from_vision."""
    return generate_sketch_from_vision(vision_data, cfg)


def _extract_image_bytes(resp) -> bytes | None:
    """Pull the first inline image blob out of a generate_content response."""
    for candidate in getattr(resp, "candidates", None) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", None) or []:
            inline = getattr(part, "inline_data", None)
            if inline and getattr(inline, "data", None):
                return inline.data
    return None


def _finish_reason(resp) -> str:
    """Best-effort finish_reason of the first candidate (for error messages)."""
    for candidate in getattr(resp, "candidates", None) or []:
        fr = getattr(candidate, "finish_reason", None)
        if fr is not None:
            return str(fr).split(".")[-1]
    return "unknown"
