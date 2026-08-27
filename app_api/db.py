"""MongoDB client for the app API.

Single lazily-initialized client, reused across requests. Reads MONGO_URI from
the .env in Trend Analysis Engine (shared with the scraper + tagger)."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import dotenv_values
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

_ENV_CANDIDATES = [
    Path(__file__).resolve().parents[1] / "Trend Analysis Engine" / ".env",
    Path(__file__).resolve().parents[1] / ".env",
]


def _mongo_uri() -> str:
    if v := os.getenv("MONGO_URI"):
        return v
    for env in _ENV_CANDIDATES:
        if env.exists():
            v = dotenv_values(env).get("MONGO_URI")
            if v:
                return v
    raise RuntimeError(
        "MONGO_URI not set — export it or put it in Trend Analysis Engine/.env"
    )


@lru_cache(maxsize=1)
def _client() -> MongoClient:
    return MongoClient(_mongo_uri(), serverSelectionTimeoutMS=15000)


def db() -> Database:
    name = os.getenv("MONGO_DB", "Fashionere")
    return _client()[name]


def canonical_looks() -> Collection:
    return db()["canonical_looks"]


def deconstructions() -> Collection:
    return db()["deconstructions"]
