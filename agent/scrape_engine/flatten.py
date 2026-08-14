"""
Layer 4: flatten a tagged collection into MongoDB-ready documents.

The tagged file is a single envelope: collection metadata at the head, then an array
of looks. Mongo wants the opposite -- one self-describing document per look, so a
query can return a look without needing its parent envelope. This copies the
collection-level fields onto every record.

Pure transformation: no network, no API calls, no cost.

Usage:
    python flatten.py --tagged data/tagged/prada/Prada_fall_2025_ready_to_wear_tagged.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

# Copied verbatim onto every look document so each one stands alone.
COLLECTION_FIELDS = ("source", "designer", "source_url", "collection_name", "summary")

# Envelope-level bookkeeping that belongs to the pipeline, not to the data.
DROP_FROM_LOOK = {"mapping", "detail_matches", "tagging", "details_gallery", "looks"}

LOOK_FIELD_ORDER = (
    "look_number",
    "runway_img", "runway_img_asset", "runway_img_alt",
    # runway_img_{N}_tag is inserted here dynamically
    "image_description", "fabric", "patterns", "Colors", "theme",
    "keywords", "collection_keywords",
    "details_images",
)

_TAG_KEY_RE = re.compile(r"^runway_img_\d+_tag$")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Flatten a tagged collection into one document per look."
    )
    p.add_argument("--tagged", required=True, help="Tagged JSON produced by tag_images.py")
    p.add_argument("--out", default=None,
                   help="Output path. Defaults to the input name with _flattened.json.")
    p.add_argument("--jsonl", action="store_true",
                   help="Write newline-delimited JSON instead of a JSON array.")
    p.add_argument("--skip-unmatched", action="store_true",
                   help="Omit details that matched no look. By default they are kept as "
                        "records with look_number null so nothing is silently lost.")
    return p.parse_args(argv)


def look_id(meta: dict, look_number: Any) -> str:
    """Deterministic identity for a look, stable across re-runs.

    Lets the ingest step upsert instead of insert, so re-ingesting a collection
    updates its documents rather than duplicating them.
    """
    parts = [str(meta.get("source") or "vogue").lower(),
             str(meta.get("designer") or "").lower().replace(" ", "-"),
             str(meta.get("collection_name") or "").lower(),
             "look" if look_number is not None else "unmatched",
             str(look_number if look_number is not None else "x")]
    return ":".join(parts)


def order_look(record: dict) -> dict:
    """Collection fields first, then the look in a stable order, then look_id."""
    tag_keys = [k for k in record if _TAG_KEY_RE.match(k)]
    head = [*COLLECTION_FIELDS]
    body = ["look_number", "runway_img", "runway_img_asset", "runway_img_alt",
            *tag_keys,
            "image_description", "fabric", "patterns", "Colors", "theme",
            "keywords", "collection_keywords", "details_images"]

    ordered: dict[str, Any] = {}
    for key in (*head, *body):
        if key in record:
            ordered[key] = record[key]
    for key, value in record.items():  # anything unanticipated, then the id
        if key not in ordered and key != "look_id":
            ordered[key] = value
    if "look_id" in record:
        ordered["look_id"] = record["look_id"]
    return ordered


def flatten(payload: dict, skip_unmatched: bool = False) -> list[dict]:
    meta = {field: payload.get(field) for field in COLLECTION_FIELDS}
    documents: list[dict] = []

    for look in payload.get("looks", []):
        record = {**meta}
        record.update({k: v for k, v in look.items() if k not in DROP_FROM_LOOK})
        record["details_images"] = list(look.get("details_images") or [])
        record["look_id"] = look_id(meta, look.get("look_number"))
        documents.append(order_look(record))

    # Details that matched no look would otherwise vanish, because flattening is
    # per-look. Keep them as their own documents, clearly marked.
    if not skip_unmatched:
        for detail in payload.get("details_gallery", []):
            record = {**meta}
            record["look_number"] = None
            record["is_unmatched_detail"] = True
            record["details_images"] = [detail]
            record["look_id"] = (f"{look_id(meta, None)}-"
                                 f"{detail.get('detail_index', '?')}")
            documents.append(order_look(record))

    return documents


def run(args: argparse.Namespace) -> list[dict]:
    tagged_path = Path(args.tagged)
    payload = json.loads(tagged_path.read_text(encoding="utf-8"))

    missing = [f for f in COLLECTION_FIELDS if not payload.get(f)]
    if missing:
        print(f"   warning: collection fields absent from the envelope: {missing}")

    documents = flatten(payload, args.skip_unmatched)
    if not documents:
        raise SystemExit(f"{tagged_path} produced no documents.")

    suffix = ".jsonl" if args.jsonl else ".json"
    out_path = Path(args.out) if args.out else tagged_path.with_name(
        tagged_path.stem.replace("_tagged", "") + "_flattened" + suffix)

    if args.jsonl:
        out_path.write_text(
            "\n".join(json.dumps(d, ensure_ascii=False) for d in documents) + "\n",
            encoding="utf-8")
    else:
        out_path.write_text(json.dumps(documents, indent=2, ensure_ascii=False),
                            encoding="utf-8")

    looks = sum(1 for d in documents if d.get("look_number") is not None)
    orphans = len(documents) - looks
    details = sum(len(d.get("details_images") or []) for d in documents)
    untagged = sum(1 for d in documents if not d.get("image_description")
                   and d.get("look_number") is not None)

    print(f"-> {payload.get('designer')} {payload.get('collection_name')}")
    print(f"   documents : {len(documents)}  ({looks} looks"
          + (f", {orphans} unmatched-detail" if orphans else "") + ")")
    print(f"   details   : {details} nested across those documents")
    if untagged:
        print(f"   note      : {untagged} look(s) have no image_description "
              "(tagging incomplete)")
    print(f"\nSaved -> {out_path.resolve()}")
    return documents


def main(argv: list[str] | None = None) -> int:
    run(parse_args(argv))
    return 0


if __name__ == "__main__":
    sys.exit(main())
