"""Persistent swatch store — MongoDB GridFS (image bytes) + a metadata collection.

The deconstruction MVP writes here so swatches are generated ONCE and reused:

    Fashionere.deconstructions      one doc per look  (_id = look_id)  — metadata
    Fashionere.swatches.{files,chunks}  GridFS bucket  — the PNG bytes
    Fashionere.swatch_cache         content_hash -> gridfs_id  — exact-repeat guard

Reuse model:
- Look-level: `is_done(look_id)` skips a look already fully processed (unless forced).
- Swatch-level: `put_swatch` dedupes on the SOURCE-crop hash, so re-running a look (or
  an identical crop) reuses the stored PNG instead of paying fal again.

Dependency-light: pass a MONGO_URI (or set env MONGO_URI). DB defaults to `Fashionere`.
Cross-look *material* dedup (same fabric in different photos) is intentionally out of
scope for the MVP — it needs perceptual hashing, noted as future work.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from typing import Any

import gridfs
from pymongo import MongoClient


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class DeconstructionStore:
    def __init__(self, mongo_uri: str | None = None, db_name: str = "Fashionere"):
        uri = mongo_uri or os.environ.get("MONGO_URI")
        if not uri:
            raise RuntimeError("MONGO_URI not set (pass mongo_uri= or export MONGO_URI)")
        self.client = MongoClient(uri, serverSelectionTimeoutMS=15000)
        self.db = self.client[db_name]
        self.decon = self.db["deconstructions"]
        self.cache = self.db["swatch_cache"]          # _id = source-crop hash
        self.fs = gridfs.GridFSBucket(self.db, bucket_name="swatches")
        self._ensure_indexes()

    def _ensure_indexes(self) -> None:
        self.decon.create_index("brand")
        self.decon.create_index("collection_id")
        self.decon.create_index("status")

    # --- look-level reuse ---------------------------------------------------
    def is_done(self, look_id: str) -> bool:
        return self.decon.find_one({"_id": look_id, "status": "complete"}) is not None

    def get(self, look_id: str) -> dict | None:
        return self.decon.find_one({"_id": look_id})

    # --- swatch bytes (GridFS) with source-crop dedup -----------------------
    def put_swatch(
        self, png_bytes: bytes, *, look_id: str, tag: str, source_hash: str
    ) -> tuple[Any, bool]:
        """Store a swatch PNG, deduped on the SOURCE-crop hash.

        Returns (gridfs_id, reused). `reused=True` means an identical source crop was
        already generated — the caller should SKIP the fal call and reuse this id.
        """
        hit = self.cache.find_one({"_id": source_hash})
        if hit:
            return hit["gridfs_id"], True
        fid = self.fs.upload_from_stream(
            f"{look_id}/{tag}.png",
            png_bytes,
            metadata={"look_id": look_id, "tag": tag, "source_hash": source_hash,
                      "created_at": _utcnow()},
        )
        self.cache.insert_one({"_id": source_hash, "gridfs_id": fid, "tag": tag,
                               "created_at": _utcnow()})
        return fid, False

    def lookup_swatch(self, source_hash: str):
        """Return a cached gridfs_id for this source crop, or None (pre-generation check)."""
        hit = self.cache.find_one({"_id": source_hash})
        return hit["gridfs_id"] if hit else None

    def get_swatch_bytes(self, gridfs_id) -> bytes:
        return self.fs.open_download_stream(gridfs_id).read()

    # --- record -------------------------------------------------------------
    def save_record(self, doc: dict) -> None:
        """Upsert one deconstruction doc (_id = look_id)."""
        doc = {**doc}
        doc["_id"] = doc["look_id"]
        doc.setdefault("schema_version", "1")
        doc["updated_at"] = _utcnow()
        doc.setdefault("created_at", doc["updated_at"])
        self.decon.replace_one({"_id": doc["_id"]}, doc, upsert=True)

    def export_look(self, look_id: str, out_dir) -> list[str]:
        """Write a look's stored swatches to disk (for ad-hoc use). Returns paths."""
        from pathlib import Path
        rec = self.get(look_id)
        if not rec:
            return []
        out = Path(out_dir) / look_id.replace(":", "__")
        out.mkdir(parents=True, exist_ok=True)
        paths = []

        def _dump(el, name):
            if el and el.get("gridfs_id"):
                p = out / name
                p.write_bytes(self.get_swatch_bytes(el["gridfs_id"]))
                paths.append(str(p))

        _dump(rec.get("sketch"), "look_flat.png")          # whole-look technical flat
        for g in rec.get("garments", []):
            gid = g.get("garment_id", "g")
            # support both singular (heuristic schema) and plural lists (gemini schema)
            items = []
            for kind in ("fabric", "pattern"):
                if g.get(kind):
                    items.append((kind, 0, g[kind]))
                for i, el in enumerate(g.get(kind + "s", []) or []):
                    items.append((kind, i, el))
            for kind, i, el in items:
                _dump(el, f"{gid}_{kind}{i}.png")
            _dump(g.get("flat"), f"{gid}_flat.png")         # per-garment technical flat
        return paths

    def stats(self) -> dict:
        return {
            "looks_done": self.decon.count_documents({"status": "complete"}),
            "looks_total_records": self.decon.count_documents({}),
            "swatches_stored": self.db["swatches.files"].count_documents({}),
            "cache_entries": self.cache.count_documents({}),
        }
