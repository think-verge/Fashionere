"""
Upload master TrendRecord objects to MongoDB.

Reads:
    Master_data/trend_records/master_trend_records.json

Writes/upserts into:
    MONGO_DATABASE_NAME.MONGO_TREND_RECORDS_COLLECTION

.env required in this folder:
    MONGO_URI=...
    MONGO_DATABASE_NAME=centoire
    MONGO_TREND_RECORDS_COLLECTION=Trend_Records
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv

try:
    from pymongo import MongoClient, UpdateOne
    from pymongo.errors import BulkWriteError, PyMongoError
except ModuleNotFoundError:
    MongoClient = None
    UpdateOne = None
    BulkWriteError = None
    PyMongoError = Exception


SCRIPT_DIR = Path(__file__).resolve().parent
TREND_RECORDS_DIR = SCRIPT_DIR / "Master_data" / "trend_records"
DEFAULT_BATCH_SIZE = 500


def latest_trend_records_file(directory: Path) -> Path:
    """Newest timestamped trend_records_*.json (names sort chronologically)."""
    candidates = sorted(directory.glob("trend_records_*.json"))
    if candidates:
        return candidates[-1]
    legacy = directory / "master_trend_records.json"
    if legacy.exists():
        return legacy
    raise FileNotFoundError(
        f"No trend_records_*.json found in {directory}. Run build_trends_from_raw.py first."
    )


def load_settings() -> Dict[str, str]:
    load_dotenv(SCRIPT_DIR / ".env")

    settings = {
        "mongo_uri": os.getenv("MONGO_URI", "").strip(),
        "database": os.getenv("MONGO_DATABASE_NAME", "").strip(),
        "collection": os.getenv("MONGO_TREND_RECORDS_COLLECTION", "Trend_Records").strip(),
    }

    missing = [key for key, value in settings.items() if not value]
    if missing:
        raise RuntimeError(
            "Missing required .env values: " + ", ".join(missing)
        )

    return settings


def load_trend_records(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Trend records file not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    if isinstance(payload, dict):
        records = payload.get("trend_records")
    else:
        records = payload

    if not isinstance(records, list):
        raise ValueError(
            "Expected JSON to contain a top-level list or a 'trend_records' list."
        )

    cleaned_records: List[Dict[str, Any]] = []
    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            raise ValueError(f"Trend record #{index} is not an object.")
        trend_id = str(record.get("trend_id", "")).strip()
        if not trend_id:
            raise ValueError(f"Trend record #{index} is missing trend_id.")

        # Mongo reserves _id; let Mongo create it while trend_id remains the stable key.
        record = dict(record)
        record.pop("_id", None)
        cleaned_records.append(record)

    return cleaned_records


def batched(values: List[Dict[str, Any]], batch_size: int):
    for start in range(0, len(values), batch_size):
        yield values[start : start + batch_size]


def upload_trend_records(
    records: List[Dict[str, Any]],
    mongo_uri: str,
    database_name: str,
    collection_name: str,
    batch_size: int,
    dry_run: bool,
) -> Dict[str, int]:
    if dry_run:
        return {
            "matched": 0,
            "modified": 0,
            "upserted": 0,
            "processed": len(records),
        }

    if MongoClient is None or UpdateOne is None:
        raise RuntimeError(
            "pymongo is not installed. Run: .\\venv\\Scripts\\python.exe -m pip install pymongo"
        )

    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=15000)
    try:
        client.admin.command("ping")
        collection = client[database_name][collection_name]
        collection.create_index("trend_id", unique=True)

        totals = {
            "matched": 0,
            "modified": 0,
            "upserted": 0,
            "processed": 0,
        }

        for batch in batched(records, batch_size):
            operations = [
                UpdateOne(
                    {"trend_id": record["trend_id"]},
                    {"$set": record},
                    upsert=True,
                )
                for record in batch
            ]
            if not operations:
                continue

            result = collection.bulk_write(operations, ordered=False)
            totals["matched"] += result.matched_count
            totals["modified"] += result.modified_count
            totals["upserted"] += result.upserted_count
            totals["processed"] += len(batch)

        return totals
    except BulkWriteError as exc:
        details = exc.details or {}
        write_errors = details.get("writeErrors", [])
        first_error = write_errors[0] if write_errors else details
        raise RuntimeError(f"MongoDB bulk write failed: {first_error}") from exc
    except PyMongoError as exc:
        raise RuntimeError(f"MongoDB upload failed: {exc}") from exc
    finally:
        client.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload master trend records JSON to MongoDB."
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=None,
        help="Path to a trend records JSON. Defaults to the latest trend_records_*.json.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help="Mongo bulk write batch size.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate input and settings without writing to MongoDB.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        settings = load_settings()
        trend_file = args.file or latest_trend_records_file(TREND_RECORDS_DIR)
        records = load_trend_records(trend_file)
        totals = upload_trend_records(
            records=records,
            mongo_uri=settings["mongo_uri"],
            database_name=settings["database"],
            collection_name=settings["collection"],
            batch_size=args.batch_size,
            dry_run=args.dry_run,
        )
    except Exception as exc:
        print(f"Upload failed: {exc}", file=sys.stderr)
        return 1

    mode = "Validated" if args.dry_run else "Uploaded"
    print(
        f"{mode} {totals['processed']} trend records from {trend_file.name} "
        f"to {settings['database']}.{settings['collection']}."
    )
    if not args.dry_run:
        print(
            f"matched={totals['matched']} "
            f"modified={totals['modified']} "
            f"upserted={totals['upserted']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
