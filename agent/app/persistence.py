"""MongoDB persistence for moodboards and elements.

After a moodboard is generated:
  1. Each image tile is saved as a standalone document in the `elements` collection.
  2. The full moodboard (with element_ids) is saved to the `moodboards` collection.

This lets designers browse and reuse individual elements across projects.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

import motor.motor_asyncio

from app.models import GeneratedImage, Moodboard

log = logging.getLogger("inspiration_engine.persistence")


def _element_doc(image: GeneratedImage, moodboard: Moodboard) -> dict:
    target = moodboard.target
    return {
        "element_id": f"elem_{uuid.uuid4().hex[:12]}",
        "kind": image.kind,
        "url": image.url,
        "prompt": image.prompt,
        "trend_refs": image.trend_refs,
        "moodboard_id": moodboard.moodboard_id,
        "category": target.category,
        "aesthetic": (target.attributes or {}).get("aesthetic"),
        "style_keywords": (target.attributes or {}).get("style_keywords", []),
        "season": target.season,
        "market": target.market,
        "created_at": datetime.now(timezone.utc),
    }


def _all_images(moodboard: Moodboard) -> list[GeneratedImage]:
    return (
        moodboard.hero_images
        + moodboard.silhouettes
        + moodboard.textures
        + moodboard.patterns
        + moodboard.details
        + moodboard.styling
        + moodboard.colorways
    )


async def save_moodboard(
    moodboard: Moodboard,
    mongodb_uri: str,
    db_name: str,
    moodboards_collection: str,
    elements_collection: str,
) -> None:
    client = motor.motor_asyncio.AsyncIOMotorClient(mongodb_uri)
    db = client[db_name]

    images = _all_images(moodboard)

    # 1. Save each image tile as an element document.
    element_docs = [_element_doc(img, moodboard) for img in images]
    element_ids: list[str] = []
    if element_docs:
        result = await db[elements_collection].insert_many(element_docs)
        element_ids = [doc["element_id"] for doc in element_docs]
        log.info("saved %d elements for moodboard %s", len(element_ids), moodboard.moodboard_id)

    # 2. Save the moodboard document with element_ids instead of embedding full tile data.
    target = moodboard.target
    moodboard_doc = {
        "moodboard_id": moodboard.moodboard_id,
        "category": target.category,
        "aesthetic": (target.attributes or {}).get("aesthetic"),
        "style_keywords": (target.attributes or {}).get("style_keywords", []),
        "season": target.season,
        "market": target.market,
        "raw_query": target.raw_query,
        "element_ids": element_ids,
        "palette": [s.model_dump() for s in moodboard.palette],
        "badges": [b.model_dump() for b in moodboard.badges],
        "narrative": moodboard.narrative,
        "keywords": moodboard.keywords,
        "name_suggestions": moodboard.name_suggestions,
        "created_at": moodboard.created_at,
    }
    await db[moodboards_collection].insert_one(moodboard_doc)
    log.info("saved moodboard %s to MongoDB", moodboard.moodboard_id)

    client.close()


async def get_element(
    element_id: str,
    mongodb_uri: str,
    db_name: str,
    elements_collection: str,
) -> dict | None:
    client = motor.motor_asyncio.AsyncIOMotorClient(mongodb_uri)
    doc = await client[db_name][elements_collection].find_one({"element_id": element_id})
    client.close()
    return doc


async def save_element(
    element: dict,
    mongodb_uri: str,
    db_name: str,
    elements_collection: str,
) -> None:
    client = motor.motor_asyncio.AsyncIOMotorClient(mongodb_uri)
    await client[db_name][elements_collection].insert_one(element)
    client.close()
