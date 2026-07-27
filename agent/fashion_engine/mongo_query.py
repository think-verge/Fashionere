import os
from typing import List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from schemas import FashionQueryPayload

# Load environment variables
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DATABASE_NAME = os.getenv("MONGO_DATABASE_NAME", "centoire")
MONGO_TREND_RECORDS_COLLECTION = os.getenv("MONGO_TREND_RECORDS_COLLECTION", "Trends_Vogue")

# Initialize Motor Client
client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DATABASE_NAME]
collection = db[MONGO_TREND_RECORDS_COLLECTION]


def build_mongo_query(payload: FashionQueryPayload) -> Dict[str, Any]:
    """
    Constructs a MongoDB query dynamically.
    - Mandatory fields (source/designer/collection) are always required (implicit AND).
    - Optional filters (colors, fabrics, themes, item_styles) are UNIONED together into a
      single flat $or: a look matches if it satisfies ANY filter value in ANY category
      (e.g. colors=[red, blue] + fabrics=[wool] -> red OR blue OR wool). A single find()
      with $or returns each document at most once, so no duplicates are produced.
    - Omitting optional fields creates a blanket search (no $or, mandatory fields only).
    """
    query: Dict[str, Any] = {
        "source": {"$regex": f"^{payload.source}$", "$options": "i"},
        "designer": {"$regex": f"^{payload.designer}$", "$options": "i"},
        "collection_name": {"$regex": payload.collection, "$options": "i"},
    }

    # Every optional-filter clause is collected here and unioned into one top-level $or.
    or_clauses: List[Dict[str, Any]] = []

    # Values to ignore: empty strings, whitespace, and known UI placeholders
    _PLACEHOLDERS = {"string", "none", "null", "n/a", "na"}

    def _add_filter_clause(values: List[str], root_fields: List[str], nested_fields: List[str]):
        # Strip blanks/whitespace and drop placeholder junk (e.g. Swagger's "string" default)
        values = [
            v.strip() for v in (values or [])
            if v and v.strip() and v.strip().lower() not in _PLACEHOLDERS
        ]
        for val in values:
            for field in root_fields + nested_fields:
                or_clauses.append({field: {"$regex": val, "$options": "i"}})

    # Optional filters — all unioned (OR) across categories
    if payload.colors:
        _add_filter_clause(payload.colors, ["colors"], ["details_images.colors"])

    if payload.themes:
        _add_filter_clause(payload.themes, ["theme"], ["details_images.theme"])

    if payload.fabrics:
        _add_filter_clause(payload.fabrics, ["fabric"], ["details_images.fabric"])

    if payload.item_styles:
        _add_filter_clause(
            payload.item_styles,
            ["keywords", "image_description", "summary"],
            ["details_images.keywords", "details_images.description"]
        )

    if or_clauses:
        query["$or"] = or_clauses

    return query


async def fetch_fashion_records(payload: FashionQueryPayload) -> List[Dict[str, Any]]:
    """
    Queries MongoDB asynchronously using Motor and returns serialized document dicts.
    """
    mongo_query = build_mongo_query(payload)
    cursor = collection.find(mongo_query)
    
    records = []
    async for doc in cursor:
        # Convert BSON ObjectId to string for JSON serialization
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        records.append(doc)
        
    return records