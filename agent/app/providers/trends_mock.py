"""Mock trend provider — reads data/mock_trends.json and filters by Target."""
from __future__ import annotations

import json
from pathlib import Path

from app.models import Target, TrendObject

# Lifecycle stages considered "current enough" to surface.
_ACTIVE_STAGES = {"emerging", "rising", "peaking"}
_MIN_CONFIDENCE = 60


class TrendsMockProvider:
    def __init__(self, trends_path: Path) -> None:
        self._trends_path = Path(trends_path)
        self._cache: list[TrendObject] | None = None

    def _load(self) -> list[TrendObject]:
        if self._cache is None:
            raw = json.loads(self._trends_path.read_text(encoding="utf-8"))
            self._cache = [TrendObject(**obj) for obj in raw]
        return self._cache

    async def get_trends(self, target: Target) -> list[TrendObject]:
        category = _norm_category(target.category)
        out: list[TrendObject] = []
        for t in self._load():
            if _norm_category(t.context.category) != category:
                continue
            if target.season and t.context.season and t.context.season != target.season:
                continue
            if target.market and t.context.market and t.context.market != target.market:
                continue
            if t.confidence_score < _MIN_CONFIDENCE:
                continue
            if t.lifecycle_stage not in _ACTIVE_STAGES:
                continue
            out.append(t)
        out.sort(key=lambda t: t.confidence_score, reverse=True)
        return out


# "beachwear" and "swimwear" should hit the same trend bucket, etc.
_CATEGORY_ALIASES = {
    "beachwear": "swimwear",
    "bathing suit": "swimwear",
    "swimsuit": "swimwear",
    "swim": "swimwear",
    "dress": "dresses",
    "jeans": "denim",
    "tshirt": "t-shirts",
    "t shirt": "t-shirts",
    "tee": "t-shirts",
}


def _norm_category(value: str) -> str:
    v = (value or "").strip().lower()
    return _CATEGORY_ALIASES.get(v, v)
