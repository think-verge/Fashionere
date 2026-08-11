"""Persist look records + sketch assets, and track idempotency.

Output layout (under the --output dir):

    output/
      looks/<look_id>.json      one structured record per look
      assets/<look_id>/sketch.png
      index.json                {"processed": ["look_1", ...]}
"""

from __future__ import annotations

import json
from pathlib import Path

from . import config
from .schemas import LookRecord


def looks_dir(out: Path) -> Path:
    return out / config.LOOKS_DIRNAME


def assets_dir(out: Path) -> Path:
    return out / config.ASSETS_DIRNAME


def index_path(out: Path) -> Path:
    return out / config.INDEX_JSON


def ensure_dirs(out: Path) -> None:
    """Create the output tree if it doesn't exist."""
    looks_dir(out).mkdir(parents=True, exist_ok=True)
    assets_dir(out).mkdir(parents=True, exist_ok=True)


def load_index(out: Path) -> set[str]:
    """Return the set of already-processed look_ids (empty if none)."""
    p = index_path(out)
    if not p.exists():
        return set()
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return set(data.get("processed", []))
    except (json.JSONDecodeError, OSError):
        return set()


def save_index(out: Path, processed: set[str]) -> None:
    """Write index.json with a stable, natural-ish sort order."""
    def _key(look_id: str):
        tail = look_id.rsplit("_", 1)[-1]
        return (int(tail), "") if tail.isdigit() else (1 << 30, look_id)

    ordered = sorted(processed, key=_key)
    index_path(out).write_text(
        json.dumps({"processed": ordered}, indent=2), encoding="utf-8"
    )


def save_asset(out: Path, look_id: str, filename: str, png_bytes: bytes) -> str:
    """Save a generated PNG under assets/<look_id>/<filename>; return its rel path."""
    dest_dir = assets_dir(out) / look_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / filename).write_bytes(png_bytes)
    return f"{config.ASSETS_DIRNAME}/{look_id}/{filename}"


def save_sketch(out: Path, look_id: str, png_bytes: bytes) -> str:
    """Save sketch PNG; return its output-relative path (assets/<id>/sketch.png)."""
    return save_asset(out, look_id, "sketch.png", png_bytes)


def save_record(out: Path, record: LookRecord) -> Path:
    """Write output/looks/<look_id>.json and return its path."""
    dest = looks_dir(out) / f"{record['look_id']}.json"
    dest.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    return dest


def load_all_records(out: Path) -> list[LookRecord]:
    """Read every stored record, sorted by look index (for the gallery)."""
    ld = looks_dir(out)
    if not ld.is_dir():
        return []
    records: list[LookRecord] = []
    for p in ld.glob("*.json"):
        try:
            records.append(json.loads(p.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            continue

    def _key(rec):
        tail = str(rec.get("look_id", "")).rsplit("_", 1)[-1]
        return (int(tail), "") if tail.isdigit() else (1 << 30, rec.get("look_id", ""))

    return sorted(records, key=_key)
