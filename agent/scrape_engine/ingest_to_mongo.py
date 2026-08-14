"""
Layer 5: ingest the flattened look documents into MongoDB Atlas.

Layer 4 (`flatten.py`) leaves one self-describing document per look on disk. This
layer walks every one of those files and upserts each look into a single Mongo
collection, so a query can return a look without needing its parent envelope.

Nothing here inserts blindly. Duplicates are prevented twice over, because the
question "has this already been ingested?" has two different answers:

  * per collection -- `ingest/manifest.{database}.{collection}.json` records the
    SHA-256 of every flattened file it has ingested. Re-running with nothing
    changed on disk makes no writes at all, and no network calls beyond the
    connection handshake. One ledger per target, so pointing the ingest at a
    second database does not erase the record of what is in the first.
  * per document -- every look is upserted on its `look_id` (a deterministic id
    written by flatten.py) and carries a `content_hash`. A look whose hash still
    matches the stored one is skipped; the rest update in place. So even with the
    manifest deleted, a re-ingest converges on the same corpus instead of
    doubling it.

    python ingest_to_mongo.py --dry-run        # show the plan, connect to nothing
    python ingest_to_mongo.py                  # ingest whatever is new or changed
    python ingest_to_mongo.py --designer prada # just one designer
    python ingest_to_mongo.py --force          # re-upsert even if unchanged

Exit code is non-zero if any collection failed, so CI goes red while still having
ingested everything it could.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator, Sequence

from pymongo import ASCENDING, MongoClient, UpdateOne
from pymongo.errors import BulkWriteError, OperationFailure, PyMongoError

# Everything this layer reads and writes lives beside this file, so it behaves
# identically whether launched from here, from the repo root, or by CI.
HERE = Path(__file__).resolve().parent

# All human-facing times use this zone so a run reads the same on your machine and
# in CI (which runs in UTC). A fixed offset is exact for India -- no daylight
# saving -- and avoids depending on tzdata being present on Windows.
DISPLAY_TZ = timezone(timedelta(hours=5, minutes=30), "IST")

# Bump this to invalidate every ingest entry in the manifest, which re-upserts the
# whole corpus on the next run (rolls a document-shape fix out everywhere).
INGEST_VERSION = 1

# The deterministic look identity written by flatten.py. Every upsert filters on
# it, so it is also the collection's unique index.
ID_FIELD = "look_id"

# Fields this layer adds to each document. Excluded from the content hash, or the
# hash would never match itself.
BOOKKEEPING = ("_id", "content_hash", "first_ingested_at", "last_ingested_at",
               "ingest_version")

# (keys, options). The unique index is the backstop that makes a duplicate look
# physically impossible, even if some other tool writes to this collection.
INDEXES: tuple[tuple[list[tuple[str, int]], dict], ...] = (
    ([(ID_FIELD, ASCENDING)], {"name": "look_id_unique", "unique": True}),
    ([("designer", ASCENDING), ("collection_name", ASCENDING),
      ("look_number", ASCENDING)], {"name": "designer_collection_look"}),
    ([("source_url", ASCENDING)], {"name": "source_url"}),
)

_MISSING = object()


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Upsert flattened look documents into MongoDB, skipping anything "
                    "already ingested.")
    p.add_argument("--flattened-dir", default=str(HERE / "data" / "flattened"),
                   help="Directory holding {designer}/*_flattened.json(l).")
    p.add_argument("--file", action="append", default=[],
                   help="Ingest this flattened file only. Repeatable.")
    p.add_argument("--designer", action="append", default=[],
                   help="Only this designer (folder name or designer field). Repeatable.")
    p.add_argument("--manifest", default=None,
                   help="Ingest ledger. Default: ingest/manifest.{database}.{collection}"
                        ".json -- one per target, so switching databases keeps both records.")
    p.add_argument("--state-manifest", default=str(HERE / "state" / "manifest.json"),
                   help="Pipeline manifest, read to cross-check what flatten produced.")
    p.add_argument("--env", default=None,
                   help="Path to a .env file. Default: this folder's, then the repo root's.")

    p.add_argument("--uri", default=None, help="Override MONGO_URI.")
    p.add_argument("--database", default=None, help="Override MONGO_DATABASE_NAME.")
    p.add_argument("--collection", default=None,
                   help="Override MONGO_RAW_RECORDS_COLLECTION (falls back to "
                        "MONGO_TREND_RECORDS_COLLECTION).")

    p.add_argument("--force", action="store_true",
                   help="Re-upsert even where the manifest says the file is unchanged.")
    p.add_argument("--dry-run", action="store_true",
                   help="Print the plan. Makes no connection and no writes.")
    p.add_argument("--limit", type=int, default=0,
                   help="Ingest at most N collections this run (0 = no limit).")
    p.add_argument("--batch-size", type=int, default=500,
                   help="Upserts per bulk_write (default 500).")
    p.add_argument("--no-indexes", action="store_true",
                   help="Skip index creation (assume they already exist).")
    p.add_argument("--legacy-fields", action="store_true",
                   help="Also write the pre-Layer-4 field names the query app still "
                        "reads: page_url alongside source_url, and a flat colors "
                        "string alongside Colors. See design.md 7.1.")
    p.add_argument("--timeout", type=int, default=20_000,
                   help="Server selection timeout in ms (default 20000).")
    p.add_argument("--verbose", action="store_true",
                   help="List every skipped collection instead of counting them.")
    return p.parse_args(argv)


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

def _parse_env_file(path: Path) -> tuple[dict[str, str], list[str]]:
    """Minimal KEY=VALUE reader that also reports keys defined more than once.

    A repeated key is silently last-one-wins in every dotenv implementation, which
    is exactly how you ingest 689 documents into the wrong collection. Worth a
    warning rather than a shrug.
    """
    values: dict[str, str] = {}
    seen: dict[str, int] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key.startswith("export "):
            key = key[len("export "):].strip()
        values[key] = value
        seen[key] = seen.get(key, 0) + 1
    return values, sorted(k for k, count in seen.items() if count > 1)


def resolve_config(args: argparse.Namespace) -> dict[str, str]:
    """Pull the connection settings from flags, then the environment, then .env.

    The environment wins over the file so CI can inject secrets without editing
    anything, matching python-dotenv's `override=False` default.
    """
    candidates = [Path(args.env)] if args.env else [HERE / ".env", HERE.parent / ".env"]
    from_file: dict[str, str] = {}
    for path in reversed(candidates):  # nearest file last, so it wins
        if path.exists():
            values, duplicates = _parse_env_file(path)
            for key in duplicates:
                print(f"   warning: {key} is defined more than once in {path.name}; "
                      f"using the last value ({values[key]!r})")
            from_file.update(values)

    def pick(flag: str | None, *keys: str) -> str:
        for key in keys:
            value = flag or os.environ.get(key) or from_file.get(key)
            if value:
                return value
        return flag or ""

    config = {
        "uri": pick(args.uri, "MONGO_URI"),
        # No fallback default: with more than one database in play, a missing
        # setting must fail loudly rather than quietly write to whichever one
        # happened to be hardcoded here.
        "database": pick(args.database, "MONGO_DATABASE_NAME"),
        # This layer writes the raw scraped look corpus. The older name is still
        # honoured so an environment that only sets it keeps working.
        "collection": pick(args.collection, "MONGO_RAW_RECORDS_COLLECTION",
                           "MONGO_TREND_RECORDS_COLLECTION"),
    }
    missing = [name for name, value in config.items() if not value]
    if missing and not args.dry_run:
        raise SystemExit(f"Missing MongoDB settings: {', '.join(missing)}. "
                         "Set them in .env or pass --uri/--database/--collection.")
    return config


# --------------------------------------------------------------------------- #
# Manifest
# --------------------------------------------------------------------------- #

def now_iso() -> str:
    """ISO 8601 carrying the +05:30 offset: unambiguous to a machine, readable to us."""
    stamped = datetime.now(DISPLAY_TZ).strftime("%Y-%m-%dT%H:%M:%S%z")
    return f"{stamped[:-2]}:{stamped[-2:]}"  # +0530 -> +05:30


def rel_to_here(path: Path | str) -> str:
    """Store manifest paths relative to the engine folder, with forward slashes.

    Absolute paths break the moment the repo is checked out elsewhere (every CI
    run) and CWD-relative paths break when the script is launched from another
    directory -- either way the skip check silently fails and every collection is
    ingested again.
    """
    try:
        return Path(path).resolve().relative_to(HERE).as_posix()
    except ValueError:
        return Path(path).as_posix()


def _manifest_name(database: str, collection: str) -> str:
    """`Fashionere` + `Raw Data` -> `manifest.Fashionere.Raw_Data.json`."""
    def slug(value: str) -> str:
        return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._-") or "unknown"
    return f"manifest.{slug(database)}.{slug(collection)}.json"


def _file_legacy_manifest(folder: Path) -> None:
    """Rename the original single `ingest/manifest.json` to its own target's name.

    The first version of this layer assumed one target and wrote one ledger. Now
    that a second database is in play, an unnamed manifest would be adopted by
    whichever target ran next -- overwriting the record of what is already in the
    other one. Filing it under the target it actually describes keeps both.
    """
    legacy = folder / "manifest.json"
    if not legacy.exists():
        return
    try:
        target = json.loads(legacy.read_text(encoding="utf-8")).get("target") or {}
    except json.JSONDecodeError:
        return
    if not (target.get("database") and target.get("collection")):
        return
    owner = folder / _manifest_name(target["database"], target["collection"])
    if owner.exists():
        return
    legacy.replace(owner)
    print(f"   note: existing ledger describes {target['database']}."
          f"{target['collection']}; filed as {owner.name}")


def resolve_manifest_path(args: argparse.Namespace, config: dict) -> Path:
    if args.manifest:
        path = Path(args.manifest)
        return path if path.is_absolute() else HERE / path
    folder = HERE / "ingest"
    _file_legacy_manifest(folder)
    return folder / _manifest_name(config["database"], config["collection"])


def load_manifest(path: Path) -> dict:
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            data.setdefault("collections", {})
            _normalise_paths(data)
            return data
        except json.JSONDecodeError:
            print(f"   warning: manifest at {path} is unreadable; starting a fresh one")
    return {"ingest_version": INGEST_VERSION, "collections": {}}


def _normalise_paths(manifest: dict) -> None:
    """Rewrite Windows-style stored paths to forward slashes, in place.

    A manifest written on Windows carries `data\\flattened\\x.json`. On Linux that
    is one filename, not a path, so the file would look absent and be re-ingested.
    """
    for entry in manifest.get("collections", {}).values():
        stage = (entry.get("stages") or {}).get("ingest") or {}
        source = stage.get("source")
        if isinstance(source, str) and "\\" in source:
            stage["source"] = source.replace("\\", "/")


def build_summary(manifest: dict) -> dict:
    """Roll the per-collection ledger up into one at-a-glance block.

    Sits at the top of the manifest so the state of the ingested corpus -- per
    designer, per status -- can be read without opening any other file. Same shape
    as state/manifest.json's summary, so both files read alike.
    """
    by_designer: dict[str, dict] = {}
    status_counts = {"ok": 0, "partial": 0, "failed": 0, "pending": 0}
    totals = {"collections": 0, "documents": 0, "looks": 0, "unmatched_details": 0,
              "inserted": 0, "updated": 0, "unchanged": 0}

    for entry in manifest.get("collections", {}).values():
        stage = (entry.get("stages") or {}).get("ingest") or {}
        slug = entry.get("designer_key") or "unknown"
        bucket = by_designer.setdefault(slug, {
            "designer": entry.get("designer") or slug, "collections": 0,
            "documents": 0, "looks": 0, "unmatched_details": 0,
            "last_run": "", "collection_names": [], "incomplete": [],
        })

        bucket["collections"] += 1
        totals["collections"] += 1
        for key in ("documents", "looks", "unmatched_details"):
            value = int(stage.get(key) or 0)
            bucket[key] += value
            totals[key] += value
        for key in ("inserted", "updated", "unchanged"):
            totals[key] += int(stage.get(key) or 0)

        name = entry.get("collection_name") or "?"
        bucket["collection_names"].append(name)
        if entry.get("last_run", "") > bucket["last_run"]:
            bucket["last_run"] = entry["last_run"]

        status = stage.get("status")
        key = status if status in ("ok", "partial", "failed") else "pending"
        status_counts[key] += 1
        if key != "ok":
            bucket["incomplete"].append(f"{name}:ingest={key}")

    return {
        "updated_at": now_iso(),
        "ingest_version": INGEST_VERSION,
        "designers": len(by_designer),
        **totals,
        "by_status": status_counts,
        "by_designer": dict(sorted(by_designer.items())),
    }


def save_manifest(path: Path, manifest: dict, target: dict) -> None:
    """Write the ledger with the summary first, via a temp file.

    Saved after every collection, so a crash mid-run cannot lose the record of
    what has already been written to Mongo -- which is the whole defence against
    duplicates on the next run.
    """
    ordered = {"ingest_version": INGEST_VERSION,
               "target": target,
               "summary": build_summary(manifest),
               "collections": manifest.get("collections", {})}
    manifest.clear()
    manifest.update(ordered)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    temp.replace(path)


# --------------------------------------------------------------------------- #
# Input
# --------------------------------------------------------------------------- #

def discover(args: argparse.Namespace) -> list[Path]:
    if args.file:
        paths = [Path(f) if Path(f).is_absolute() else HERE / f for f in args.file]
        for path in paths:
            if not path.exists():
                raise SystemExit(f"No such flattened file: {path}")
        return paths

    root = Path(args.flattened_dir)
    if not root.is_absolute():
        root = HERE / root
    found = [p for pattern in ("*_flattened.json", "*_flattened.jsonl")
             for p in root.rglob(pattern)]
    return sorted(set(found))


def load_documents(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".jsonl":
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    payload = json.loads(text)
    if not isinstance(payload, list):
        raise SystemExit(f"{path} is not a list of documents -- is it a tagged file?")
    return payload


def file_fingerprint(path: Path) -> str:
    """Content identity of a flattened file: cheap, exact, and stable across runs."""
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return f"sha256:{digest[:32]}"


def content_hash(doc: dict) -> str:
    """Identity of one look's content, ignoring this layer's own bookkeeping."""
    payload = {k: v for k, v in doc.items() if k not in BOOKKEEPING}
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False,
                           separators=(",", ":"), default=str)
    return f"sha256:{hashlib.sha256(canonical.encode('utf-8')).hexdigest()[:32]}"


def describe(path: Path, documents: Sequence[dict]) -> dict:
    """Collection-level identity, read off the documents themselves.

    flatten.py copies these five fields onto every look, so the first document is
    as authoritative as the envelope was -- and the folder name gives the same
    designer slug the pipeline uses.
    """
    head = documents[0] if documents else {}
    return {
        "source_url": head.get("source_url") or f"file:{rel_to_here(path)}",
        "designer": head.get("designer") or path.parent.name,
        "designer_key": path.parent.name.lower(),
        "collection_name": head.get("collection_name") or path.stem,
    }


def flatten_stage_index(path: Path) -> dict[str, dict]:
    """Map each flattened output path from the pipeline manifest to its flatten stage.

    Only used to stamp `built_on_flatten_at` and to notice a collection the
    pipeline flattened but this layer cannot see.
    """
    if not path.exists():
        return {}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    index: dict[str, dict] = {}
    for url, entry in (state.get("collections") or {}).items():
        stage = (entry.get("stages") or {}).get("flatten") or {}
        output = stage.get("output")
        if output:
            index[str(output).replace("\\", "/")] = {**stage, "source_url": url}
    return index


# --------------------------------------------------------------------------- #
# Documents
# --------------------------------------------------------------------------- #

def add_legacy_fields(doc: dict) -> dict:
    """Mirror the Layer-4 fields under their pre-Layer-4 names.

    The query app reads `page_url` (graph.py) and a flat `colors` string
    (mongo_query.py), both of which Layer 4 renamed or restructured. Writing both
    shapes keeps those endpoints working until they are migrated -- see design.md
    section 7.1. Additive: the new names stay exactly as flatten wrote them.
    """
    def flat_colors(record: dict) -> None:
        colors = record.get("Colors")
        if not isinstance(colors, list) or not colors:
            return
        names = [str(c.get("color_name")) for c in colors
                 if isinstance(c, dict) and c.get("color_name")]
        if names:
            record.setdefault("colors", ", ".join(names))
        hexes = [str(c.get("hex_code")) for c in colors
                 if isinstance(c, dict) and c.get("hex_code")]
        if hexes:
            record.setdefault("hex_code", hexes[0])

    if doc.get("source_url"):
        doc.setdefault("page_url", doc["source_url"])
    flat_colors(doc)
    for detail in doc.get("details_images") or []:
        if isinstance(detail, dict):
            flat_colors(detail)
            if detail.get("image_description"):
                detail.setdefault("description", detail["image_description"])
    return doc


def prepare(documents: Sequence[dict], legacy: bool) -> tuple[list[dict], int, int]:
    """Validate, de-duplicate within the file, and apply any field mirroring."""
    prepared: dict[str, dict] = {}
    no_id = 0
    for doc in documents:
        look_id = doc.get(ID_FIELD)
        if not look_id:
            no_id += 1
            continue
        record = dict(doc)
        record.pop("_id", None)  # never let a stored _id ride along
        prepared[str(look_id)] = add_legacy_fields(record) if legacy else record
    # Two documents sharing a look_id are the same look by definition; keeping the
    # last is what the upsert would have done anyway, just without the write.
    return list(prepared.values()), no_id, len(documents) - len(prepared) - no_id


def chunked(items: Sequence[Any], size: int) -> Iterator[Sequence[Any]]:
    for start in range(0, len(items), size):
        yield items[start:start + size]


# --------------------------------------------------------------------------- #
# Mongo
# --------------------------------------------------------------------------- #

def connect(config: dict, timeout: int):
    client = MongoClient(config["uri"], serverSelectionTimeoutMS=timeout,
                         appname="fashion-engine-ingest")
    try:
        client.admin.command("ping")
    except PyMongoError as exc:
        raise SystemExit(f"Cannot reach MongoDB: {exc}") from exc
    return client, client[config["database"]][config["collection"]]


def ensure_indexes(collection) -> None:
    for keys, options in INDEXES:
        try:
            collection.create_index(keys, **options)
        except OperationFailure as exc:
            # The unique index is the likely casualty: pre-existing documents in
            # this collection with a missing or repeated look_id. Say so plainly
            # rather than aborting -- the upsert filter still prevents duplicates
            # from this layer.
            print(f"   warning: could not create index {options.get('name')}: "
                  f"{exc.details.get('errmsg', exc) if exc.details else exc}")


def upsert(collection, documents: Sequence[dict], batch_size: int,
           stamp: str, force: bool) -> dict:
    """Upsert every look on its look_id, skipping those whose content is unchanged.

    One indexed read per batch of ids tells us which looks Mongo already holds and
    what content they hold, so an unchanged corpus costs reads and no writes.
    """
    stored: dict[str, Any] = {}
    if not force:
        ids = [doc[ID_FIELD] for doc in documents]
        for chunk in chunked(ids, 1_000):
            for row in collection.find({ID_FIELD: {"$in": list(chunk)}},
                                       {ID_FIELD: 1, "content_hash": 1}):
                stored[row[ID_FIELD]] = row.get("content_hash")

    operations: list[UpdateOne] = []
    unchanged = 0
    for doc in documents:
        digest = content_hash(doc)
        prior = stored.get(doc[ID_FIELD], _MISSING)
        if prior is not _MISSING and prior == digest:
            unchanged += 1
            continue
        payload = {**doc, "content_hash": digest, "last_ingested_at": stamp,
                   "ingest_version": INGEST_VERSION}
        operations.append(UpdateOne(
            {ID_FIELD: doc[ID_FIELD]},
            {"$set": payload, "$setOnInsert": {"first_ingested_at": stamp}},
            upsert=True))

    inserted = updated = 0
    errors: list[str] = []
    for chunk in chunked(operations, max(1, batch_size)):
        try:
            result = collection.bulk_write(list(chunk), ordered=False)
            inserted += result.upserted_count
            updated += result.modified_count
        except BulkWriteError as exc:
            details = exc.details or {}
            inserted += int(details.get("nUpserted") or 0)
            updated += int(details.get("nModified") or 0)
            for failure in details.get("writeErrors", [])[:5]:
                errors.append(str(failure.get("errmsg") or failure))
            remaining = len(details.get("writeErrors", [])) - 5
            if remaining > 0:
                errors.append(f"... and {remaining} more write error(s)")

    return {"inserted": inserted, "updated": updated, "unchanged": unchanged,
            "attempted": len(operations), "errors": errors}


# --------------------------------------------------------------------------- #
# Run
# --------------------------------------------------------------------------- #

def wanted(meta: dict, filters: Sequence[str]) -> bool:
    if not filters:
        return True
    haystack = {meta["designer_key"].lower(), str(meta["designer"]).lower()}
    return any(f.lower() in haystack for f in filters)


def skip_reason(entry: dict, fingerprint: str, target: dict, legacy: bool) -> str | None:
    """Why this file needs no work -- or None if it does.

    Every input to the last ingest has to match: the file's bytes, the collection
    it went to, the document shape, and this layer's version.
    """
    stage = (entry.get("stages") or {}).get("ingest") or {}
    if stage.get("status") != "ok":
        return None
    if stage.get("fingerprint") != fingerprint:
        return None
    if (entry.get("target") or {}) != target:
        return None
    if bool(stage.get("legacy_fields")) != legacy:
        return None
    if int(stage.get("ingest_version") or 0) != INGEST_VERSION:
        return None
    return "unchanged since last ingest"


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    config = resolve_config(args)
    target = {"database": config["database"], "collection": config["collection"]}

    paths = discover(args)
    if not paths:
        print(f"No flattened files under {args.flattened_dir}. "
              "Run flatten.py (or run_pipeline.py) first.")
        return 1

    manifest_path = resolve_manifest_path(args, config)
    manifest = load_manifest(manifest_path)
    state_index = flatten_stage_index(Path(args.state_manifest) if Path(args.state_manifest)
                                      .is_absolute() else HERE / args.state_manifest)

    print(f"Target      : {config['database']}.{config['collection']}")
    print(f"Manifest    : {rel_to_here(manifest_path)}")
    print(f"Flattened   : {len(paths)} file(s) under {rel_to_here(paths[0].parent.parent)}")
    if args.legacy_fields:
        print("Legacy      : also writing page_url and flat colors (design.md 7.1)")
    print()

    # ----- plan -------------------------------------------------------------- #
    planned: list[tuple[Path, dict, list[dict], str, int, int]] = []
    skipped: list[str] = []
    for path in paths:
        documents = load_documents(path)
        if not documents:
            print(f"   warning: {rel_to_here(path)} holds no documents; skipped")
            continue
        meta = describe(path, documents)
        if not wanted(meta, args.designer):
            continue

        fingerprint = file_fingerprint(path)
        entry = manifest["collections"].get(meta["source_url"], {})
        reason = None if args.force else skip_reason(entry, fingerprint, target,
                                                     args.legacy_fields)
        if reason:
            skipped.append(f"{meta['designer']} {meta['collection_name']} -- {reason}")
            continue

        prepared, no_id, deduped = prepare(documents, args.legacy_fields)
        if not prepared:
            print(f"   warning: {rel_to_here(path)} has no document carrying a "
                  f"{ID_FIELD}; skipped")
            continue
        planned.append((path, meta, prepared, fingerprint, no_id, deduped))

    if args.limit:
        planned = planned[:args.limit]

    # A collection the pipeline flattened but we cannot see is a silent gap in the
    # corpus -- much better named than discovered later as missing looks in Mongo.
    # Only meaningful when we swept the whole tree: with --file, "not in this run"
    # is the point, not a problem.
    if not args.file:
        on_disk = {rel_to_here(p) for p in paths}
        for output, stage in state_index.items():
            if stage.get("status") == "ok" and output not in on_disk:
                print(f"   warning: pipeline manifest lists {output} as flattened, but "
                      "the file is not there; not ingested")

    if skipped:
        print(f"Skipping {len(skipped)} collection(s) already ingested"
              f"{':' if args.verbose else ' (--verbose to list, --force to redo)'}")
        if args.verbose:
            for line in skipped:
                print(f"   - {line}")
        print()

    if not planned:
        print("Nothing to ingest. Everything on disk is already in Mongo.")
        save_manifest(manifest_path, manifest, target)
        return 0

    total_documents = sum(len(docs) for _, _, docs, _, _, _ in planned)
    if args.dry_run:
        print("Plan (dry run -- nothing is written, no connection made):")
        for path, meta, docs, _, _, _ in planned:
            looks = sum(1 for d in docs if d.get("look_number") is not None)
            print(f"   {meta['designer']:<12} {meta['collection_name']:<28} "
                  f"{len(docs):>4} docs ({looks} looks)")
        print(f"\n{len(planned)} collection(s), {total_documents} document(s) "
              f"would be upserted into {config['database']}.{config['collection']}.")
        return 0

    # ----- ingest ------------------------------------------------------------ #
    client, collection = connect(config, args.timeout)
    try:
        if not args.no_indexes:
            ensure_indexes(collection)

        seen_ids: dict[str, str] = {}
        failures = 0
        run_totals = {"documents": 0, "inserted": 0, "updated": 0, "unchanged": 0}

        for path, meta, documents, fingerprint, no_id, deduped in planned:
            stamp = now_iso()
            looks = sum(1 for d in documents if d.get("look_number") is not None)
            unmatched = len(documents) - looks

            # Two files claiming the same look would fight over one Mongo document
            # on every run. Name it rather than let the last writer win quietly.
            collisions = [i for i in (d[ID_FIELD] for d in documents) if i in seen_ids]
            for look_id in collisions[:3]:
                print(f"   warning: {look_id} already ingested this run from "
                      f"{seen_ids[look_id]}")
            for doc in documents:
                seen_ids[doc[ID_FIELD]] = rel_to_here(path)

            print(f"-> {meta['designer']} {meta['collection_name']}")
            print(f"   documents : {len(documents)}  ({looks} looks"
                  + (f", {unmatched} unmatched-detail" if unmatched else "") + ")")
            if no_id:
                print(f"   note      : {no_id} document(s) carry no {ID_FIELD}; not ingested")
            if deduped:
                print(f"   note      : {deduped} duplicate {ID_FIELD}(s) within the file; "
                      "kept the last")

            result = upsert(collection, documents, args.batch_size, stamp, args.force)
            status = "partial" if result["errors"] else "ok"
            print(f"   upserted  : {result['inserted']} new, {result['updated']} changed, "
                  f"{result['unchanged']} unchanged")
            for message in result["errors"]:
                print(f"   error     : {message}")

            entry = manifest["collections"].setdefault(meta["source_url"], {})
            entry.setdefault("first_seen", stamp)
            entry.update({
                "designer_key": meta["designer_key"],
                "collection_name": meta["collection_name"],
                "designer": meta["designer"],
                "target": target,
                "last_run": stamp,
            })
            entry.setdefault("stages", {})["ingest"] = {
                "status": status,
                "at": stamp,
                "ingest_version": INGEST_VERSION,
                "legacy_fields": bool(args.legacy_fields),
                "source": rel_to_here(path),
                "fingerprint": fingerprint,
                "built_on_flatten_at": state_index.get(rel_to_here(path), {}).get("at"),
                "documents": len(documents),
                "looks": looks,
                "unmatched_details": unmatched,
                "inserted": result["inserted"],
                "updated": result["updated"],
                "unchanged": result["unchanged"],
                "skipped_no_look_id": no_id,
                "duplicate_look_ids_in_file": deduped,
                **({"errors": result["errors"]} if result["errors"] else {}),
            }
            # Saved per collection: a crash after this point must not lose the fact
            # that these documents are already in Mongo.
            save_manifest(manifest_path, manifest, target)

            run_totals["documents"] += len(documents)
            for key in ("inserted", "updated", "unchanged"):
                run_totals[key] += result[key]
            if status != "ok":
                failures += 1
            print()

        summary = manifest["summary"]
        print(f"Ingested {run_totals['documents']} document(s) from {len(planned)} "
              f"collection(s): {run_totals['inserted']} new, "
              f"{run_totals['updated']} changed, {run_totals['unchanged']} unchanged")
        print(f"Collection now holds {collection.count_documents({}):,} document(s) "
              f"({summary['documents']} tracked across {summary['collections']} "
              f"collection(s), {summary['designers']} designer(s))")
        print(f"Manifest -> {manifest_path.resolve()}")
        if not args.legacy_fields:
            print("\nNote: documents carry source_url and structured Colors. The query "
                  "app still reads page_url and a flat colors string -- re-run with "
                  "--legacy-fields to write both shapes (design.md 7.1).")
        if failures:
            print(f"\n{failures} collection(s) had write errors.")
            return 1
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
