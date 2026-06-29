"""Pipeline Orchestrator: Target -> Moodboard.

Pulled (palette/badges) read from trends; written (narrative) is one LLM call;
generated (visual tiles) are many image calls run in parallel with
asyncio.gather. Each provider call gets a timeout + one retry, and an individual
tile failure is skipped rather than failing the whole board.
"""
from __future__ import annotations

import asyncio
import json
import logging
import zlib
from typing import Optional

from app import composer, prompts
from app.models import GeneratedImage, ImageKind, Moodboard, Target, TrendObject
from app.providers.base import ImageProvider, TextProvider, TrendProvider
from app.storage import Storage

log = logging.getLogger("inspiration_engine.pipeline")

_DEFAULT_TIMEOUT_S = 60.0

# Full per-kind tile counts (the rich board). The app may pass a leaner profile
# from config; this default keeps every section populated when none is given.
FULL_TILES = {
    "hero": 3, "silhouette": 2, "texture": 2, "pattern": 2,
    "detail": 2, "styling": 1, "colorway": 2,
}

# Fallback descriptors keep prompts well-formed when a trend type is absent.
_FALLBACKS = {
    "color": "a soft contemporary tone",
    "silhouette": "a clean modern silhouette",
    "material": "a quality natural fabric",
    "aesthetic": "a refined contemporary mood",
    "pattern": "a subtle tonal texture",
    "detail": "a refined finishing detail",
}


# ---------- relevance scoring ----------

_TOP_TRENDS = 12  # max trends to pass into bucketing after scoring


def _score_trend(trend: TrendObject, style_keywords: list[str]) -> int:
    """Count how many style_keywords appear in the trend's label or descriptor."""
    haystack = (trend.label + " " + trend.descriptor).lower()
    return sum(1 for kw in style_keywords if kw.lower() in haystack)


def _filter_by_relevance(
    trends: list[TrendObject], target: Target
) -> list[TrendObject]:
    """Keep only the most relevant trends to the query aesthetic.

    Scores each trend against style_keywords from the parsed query. Trends with
    zero score are kept only if there are not enough scored ones to fill each type
    bucket (ensures silhouette/color/material slots are never empty).
    """
    style_keywords: list[str] = (target.attributes or {}).get("style_keywords", [])
    if not style_keywords:
        return trends[:_TOP_TRENDS]

    scored = [(t, _score_trend(t, style_keywords)) for t in trends]
    scored.sort(key=lambda x: (-x[1], -x[0].confidence_score))

    # Keep only trends that scored > 0 — zero-score trends are off-aesthetic
    # and would pollute the board. Empty buckets are filled by aesthetic injection.
    result = [t for t, score in scored if score > 0]

    log.info(
        "relevance filter: %d -> %d trends (keywords=%s)",
        len(trends), len(result), style_keywords,
    )
    return result[:_TOP_TRENDS]


# ---------- bucketing & descriptor selection ----------

def _bucket(trends: list[TrendObject]) -> dict[str, list[TrendObject]]:
    buckets: dict[str, list[TrendObject]] = {}
    for t in trends:
        buckets.setdefault(t.type, []).append(t)
    return buckets


def _desc(
    buckets: dict[str, list[TrendObject]],
    kind: str,
    index: int = 0,
    injected: Optional[dict[str, str]] = None,
) -> str:
    items = buckets.get(kind, [])
    if index < len(items):
        return items[index].descriptor
    # Middle tier: LLM-injected descriptor from aesthetic knowledge
    if injected and kind in injected:
        return injected[kind]
    # Last resort: generic fallback
    return _FALLBACKS.get(kind, "")


def _refs(buckets: dict[str, list[TrendObject]], *kinds: str) -> list[str]:
    out: list[str] = []
    for k in kinds:
        for t in buckets.get(k, []):
            out.append(t.trend_id)
    return out


def _color_desc(buckets, index: int = 0, injected: Optional[dict[str, str]] = None) -> str:
    return _desc(buckets, "color", index, injected)


def _detail_desc(buckets, injected: Optional[dict[str, str]] = None) -> str:
    items = buckets.get("item_style", [])
    if items:
        return items[0].descriptor
    if injected and "item_style" in injected:
        return injected["item_style"]
    return _FALLBACKS["detail"]


# ---------- aesthetic injection ----------

_INJECTABLE_TYPES = ["color", "silhouette", "material", "pattern"]


