"""Mock image provider — deterministic placeholders, no external network.

When given a `LocalStorage`, it writes a real SVG placeholder into `static/` and
returns a URL served by our own backend, so the demo is fully self-contained
and offline. Without storage it returns a `placehold.co` URL (handy for unit
tests that don't want files on disk).
"""
from __future__ import annotations

import hashlib
import re
from typing import Optional
from urllib.parse import quote

from app.storage import LocalStorage


class ImageMockProvider:
    def __init__(self, storage: Optional[LocalStorage] = None) -> None:
        self._storage = storage

    async def generate(
        self,
        prompt: str,
        *,
        aspect_ratio: str = "1:1",
        seed: Optional[int] = None,
        reference_image_url: Optional[str] = None,
    ) -> str:
        digest = hashlib.sha1(f"{prompt}|{seed}".encode("utf-8")).hexdigest()[:8]
        bg = digest[:6]
        label = _short_label(prompt, digest)
        w, h = _dims_for_ratio(aspect_ratio)

        if self._storage is not None:
            svg = _placeholder_svg(w, h, bg, label)
            # deterministic filename so the same prompt+seed reuses one file
            return self._storage.save_text(svg, ".svg", key=f"mock_{digest}_{w}x{h}")

        # No storage: external placeholder URL (no files written).
        return f"https://placehold.co/{w}x{h}/{bg}/ffffff/png?text={quote(label)}"


def _dims_for_ratio(aspect_ratio: str) -> tuple[int, int]:
    table = {
        "1:1": (800, 800),
        "3:4": (750, 1000),
        "4:3": (1000, 750),
        "16:9": (1280, 720),
        "9:16": (720, 1280),
    }
    return table.get(aspect_ratio, (800, 800))


def _short_label(prompt: str, digest: str) -> str:
    words = re.findall(r"[A-Za-z]+", prompt)[:4]
    head = " ".join(words) if words else "tile"
    return f"{head} {digest}"


def _placeholder_svg(w: int, h: int, bg_hex: str, label: str) -> str:
    safe = (label.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    font = max(18, w // 22)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}">'
        f'<rect width="100%" height="100%" fill="#{bg_hex}"/>'
        f'<text x="50%" y="50%" fill="#ffffff" font-family="sans-serif" '
        f'font-size="{font}" text-anchor="middle" dominant-baseline="middle">'
        f"{safe}</text></svg>"
    )
