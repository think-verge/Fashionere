"""Provider Protocols — the only thing the pipeline depends on.

Everything external (trends, images, text) implements one of these. Concrete
providers are selected at startup in `app/main.py` via `app/config.py`.
"""
from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable

from app.models import Target, TrendObject


@runtime_checkable
class TrendProvider(Protocol):
    async def get_trends(self, target: Target) -> list[TrendObject]:
        """Return trend objects relevant to the target (category/season/market),
        filtered to high-confidence + currently rising/peaking, sorted by
        confidence."""
        ...


@runtime_checkable
class ImageProvider(Protocol):
    async def generate(
        self,
        prompt: str,
        *,
        aspect_ratio: str = "1:1",
        seed: Optional[int] = None,
        reference_image_url: Optional[str] = None,  # Phase 2 only
    ) -> str:
        """Generate one image, return a URL."""
        ...


@runtime_checkable
class TextProvider(Protocol):
    async def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        """Return model text (optionally strict JSON)."""
        ...