async def _inject_from_aesthetic(
    buckets: dict[str, list[TrendObject]],
    target: Target,
    text_provider: TextProvider,
    timeout_s: float,
) -> dict[str, str]:
    """Ask the LLM to fill descriptor gaps using its aesthetic knowledge.

    Uses the query aesthetic (from target.attributes) as the seed — more reliable
    than using whatever aesthetic trend happened to be fetched. Only fires when
    at least one critical type bucket is empty.
    """
    # Prefer the query-parsed aesthetic; fall back to any aesthetic trend in buckets.
    aesthetic_label = (target.attributes or {}).get("aesthetic")
    if not aesthetic_label:
        aesthetic_trends = buckets.get("aesthetic", [])
        if not aesthetic_trends:
            return {}
        aesthetic_label = aesthetic_trends[0].label

    missing = [t for t in _INJECTABLE_TYPES if not buckets.get(t)]
    if not missing:
        return {}

    log.info("injecting LLM descriptors for missing types %s using aesthetic '%s'", missing, aesthetic_label)

    try:
        raw = await asyncio.wait_for(
            text_provider.complete(
                prompts.AESTHETIC_INJECT_SYSTEM,
                prompts.aesthetic_inject_user(aesthetic_label, target.category, missing),
                json_mode=True,
            ),
            timeout=timeout_s,
        )
        data = json.loads(raw)
        injected = {k: str(v) for k, v in data.items() if k in missing and v}
        injected["_palette"] = data.get("palette", [])
        injected["_aesthetic_label"] = aesthetic_label
        log.info("injected descriptors: %s", {k: v for k, v in injected.items() if not k.startswith("_")})
        return injected
    except Exception as e:  # noqa: BLE001
        log.warning("aesthetic injection failed: %s", e)
        return {}


# ---------- cohesion ----------

def cohesion(target: Target, trends: list[TrendObject]) -> tuple[str, int]:
    """A shared style anchor + one deterministic seed for the whole board."""
    aesthetic = target.attributes.get("aesthetic") if target.attributes else None
    style_anchor = prompts.build_style_anchor(aesthetic)
    basis = target.category + "|" + "|".join(t.trend_id for t in trends)
    seed = zlib.crc32(basis.encode("utf-8")) & 0x7FFFFFFF
    return style_anchor, seed


# ---------- robust single-image runner ----------

async def _run_image(
    image_provider: ImageProvider,
    kind: ImageKind,
    prompt: str,
    trend_refs: list[str],
    *,
    seed: int,
    aspect_ratio: str = "1:1",
    timeout_s: float = _DEFAULT_TIMEOUT_S,
    storage: Optional[Storage] = None,
) -> Optional[GeneratedImage]:
    last_err: Optional[Exception] = None
    for attempt in range(2):  # 1 try + 1 retry
        try:
            url = await asyncio.wait_for(
                image_provider.generate(prompt, aspect_ratio=aspect_ratio, seed=seed),
                timeout=timeout_s,
            )
            if storage is not None:
                # Re-host so the frontend fetches from our backend, not a
                # provider's ephemeral CDN. Failure keeps the original URL.
                url = await storage.localize(url)
            return GeneratedImage(kind=kind, url=url, prompt=prompt, trend_refs=trend_refs)
        except Exception as e:  # noqa: BLE001 - tolerate any provider failure
            last_err = e
            log.warning("image tile %s failed (attempt %d): %s", kind, attempt + 1, e)
    log.error("skipping %s tile after retries: %s", kind, last_err)
    return None


# ---------- written text ----------

async def _run_text(
    text_provider: TextProvider,
    target: Target,
    trends: list[TrendObject],
    *,
    timeout_s: float = _DEFAULT_TIMEOUT_S,
) -> dict:
    system = prompts.NARRATIVE_SYSTEM
    user = prompts.narrative_user(target.category, target.season, target.market, trends)
    fallback = {
        "narrative": f"A {target.category} mood drawn from this season's leading trends.",
        "keywords": [t.label for t in trends[:8]],
        "name_suggestions": [],
    }
    for attempt in range(2):
        try:
            raw = await asyncio.wait_for(
                text_provider.complete(system, user, json_mode=True), timeout=timeout_s
            )
            data = json.loads(raw)
            return {
                "narrative": str(data.get("narrative", fallback["narrative"])),
                "keywords": list(data.get("keywords", fallback["keywords"])),
                "name_suggestions": list(data.get("name_suggestions", [])),
            }
        except Exception as e:  # noqa: BLE001
            log.warning("text generation failed (attempt %d): %s", attempt + 1, e)
    log.error("falling back to canned text after retries")
    return fallback


# ---------- image task plan ----------

