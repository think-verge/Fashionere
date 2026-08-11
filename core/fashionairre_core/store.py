"""Canonical store — read/write canonical `Look` records in MongoDB.

Dependency-injected: pass a pymongo collection (keeps core free of connection
concerns). `_id` is the deterministic `look_id`, so re-ingesting a look upserts
(no duplicates), and the image half + text half of the same look reconcile.
"""

from __future__ import annotations

from typing import Iterable, Iterator

from fashionairre_core.schema import Look


class CanonicalStore:
    def __init__(self, collection):
        self.c = collection

    def upsert(self, look: Look) -> None:
        doc = look.model_dump()
        doc["_id"] = look.look_id
        self.c.replace_one({"_id": look.look_id}, doc, upsert=True)

    def upsert_many(self, looks: Iterable[Look]) -> int:
        n = 0
        for lk in looks:
            self.upsert(lk)
            n += 1
        return n

    def get(self, look_id: str) -> Look | None:
        d = self.c.find_one({"_id": look_id})
        if not d:
            return None
        d.pop("_id", None)
        return Look.model_validate(d)

    def count(self) -> int:
        return self.c.count_documents({})

    def brands(self) -> list[str]:
        return sorted(x for x in self.c.distinct("context.brand_slug") if x)

    def iter(self, *, brand_slug: str | None = None) -> Iterator[Look]:
        q = {"context.brand_slug": brand_slug} if brand_slug else {}
        for d in self.c.find(q):
            d.pop("_id", None)
            yield Look.model_validate(d)
