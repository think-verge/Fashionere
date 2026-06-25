"""MongoDB Atlas trend provider — queries the live trend_records collection."""
from __future__ import annotations

import logging
from typing import Any

import motor.motor_asyncio

from app.models import Target, TrendObject

log = logging.getLogger("inspiration_engine.trends_mongo")

_ACTIVE_STAGES = {"emerging", "rising", "peaking"}
_MIN_CONFIDENCE = 60

# Fields present in Atlas that are not in TrendObject — strip before validation.
_STRIP_FIELDS = {"_id", "embedding", "review_status", "last_updated"}

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


def _norm_category(value: str | None) -> str:
    v = (value or "").strip().lower()
    return _CATEGORY_ALIASES.get(v, v)


def _to_date(value: Any) -> Any:
    """Convert a datetime (with time component) to a plain date, leave other values as-is."""
    if hasattr(value, "date"):
        return value.date()
    if isinstance(value, str) and "T" in value:
        try:
            from datetime import datetime as _dt
            return _dt.fromisoformat(value.replace("Z", "+00:00")).date()
        except ValueError:
            pass
    return value


def _prep(doc: dict[str, Any]) -> dict[str, Any]:
    """Strip Atlas-only fields and fix null context so Pydantic validation passes."""
    for field in _STRIP_FIELDS:
        doc.pop(field, None)

    # TrendContext.category is required (str) but Atlas stores null for universal trends.
    # Replace null with "" so validation passes; filtering treats "" as "any category".
    ctx = doc.get("context") or {}
    doc["context"] = {
        "category": ctx.get("category") or "",
        "season": ctx.get("season"),
        "market": ctx.get("market"),
        "gender": ctx.get("gender"),
    }

    # Atlas stores first_seen/last_seen as full datetimes; TrendObject expects plain date.
    for date_field in ("first_seen", "last_seen"):
        if date_field in doc:
            doc[date_field] = _to_date(doc[date_field])

    return doc


class TrendsMongoProvider:
    def __init__(
        self,
        mongodb_uri: str,
        db_name: str = "centoire",
        collection: str = "trend_records",
    ) -> None:
        self._client = motor.motor_asyncio.AsyncIOMotorClient(mongodb_uri)
        self._col = self._client[db_name][collection]

    async def get_trends(self, target: Target) -> list[TrendObject]:
        category = _norm_category(target.category)

        # Fetch all active trends from Atlas — category/season/market filtering
        # is done in Python because Atlas context fields may be null (universal trends).
        query: dict[str, Any] = {
            "confidence_score": {"$gte": _MIN_CONFIDENCE},
            "lifecycle_stage": {"$in": list(_ACTIVE_STAGES)},
        }

        cursor = self._col.find(query).sort("confidence_score", -1)

        out: list[TrendObject] = []
        async for raw in cursor:
            try:
                doc = _prep(dict(raw))
                trend = TrendObject(**doc)

                # Include if category matches OR if trend has no category (universal).
                trend_category = _norm_category(trend.context.category)
                if trend_category and trend_category != category:
                    continue
                # Include if season matches OR trend has no season set.
                if target.season and trend.context.season and trend.context.season != target.season:
                    continue
                # Include if market matches OR trend has no market set.
                if target.market and trend.context.market and trend.context.market != target.market:
                    continue

                out.append(trend)
            except Exception as e:  # noqa: BLE001
                log.warning("skipping malformed trend doc %s: %s", raw.get("trend_id"), e)

        log.info("fetched %d trends for category=%s season=%s", len(out), category, target.season)
        return out