def _plan_image_tasks(
    image_provider: ImageProvider,
    target: Target,
    buckets: dict[str, list[TrendObject]],
    style_anchor: str,
    seed: int,
    timeout_s: float,
    storage: Optional[Storage] = None,
    tiles: Optional[dict[str, int]] = None,
    injected: Optional[dict[str, str]] = None,
):
    tiles = tiles if tiles is not None else FULL_TILES
    cat = target.category
    color0 = _color_desc(buckets, 0, injected)
    color1 = _color_desc(buckets, 1, injected) if len(buckets.get("color", [])) > 1 else color0
    sil0 = _desc(buckets, "silhouette", 0, injected)
    sil1 = _desc(buckets, "silhouette", 1, injected)
    mat0 = _desc(buckets, "material", 0, injected)
    mat1 = _desc(buckets, "material", 1, injected) if len(buckets.get("material", [])) > 1 else mat0
    aes0 = _desc(buckets, "aesthetic", 0, injected)
    pat0 = _desc(buckets, "pattern", 0, injected)
    detail = _detail_desc(buckets, injected)

    color_refs = _refs(buckets, "color")
    sil_refs = _refs(buckets, "silhouette")
    mat_refs = _refs(buckets, "material")
    aes_refs = _refs(buckets, "aesthetic")
    pat_refs = _refs(buckets, "pattern")
    item_refs = _refs(buckets, "item_style")

    # (kind, prompt, trend_refs, seed_offset, aspect_ratio)
    plan: list[tuple[ImageKind, str, list[str], int, str]] = [
        # hero x3 — vary aesthetic angle + colour so tiles are distinct
        ("hero", prompts.hero_prompt(cat, color0, sil0, mat0, aes0, style_anchor), color_refs + sil_refs + mat_refs + aes_refs, 0, "3:4"),
        ("hero", prompts.hero_prompt(cat, color1, sil1, mat1, aes0, style_anchor), color_refs + sil_refs + mat_refs, 1, "3:4"),
        ("hero", prompts.hero_prompt(cat, color0, sil0, mat1, aes0 + ", three-quarter view", style_anchor), color_refs + mat_refs, 2, "3:4"),
        # silhouette x2
        ("silhouette", prompts.silhouette_prompt(cat, sil0, style_anchor), sil_refs, 10, "1:1"),
        ("silhouette", prompts.silhouette_prompt(cat, sil1 + ", back view", style_anchor), sil_refs, 11, "1:1"),
        # texture x2
        ("texture", prompts.texture_prompt(mat0, style_anchor), mat_refs, 20, "1:1"),
        ("texture", prompts.texture_prompt(mat1, style_anchor), mat_refs, 21, "1:1"),
        # pattern x2
        ("pattern", prompts.pattern_prompt(pat0, color0, style_anchor), pat_refs + color_refs, 30, "1:1"),
        ("pattern", prompts.pattern_prompt(pat0 + ", larger scale", color1, style_anchor), pat_refs + color_refs, 31, "1:1"),
        # detail x2
        ("detail", prompts.detail_prompt(cat, detail, color0, style_anchor), item_refs + color_refs, 40, "1:1"),
        ("detail", prompts.detail_prompt(cat, detail + ", alternate angle", color1, style_anchor), item_refs + color_refs, 41, "1:1"),
        # styling x1
        ("styling", prompts.styling_prompt(cat, color0, aes0, style_anchor), color_refs + aes_refs, 50, "9:16"),
        # colorway x2
        ("colorway", prompts.colorway_prompt(cat, sil0, color0, style_anchor), sil_refs + color_refs, 60, "3:4"),
        ("colorway", prompts.colorway_prompt(cat, sil0, color1, style_anchor), sil_refs + color_refs, 61, "3:4"),
    ]

    # Keep only up to the configured number of tiles per kind.
    counts: dict[str, int] = {}
    tasks = []
    for kind, prompt, refs, offset, ar in plan:
        limit = tiles.get(kind, 0)
        if counts.get(kind, 0) >= limit:
            continue
        counts[kind] = counts.get(kind, 0) + 1
        tasks.append(
            _run_image(
                image_provider,
                kind,
                prompt,
                refs,
                seed=seed + offset,
                aspect_ratio=ar,
                timeout_s=timeout_s,
                storage=storage,
            )
        )
    return tasks


# ---------- top-level ----------

async def generate_moodboard(
    target: Target,
    *,
    trend_provider: TrendProvider,
    image_provider: ImageProvider,
    text_provider: TextProvider,
    storage: Optional[Storage] = None,
    tiles: Optional[dict[str, int]] = None,
    timeout_s: float = _DEFAULT_TIMEOUT_S,
) -> Moodboard:
    # 1. trends
    trends = await trend_provider.get_trends(target)
    # 2. relevance filter — keep only trends stylistically consistent with the query
    trends = _filter_by_relevance(trends, target)
    # 3. buckets
    buckets = _bucket(trends)
    # 4. aesthetic injection — fill empty type buckets using LLM fashion knowledge
    #    only fires when an aesthetic trend exists but color/silhouette/material are sparse
    injected = await _inject_from_aesthetic(buckets, target, text_provider, timeout_s)
    # 5-6. pulled — use real trend data where available, injected data as fallback
    palette = composer.build_palette(buckets.get("color", []))
    if not palette and injected.get("_palette"):
        palette = composer.build_palette_from_injection(injected["_palette"])
    badges = composer.build_badges(trends)
    if not badges and injected.get("_aesthetic_label"):
        badges = composer.build_badges_from_injection(injected["_aesthetic_label"], target.category)
    # 7. cohesion (builds aesthetic-aware style anchor)
    style_anchor, seed = cohesion(target, trends)
    # 8. image tasks  +  9. text task
    image_tasks = _plan_image_tasks(image_provider, target, buckets, style_anchor, seed, timeout_s, storage, tiles, injected)
    text_task = _run_text(text_provider, target, trends, timeout_s=timeout_s)
    # 9. PARALLEL
    results = await asyncio.gather(*image_tasks, text_task)
    image_results = [r for r in results[:-1] if isinstance(r, GeneratedImage)]
    text_result = results[-1]
    # 9. compose
    return composer.compose(target, palette, badges, image_results, text_result)
