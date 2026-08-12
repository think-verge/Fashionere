"""MongoDB repository (sync, for offline jobs). Read paths in the API layer use
Motor; the write/batch paths here use PyMongo. See DESIGN.md §13.

Construction fails loudly if MONGO_URI is unset, so callers that only need the
dry-run path should simply not instantiate Repo.
"""
from __future__ import annotations

from datetime import datetime, timezone

from trend_engine.config import config

try:
    from pymongo import ASCENDING, MongoClient, UpdateOne
except Exception:  # pragma: no cover
    MongoClient = None  # type: ignore


class Repo:
    def __init__(self, uri: str | None = None, db: str | None = None):
        uri = uri or config.MONGO_URI
        if not uri:
            raise RuntimeError("MONGO_URI is not set; cannot connect to MongoDB.")
        if MongoClient is None:
            raise RuntimeError("pymongo is not installed.")
        self._client = MongoClient(uri, serverSelectionTimeoutMS=4000)
        self._db = self._client[db or config.MONGO_DB]

    @property
    def looks(self):
        return self._db["looks"]

    @property
    def collections(self):
        return self._db["collections"]

    @property
    def brand_state(self):
        return self._db["brand_state"]

    def ensure_indexes(self) -> None:
        self.looks.create_index([("look_id", ASCENDING)], unique=True)
        self.looks.create_index([("brand_slug", ASCENDING), ("year", ASCENDING)])
        self.looks.create_index([("collection_id", ASCENDING)])
        self.collections.create_index([("collection_id", ASCENDING)], unique=True)
        self.collections.create_index([("brand_slug", ASCENDING)])
        self.brand_state.create_index([("brand_slug", ASCENDING)], unique=True)

    def upsert_looks(self, looks) -> int:
        if not looks:
            return 0
        ops = [
            UpdateOne({"look_id": lk.look_id},
                      {"$set": lk.model_dump(by_alias=True, mode="json")}, upsert=True)
            for lk in looks
        ]
        res = self.looks.bulk_write(ops, ordered=False)
        return (res.upserted_count or 0) + (res.modified_count or 0)

    def upsert_collections(self, collections) -> int:
        if not collections:
            return 0
        ops = [
            UpdateOne({"collection_id": c.collection_id},
                      {"$set": c.model_dump(by_alias=True, mode="json")}, upsert=True)
            for c in collections
        ]
        res = self.collections.bulk_write(ops, ordered=False)
        return (res.upserted_count or 0) + (res.modified_count or 0)

    def bump_data_version(self, brand_slug: str) -> None:
        self.brand_state.update_one(
            {"brand_slug": brand_slug},
            {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
             "$inc": {"data_version": 1}},
            upsert=True,
        )
