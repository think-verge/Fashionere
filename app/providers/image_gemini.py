"""Google Gemini image generation ("Nano Banana") provider.

Activated by IMAGE_PROVIDER=gemini with GEMINI_API_KEY set. Gemini returns raw
image bytes (not a hosted URL), so this provider saves them via LocalStorage and
returns a URL served by our own backend. Falls back to a data: URL if no storage
is configured.
"""
from __future__ import annotations

import base64
import logging
from typing import Optional

from app.storage import LocalStorage

log = logging.getLogger("inspiration_engine.image_gemini")

_MIME_SUFFIX = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


class GeminiImageProvider:
    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.5-flash-image",
        storage: Optional[LocalStorage] = None,
    ) -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required for GeminiImageProvider")
        try:
            from google import genai  # type: ignore
        except ImportError as e:  # pragma: no cover - optional dep
            raise RuntimeError("google-genai not installed; `pip install google-genai`") from e
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._storage = storage

    async def generate(
        self,
        prompt: str,
        *,
        aspect_ratio: str = "1:1",
        seed: Optional[int] = None,
        reference_image_url: Optional[str] = None,  # Phase 2 only
    ) -> str:
        # Gemini image gen has no aspect-ratio arg here; hint it in the prompt.
        contents = f"{prompt} Aspect ratio {aspect_ratio}."

        resp = await self._client.aio.models.generate_content(
            model=self._model, contents=contents
        )
        data, mime = _first_image(resp)
        if data is None:
            reason = _finish_reason(resp)
            raise RuntimeError(f"Gemini returned no image data (finish_reason={reason})")

        suffix = _MIME_SUFFIX.get(mime, ".png")
        if self._storage is not None:
            return self._storage.save_bytes(data, suffix)
        b64 = base64.b64encode(data).decode("ascii")
        return f"data:{mime};base64,{b64}"


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
