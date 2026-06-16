"""FLUX.1 [pro] image generation via Replicate (alternate to fal.ai).

Activated by IMAGE_PROVIDER=replicate with REPLICATE_API_TOKEN set.
"""
from __future__ import annotations

import asyncio
from typing import Optional


class ReplicateImageProvider:
    def __init__(self, api_token: str, model: str = "black-forest-labs/flux-pro") -> None:
        if not api_token:
            raise ValueError("REPLICATE_API_TOKEN is required for ReplicateImageProvider")
        self._api_token = api_token
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
            import replicate  # type: ignore
        except ImportError as e:  # pragma: no cover - depends on optional dep
            raise RuntimeError("replicate not installed; `pip install replicate`") from e

        import os

        os.environ.setdefault("REPLICATE_API_TOKEN", self._api_token)

        inputs: dict = {"prompt": prompt, "aspect_ratio": aspect_ratio}
        if seed is not None:
            inputs["seed"] = seed

        def _run():
            return replicate.run(self._model, input=inputs)

        output = await asyncio.to_thread(_run)
        return _first_url(output)


def _first_url(output) -> str:
    # Replicate returns a URL, a list of URLs, or FileOutput objects.
    if isinstance(output, str):
        return output
    if isinstance(output, (list, tuple)) and output:
        item = output[0]
        return str(getattr(item, "url", item))
    url = getattr(output, "url", None)
    if url:
        return str(url)
    raise RuntimeError(f"Replicate returned no usable URL: {output!r}")
