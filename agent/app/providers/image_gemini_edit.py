"""Gemini image edit provider — edits an existing image via text instruction.

Used by the regenerate and edit endpoints to apply color/pattern/fabric changes
to a generated tile without a full moodboard regeneration.
"""
from __future__ import annotations

import base64
import logging
from typing import Optional

import httpx

log = logging.getLogger("inspiration_engine.image_gemini_edit")

_MIME_SUFFIX = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


class GeminiImageEditProvider:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash-image") -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required for GeminiImageEditProvider")
        try:
            from google import genai  # type: ignore
            from google.genai import types as genai_types  # type: ignore
        except ImportError as e:
            raise RuntimeError("google-genai not installed; `pip install google-genai`") from e
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._types = genai_types

    async def edit(self, image_url: str, instruction: str) -> tuple[bytes, str]:
        """Download image from URL, send to Gemini with edit instruction, return image bytes."""
        image_bytes, mime_type = await _fetch_image(image_url)
        image_part = self._types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        contents = [image_part, instruction]
        resp = await self._client.aio.models.generate_content(
            model=self._model,
            contents=contents,
        )
        data, out_mime = _first_image(resp)
        if data is None:
            reason = _finish_reason(resp)
            raise RuntimeError(f"Gemini returned no image data (finish_reason={reason})")
        return data, out_mime

    async def apply_texture(
        self,
        target_url: str,
        texture_url: str,
        texture_kind: str = "pattern",
    ) -> tuple[bytes, str]:
        """Apply the visual texture/pattern from texture_url onto the garment in target_url.

        Sends both images to Gemini with a transfer instruction. The texture image
        is used as a visual reference — Gemini applies that exact pattern/fabric
        onto the garment in the target image while preserving pose, model, and background.
        """
        target_bytes, target_mime = await _fetch_image(target_url)
        texture_bytes, texture_mime = await _fetch_image(texture_url)

        target_part = self._types.Part.from_bytes(data=target_bytes, mime_type=target_mime)
        texture_part = self._types.Part.from_bytes(data=texture_bytes, mime_type=texture_mime)

        instruction = (
            f"You are given two images. "
            f"Image 1 is a fashion outfit photo. Image 2 is a {texture_kind} tile. "
            f"Apply the exact {texture_kind} from Image 2 onto the garment in Image 1. "
            f"Keep the model pose, body shape, background, lighting, and garment silhouette "
            f"exactly the same. Only change the surface appearance of the garment."
        )

        contents = [target_part, texture_part, instruction]
        resp = await self._client.aio.models.generate_content(
            model=self._model,
            contents=contents,
        )
        data, out_mime = _first_image(resp)
        if data is None:
            reason = _finish_reason(resp)
            raise RuntimeError(f"Gemini returned no image data (finish_reason={reason})")
        return data, out_mime


async def _fetch_image(url: str) -> tuple[bytes, str]:
    """Fetch image bytes from a URL or decode a data URI."""
    if url.startswith("data:"):
        header, _, data = url.partition(",")
        mime_type = header.split(";")[0].removeprefix("data:") or "image/png"
        return base64.b64decode(data), mime_type
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    return resp.content, resp.headers.get("content-type", "image/png").split(";")[0]


def _first_image(resp) -> tuple[Optional[bytes], str]:
    candidates = getattr(resp, "candidates", None) or []
    for cand in candidates:
        content = getattr(cand, "content", None)
        for part in (getattr(content, "parts", None) or []):
            inline = getattr(part, "inline_data", None)
            if inline and getattr(inline, "data", None):
                return inline.data, (inline.mime_type or "image/png")
    return None, "image/png"


def _finish_reason(resp) -> str:
    candidates = getattr(resp, "candidates", None) or []
    if candidates:
        return str(getattr(candidates[0], "finish_reason", "unknown"))
    return "no_candidates"
