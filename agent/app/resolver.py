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
    CreativeBrief,
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

async def resolve_brief(query: str, parsed: dict, text_provider: TextProvider) -> Optional[CreativeBrief]:
    """Build a CreativeBrief from the parsed query. Returns None on failure — pipeline degrades gracefully."""
    try:
        raw = await text_provider.complete(
            prompts.BRIEF_SYSTEM, prompts.brief_user(query, parsed), json_mode=True
        )
        data = _loads(raw)
        return CreativeBrief(
            category=parsed.get("category", ""),
            aesthetic=_clean(parsed.get("aesthetic")),
            gender=_clean(data.get("gender")),
            age_group=_clean(data.get("age_group")),
            occasion=_clean(data.get("occasion")),
            dominant_fabric=_clean(data.get("dominant_fabric")),
            compatible_materials=[str(m) for m in (data.get("compatible_materials") or []) if m],
            compatible_patterns=[str(p) for p in (data.get("compatible_patterns") or []) if p],
            compatible_silhouettes=[str(s) for s in (data.get("compatible_silhouettes") or []) if s],
            compatible_colors=[str(c) for c in (data.get("compatible_colors") or []) if c],
            prompt_gender_modifier=str(data.get("prompt_gender_modifier") or ""),
            injection_context=str(data.get("injection_context") or ""),
        )
    except Exception as e:
        import logging
        logging.getLogger("inspiration_engine.resolver").warning("brief resolution failed: %s", e)
        return None


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
        brief = await resolve_brief(payload.query, parsed, text_provider)
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
            brief=brief,
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
