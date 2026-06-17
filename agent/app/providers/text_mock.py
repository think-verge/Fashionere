"""Mock text provider — canned, deterministic responses; valid JSON in json_mode.

It inspects the prompt to decide which of the three LLM tasks it is serving:
  * moodboard narrative  (pipeline)   -> {narrative, keywords, name_suggestions}
  * query parsing        (resolver)   -> {category, season, market}
  * image description    (resolver)   -> {category, attributes}
so the whole app runs offline with no keys.
"""
from __future__ import annotations

import json
import re

# Keyword -> canonical category. Shared shape with the resolver's expectations.
_CATEGORY_KEYWORDS = {
    "swimwear": ["beachwear", "swimwear", "swimsuit", "bikini", "bathing suit", "beach", "swim", "resort"],
    "dresses": ["dress", "dresses", "gown", "midi", "maxi"],
    "denim": ["denim", "jeans", "jean"],
    "t-shirts": ["t-shirt", "tshirt", "t shirt", "tee", "crew"],
}


def _match_category(text: str, default: str = "dresses") -> str:
    t = (text or "").lower()
    for category, kws in _CATEGORY_KEYWORDS.items():
        if any(kw in t for kw in kws):
            return category
    return default


def _match_season(text: str) -> str | None:
    m = re.search(r"\b(SS|FW|AW)\s?\d{2}\b", text or "", re.IGNORECASE)
    return m.group(0).upper().replace(" ", "") if m else None


def _extract_after(text: str, marker: str) -> str | None:
    """Return the first line's remainder after a case-insensitive marker."""
    for line in (text or "").splitlines():
        idx = line.lower().find(marker.lower())
        if idx != -1:
            return line[idx + len(marker):].strip()
    return None


class TextMockProvider:
    async def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        blob = f"{system}\n{user}".lower()

        # --- query parsing ---
        if "extract" in blob and "category" in blob:
            # Match against the actual request, not the prompt's example list.
            request = _extract_after(user, "request:") or user
            category = _match_category(request)
            payload = {
                "category": category,
                "season": _match_season(request),
                "market": "womenswear" if "women" in request.lower() else None,
            }
            return json.dumps(payload)

        # --- image description (vision) ---
        if "describe" in blob and "image" in blob:
            url = _extract_after(user, "image url:") or user
            category = _match_category(url)
            payload = {
                "category": category,
                "attributes": {"fit": "regular", "detected_from": "mock-vision"},
            }
            return json.dumps(payload)

        # --- moodboard narrative (default) ---
        category = _match_category(user)
        payload = {
            "narrative": (
                f"A considered {category} story built on this season's strongest signals — "
                "soft, sunlit tones meet relaxed, unhurried shapes for an effortless, "
                "quietly luxurious mood."
            ),
            "keywords": [
                "sun-bleached",
                "relaxed",
                "quiet luxury",
                "coastal",
                "soft tonal",
                "effortless",
                "textured natural",
                "editorial",
            ],
            "name_suggestions": ["Salt & Light", "Quiet Coast", "Sunwashed Hours"],
        }
        if json_mode:
            return json.dumps(payload)
        return payload["narrative"]
