"""FLUX.1 [pro] image generation via fal.ai.

Activated by IMAGE_PROVIDER=fal with FAL_KEY set. The fal-client SDK is imported
lazily so the app runs without it installed when using mocks.
"""
from __future__ import annotations

import asyncio
from typing import Optional


class FalImageProvider:
    def __init__(self, api_key: str, model: str = "fal-ai/flux-pro") -> None:
        if not api_key:
            raise ValueError("FAL_KEY is required for FalImageProvider")
        self._api_key = api_key
        self._model = model

    async def generate(
        self,
        prompt: str,
        *,
        aspect_ratio: str = "1:1",
        seed: Optional[int] = None,
        reference_image_url: Optional[str] = None,  # Phase 2 only
    ) -> str:
        try:
            import fal_client  # type: ignore
        except ImportError as e:  # pragma: no cover - depends on optional dep
            raise RuntimeError("fal-client not installed; `pip install fal-client`") from e

        import os

        os.environ.setdefault("FAL_KEY", self._api_key)

        arguments: dict = {
            "prompt": prompt,
            "image_size": _image_size(aspect_ratio),
            "num_images": 1,
        }
        if seed is not None:
            arguments["seed"] = seed

        # fal_client exposes a blocking subscribe(); run it off the event loop.
        def _run() -> dict:
            return fal_client.subscribe(self._model, arguments=arguments)

        result = await asyncio.to_thread(_run)
        images = result.get("images") or []
        if not images:
            raise RuntimeError(f"fal.ai returned no images: {result!r}")
        return images[0]["url"]


def _image_size(aspect_ratio: str) -> str:
    table = {
        "1:1": "square_hd",
        "3:4": "portrait_4_3",
        "4:3": "landscape_4_3",
        "16:9": "landscape_16_9",
        "9:16": "portrait_16_9",
    }
    return table.get(aspect_ratio, "square_hd")
