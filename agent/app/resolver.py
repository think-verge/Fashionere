"""Input resolution: the three input modes -> a single `Target`.

After resolution the generation path is identical for all three modes. The
query and image paths use small LLM/vision calls that return JSON; the mock
providers answer these offline.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

from app import prompts
from app.config import get_settings
from app.models import (
    CatalogueRequest,
    ImageRequest,
    QueryRequest,
    Target,
)
from app.providers.base import TextProvider


class ResolverError(ValueError):
    """Raised when an input cannot be resolved to a Target."""


# ---------- catalogue ----------

@lru_cache(maxsize=1)
def _catalogue_index() -> dict[str, dict]:
    path: Path = get_settings().catalogue_path
    items = json.loads(path.read_text(encoding="utf-8"))
    return {item["catalogue_item_id"]: item for item in items}


def load_catalogue() -> list[dict]:
    return list(_catalogue_index().values())


def load_catalogue_item(catalogue_item_id: str) -> dict:
    try:
        return _catalogue_index()[catalogue_item_id]
    except KeyError as e:
        raise ResolverError(f"Unknown catalogue_item_id: {catalogue_item_id!r}") from e


# ---------- small JSON helper ----------

def _loads(text: str) -> dict:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ResolverError(f"Provider did not return valid JSON: {text!r}") from e
    if not isinstance(data, dict):
        raise ResolverError(f"Expected a JSON object, got: {text!r}")
    return data


def _clean(value) -> Optional[str]:
    if value in (None, "", "null", "n/a", "N/A"):
        return None
    return str(value)


# ---------- per-mode resolution ----------

async def parse_query(query: str, text_provider: TextProvider) -> dict:
    raw = await text_provider.complete(
        prompts.QUERY_PARSE_SYSTEM, prompts.query_parse_user(query), json_mode=True
    )
    data = _loads(raw)
    if not _clean(data.get("category")):
        raise ResolverError(f"Could not determine a category from query: {query!r}")
    return data


async def describe_image(image_url: str, vision_provider: TextProvider) -> dict:
    raw = await vision_provider.complete(
        prompts.IMAGE_DESCRIBE_SYSTEM, prompts.image_describe_user(image_url), json_mode=True
    )
    data = _loads(raw)
    if not _clean(data.get("category")):
        raise ResolverError(f"Could not determine a category from image: {image_url!r}")
    return data


async def resolve(
    mode: str,
    payload,
    text_provider: TextProvider,
    vision_provider: Optional[TextProvider] = None,
) -> Target:
    if mode == "query":
        assert isinstance(payload, QueryRequest)
        parsed = await parse_query(payload.query, text_provider)
        attributes: dict = {}
        if aesthetic := _clean(parsed.get("aesthetic")):
            attributes["aesthetic"] = aesthetic
        if keywords := parsed.get("style_keywords"):
            attributes["style_keywords"] = [str(k) for k in keywords if k]
        return Target(
            category=parsed["category"],
            attributes=attributes,
            season=_clean(parsed.get("season")),
            market=_clean(parsed.get("market")),
            raw_query=payload.query,
            source_mode="query",
        )

    if mode == "catalogue":
        assert isinstance(payload, CatalogueRequest)
        item = load_catalogue_item(payload.catalogue_item_id)
        return Target(
            category=item["category"],
            attributes=item.get("attributes", {}),
            source_mode="catalogue",
        )

    if mode == "image":
        assert isinstance(payload, ImageRequest)
        attrs = await describe_image(payload.image_url, vision_provider or text_provider)
        return Target(
            category=attrs["category"],
            attributes=attrs.get("attributes", {}),
            reference_image_url=payload.image_url,
            source_mode="image",
        )

    raise ResolverError(f"Unknown input mode: {mode!r}")
