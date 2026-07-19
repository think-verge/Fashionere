"""
Trend query engine — answer customer questions from the Mongo `trend_records`.

Pipeline (all grounded in the DB, no hallucinated trends):
  1. PARSE     Gemini turns the natural-language query into a typed QueryFilter
               (intent only — NOT raw Mongo).
  2. BUILD     Python turns that QueryFilter into a Mongo filter from an allow-list
               of fields/operators (guardrail: the LLM can never inject raw queries).
  3. RETRIEVE  fetch matching records sorted by confidence / source_count.
               Explicitly-tagged matches come first, then records whose context
               (gender/season/category) is unlabeled — null means "unknown",
               not "no match". If nothing matches, constraints are relaxed one
               rung at a time (least-reliable field first, keywords last); the
               final rung is an unfiltered top-N so callers never get nothing.
  4. SYNTHESE  Gemini writes a Markdown answer using ONLY the retrieved records,
               citing them by label. Empty result -> honest "nothing found".

Returns both the Markdown answer AND the structured trends used.

Reuses the parent Centior/.env:
    MONGO_URI, MONGO_DATABASE_NAME, MONGO_TREND_RECORDS_COLLECTION, GOOGLE_API_KEY
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field

SCRIPT_DIR = Path(__file__).resolve().parent
CENTIOR_DIR = SCRIPT_DIR.parent
GEMINI_MODEL = "gemini-2.5-pro"
MAX_LIMIT = 200
MIN_LIMIT = 20   # floor: a too-small parsed limit can't silently under-fetch a broad query

Group = Literal["color", "silhouette", "pattern", "material", "aesthetic", "item_style", "brand"]
Demand = Literal["rising", "peaking", "fading", "unknown"]
Lifecycle = Literal["emerging", "rising", "peaking", "fading"]
Gender = Literal["women", "men", "unisex"]

# Fields sent to the LLM for grounding (drop bulky embedding + provenance id list).
PROJECTION = {"_id": 0, "embedding": 0}


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
class QueryFilter(BaseModel):
    """Typed intent the LLM extracts from the query. Only set what the query implies."""

    groups: List[Group] = Field(default_factory=list, description="Trend types asked about")
    demand_direction: Optional[Demand] = None
    lifecycle_stage: Optional[Lifecycle] = None
    season: Optional[str] = Field(None, description="e.g. SS26, FW25, Q1-26")
    gender: Optional[Gender] = None
    category: Optional[str] = Field(None, description="e.g. denim, dresses, footwear")
    keywords: List[str] = Field(default_factory=list, description="Free terms to match label/descriptor")
    min_confidence: Optional[int] = Field(None, ge=0, le=100)
    min_source_count: Optional[int] = Field(None, ge=1)
    limit: int = Field(20, ge=1)   # clamped to MAX_LIMIT in retrieve(); no upper bound here
                                   # so an over-large LLM value doesn't fail validation


class QueryResponse(BaseModel):
    query: str
    answer: str                          # fully furnished recommendation summary (prose)
    filter_used: Dict[str, Any]          # broadest Mongo filter run (after padding/relaxation)
    parsed_filter: Dict[str, Any]        # the LLM's typed intent (incl. its limit) — for debugging
    limit_used: int                      # effective retrieval limit after flooring/clamping
    total_matched: int                   # docs matching the filter BEFORE the limit
    broadened: bool
    trend_count: int                     # docs actually returned (after limit)
    trends: List[Dict[str, Any]]


# --------------------------------------------------------------------------- #
# Settings + connections (lazy so import stays side-effect free)
# --------------------------------------------------------------------------- #
def load_settings() -> Dict[str, str]:
    load_dotenv(CENTIOR_DIR / ".env")
    settings = {
        "mongo_uri": os.getenv("MONGO_URI", "").strip(),
        "database": os.getenv("MONGO_DATABASE_NAME", "").strip(),
        "collection": os.getenv("MONGO_TREND_RECORDS_COLLECTION", "trend_records").strip(),
        "api_key": (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip(),
    }
    missing = [k for k in ("mongo_uri", "database", "api_key") if not settings[k]]
    if missing:
        raise RuntimeError("Missing required .env values: " + ", ".join(missing))
    return settings


_client = None


def get_collection():
    global _client
    settings = load_settings()
    if _client is None:
        from pymongo import MongoClient

        _client = MongoClient(settings["mongo_uri"], serverSelectionTimeoutMS=15000)
    return _client[settings["database"]][settings["collection"]]


# --------------------------------------------------------------------------- #
# 1. PARSE — query -> QueryFilter
# --------------------------------------------------------------------------- #
_PARSE_SYSTEM = (
    "You convert a fashion trend question into a structured filter over a database of "
    "trend records. Set ONLY the fields the question clearly implies; leave everything "
    "else null or empty. Do not guess.\n"
    "- groups: any of color, silhouette, pattern, material, aesthetic, item_style, brand.\n"
    "- demand_direction: rising/peaking/fading/unknown; lifecycle_stage: emerging/rising/peaking/fading.\n"
    "- season like SS26/FW25/Q1-26; gender women/men/unisex; category like denim/dresses/footwear.\n"
    "- keywords: specific names/terms to match (e.g. 'butter yellow', 'balletcore').\n"
    "- min_confidence (0-100) / min_source_count only if the user asks for strong/validated trends.\n"
    "- limit: how many results (default 20)."
)


def parse_query(query: str, api_key: str, model: str = GEMINI_MODEL) -> QueryFilter:
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_google_genai import ChatGoogleGenerativeAI

    llm = ChatGoogleGenerativeAI(model=model, temperature=0, google_api_key=api_key)
    prompt = ChatPromptTemplate.from_messages(
        [("system", _PARSE_SYSTEM), ("human", "Question:\n{query}")]
    )
    chain = prompt | llm.with_structured_output(QueryFilter)
    try:
        result = chain.invoke({"query": query})
        return result if isinstance(result, QueryFilter) else QueryFilter.model_validate(result)
    except Exception as exc:  # noqa: BLE001 - degrade to an empty filter
        print(f"parse failed ({exc}); using empty filter", file=sys.stderr)
        return QueryFilter()


# --------------------------------------------------------------------------- #
# 2. BUILD — QueryFilter -> Mongo filter (allow-list only)
# --------------------------------------------------------------------------- #
def build_mongo_filter(f: QueryFilter, include_unlabeled: bool = False) -> Dict[str, Any]:
    """include_unlabeled=True also accepts records whose context field is null —
    most context metadata in this dataset is unlabeled, and null means "unknown",
    not "does not apply"."""
    q: Dict[str, Any] = {}
    ors: List[Dict[str, Any]] = []

    def add_context(field: str, rx: Dict[str, Any]) -> None:
        if include_unlabeled:
            ors.append({"$or": [{field: rx}, {field: None}]})
        else:
            q[field] = rx

    if f.groups:
        q["group"] = {"$in": list(f.groups)}
    if f.demand_direction:
        q["demand_direction"] = f.demand_direction
    if f.lifecycle_stage:
        q["lifecycle_stage"] = f.lifecycle_stage
    if f.season:
        add_context("context.season", {"$regex": re.escape(f.season), "$options": "i"})
    if f.gender:
        # \b instead of ^...$: stored values like "women, men" must match a "men"
        # query, while "men" must not match inside the word "women".
        add_context("context.gender", {"$regex": rf"\b{re.escape(f.gender)}\b", "$options": "i"})
    if f.category:
        add_context("context.category", {"$regex": re.escape(f.category), "$options": "i"})
    if f.min_confidence is not None:
        q["confidence_score"] = {"$gte": f.min_confidence}
    if f.min_source_count is not None:
        q["source_count"] = {"$gte": f.min_source_count}
    if f.keywords:
        terms = [re.escape(k.strip()) for k in f.keywords if k.strip()]
        if terms:
            rx = {"$regex": "|".join(terms), "$options": "i"}
            ors.append({"$or": [{"label": rx}, {"descriptor": rx}, {"attributes.keywords": rx}]})
    if len(ors) == 1:
        q.update(ors[0])
    elif ors:
        q["$and"] = ors
    return q


# Broadening ladder: when a filter matches nothing, drop constraints one rung at a
# time, least reliable first (gender is unlabeled on ~80% of records; lifecycle and
# demand vocabularies are heavily skewed; confidence/source thresholds rarely match
# the data's actual range). Keywords — the user's own terms — are kept until the
# very last rung, which leaves the filter empty so top trends can still be shown.
_RELAX_STEPS: List[List[str]] = [
    ["gender"],
    ["lifecycle_stage", "demand_direction"],
    ["min_confidence", "min_source_count"],
    ["season", "category"],
    ["groups"],
    ["keywords"],
]


def relaxation_ladder(f: QueryFilter) -> List[QueryFilter]:
    """Progressively relaxed copies of the filter, one per rung (cumulative)."""
    rungs: List[QueryFilter] = []
    update: Dict[str, Any] = {}
    for fields in _RELAX_STEPS:
        for name in fields:
            update[name] = [] if name in ("groups", "keywords") else None
        rungs.append(f.model_copy(update=dict(update)))
    return rungs


# --------------------------------------------------------------------------- #
# 3. RETRIEVE
# --------------------------------------------------------------------------- #
def effective_limit(parsed_limit: int, override: Optional[int]) -> int:
    """Explicit API override wins; otherwise floor the parsed limit to MIN_LIMIT so a
    too-small LLM value can't under-fetch. Always clamped to MAX_LIMIT."""
    if override is not None:
        return max(1, min(override, MAX_LIMIT))
    return max(1, min(max(parsed_limit, MIN_LIMIT), MAX_LIMIT))


def retrieve(collection, mongo_filter: Dict[str, Any], limit: int) -> List[Dict[str, Any]]:
    limit = max(1, min(limit, MAX_LIMIT))
    cursor = (
        collection.find(mongo_filter, PROJECTION)
        .sort([("confidence_score", -1), ("source_count", -1)])
        .limit(limit)
    )
    return list(cursor)


def retrieve_padded(collection, f: QueryFilter, limit: int) -> tuple[List[Dict[str, Any]], int, Dict[str, Any]]:
    """Retrieve for one filter: explicitly-tagged matches first, then pad up to
    `limit` with records whose context fields are unlabeled (null = "unknown").
    Returns (trends, total_matched, filter_reported)."""
    strict = build_mongo_filter(f)
    trends = retrieve(collection, strict, limit)
    padded = build_mongo_filter(f, include_unlabeled=True)
    if padded == strict:
        return trends, collection.count_documents(strict), strict
    if len(trends) < limit:
        seen = [t["trend_id"] for t in trends if "trend_id" in t]
        fill = {"$and": [padded, {"trend_id": {"$nin": seen}}]} if seen else padded
        trends = trends + retrieve(collection, fill, limit - len(trends))
    return trends, collection.count_documents(padded), padded


# --------------------------------------------------------------------------- #
# 4. SYNTHESISE — Markdown answer, strictly grounded
# --------------------------------------------------------------------------- #
_ANSWER_SYSTEM = (
    "You are a fashion trend advisor writing a recommendation summary for a brand or buyer. "
    "Base everything STRICTLY on the trend records provided as JSON — never invent trends, "
    "numbers, attributes or sources that are not present.\n"
    "Write a fully furnished, flowing summary in natural prose (2-4 short paragraphs). Do NOT "
    "use bullet lists, and do NOT dump raw field names or values like 'confidence_score: 60' "
    "or 'source_count: 1'. Refer to trends by name and group related ones together (colours "
    "with colours, fabrics with fabrics). You may describe momentum in words (e.g. 'rising', "
    "'still emerging') where it sharpens the recommendation. Close with one short, actionable "
    "takeaway.\n"
    "Never answer with only 'no information'. If no record matches the exact ask (lifecycle "
    "stage, season, occasion, gender...), acknowledge that in ONE short sentence, then "
    "immediately recommend the closest alternatives found in the records — e.g. if nothing is "
    "'peaking' yet, point to the strongest rising or emerging trends for that season instead — "
    "and make the closing takeaway about those alternatives."
)


def _trim(trend: Dict[str, Any]) -> Dict[str, Any]:
    keys = ("trend_id", "label", "group", "demand_direction", "lifecycle_stage",
            "confidence_score", "source_count", "context", "attributes", "descriptor",
            "source_urls")
    return {k: trend.get(k) for k in keys if k in trend}


def _no_match_message(query: str) -> str:
    return f'No trend records match "{query}". Try broadening the question or a different season or category.'


_BROADENED_NOTE = (
    "Note: no records matched every constraint of the question exactly; the records below "
    "are the closest matches after relaxing the search. Present them as the best available "
    "alternatives, not as exact answers.\n\n"
)


def _build_answer_chain(api_key: str, model: str):
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_google_genai import ChatGoogleGenerativeAI

    llm = ChatGoogleGenerativeAI(model=model, temperature=0, google_api_key=api_key)
    prompt = ChatPromptTemplate.from_messages(
        [("system", _ANSWER_SYSTEM),
         ("human", "Question: {query}\n\n{retrieval_note}Trend records (JSON):\n{trends_json}")]
    )
    return prompt | llm


def synthesize_stream(query: str, trends: List[Dict[str, Any]], api_key: str,
                      model: str = GEMINI_MODEL, broadened: bool = False):
    """Yield the recommendation summary in text chunks as the LLM produces them."""
    if not trends:
        yield _no_match_message(query)
        return
    trends_json = json.dumps([_trim(t) for t in trends], ensure_ascii=False, indent=2)
    try:
        chain = _build_answer_chain(api_key, model)
        payload = {
            "query": query,
            "trends_json": trends_json,
            "retrieval_note": _BROADENED_NOTE if broadened else "",
        }
        for chunk in chain.stream(payload):
            text = getattr(chunk, "content", "") or ""
            if text:
                yield text
    except Exception as exc:  # noqa: BLE001
        yield f"\n[answer synthesis failed: {exc}]"


def synthesize(query: str, trends: List[Dict[str, Any]], api_key: str,
               model: str = GEMINI_MODEL, broadened: bool = False) -> str:
    """Non-streaming convenience: collect the streamed chunks into one string."""
    return "".join(synthesize_stream(query, trends, api_key, model, broadened)).strip()


# --------------------------------------------------------------------------- #
# Orchestrator
# --------------------------------------------------------------------------- #
def _run_retrieval(query: str, limit: Optional[int], api_key: str, model: str) -> Dict[str, Any]:
    """Parse -> filter -> retrieve, relaxing the filter rung by rung while it
    matches nothing. Shared by both endpoints."""
    collection = get_collection()
    parsed = parse_query(query, api_key, model)
    limit_used = effective_limit(parsed.limit, limit)

    trends, total_matched, mongo_filter = retrieve_padded(collection, parsed, limit_used)

    broadened = False
    if not trends:
        prev_strict = build_mongo_filter(parsed)
        for relaxed in relaxation_ladder(parsed):
            candidate = build_mongo_filter(relaxed)
            if candidate == prev_strict:   # this rung dropped nothing that was set
                continue
            prev_strict = candidate
            broadened = True
            trends, total_matched, mongo_filter = retrieve_padded(collection, relaxed, limit_used)
            if trends:
                break

    return {
        "qfilter": parsed, "mongo_filter": mongo_filter, "total_matched": total_matched,
        "trends": trends, "broadened": broadened, "limit_used": limit_used,
    }


def answer_query(query: str, limit: Optional[int] = None, model: str = GEMINI_MODEL) -> QueryResponse:
    api_key = load_settings()["api_key"]
    r = _run_retrieval(query, limit, api_key, model)
    answer = synthesize(query, r["trends"], api_key, model, broadened=r["broadened"])
    return QueryResponse(
        query=query,
        answer=answer,
        filter_used=r["mongo_filter"],
        parsed_filter=r["qfilter"].model_dump(),
        limit_used=r["limit_used"],
        total_matched=r["total_matched"],
        broadened=r["broadened"],
        trend_count=len(r["trends"]),
        trends=r["trends"],
    )


def stream_answer(query: str, limit: Optional[int] = None, model: str = GEMINI_MODEL):
    """Generator: run retrieval, then stream the recommendation summary text chunks."""
    api_key = load_settings()["api_key"]
    r = _run_retrieval(query, limit, api_key, model)
    yield from synthesize_stream(query, r["trends"], api_key, model, broadened=r["broadened"])


def stream_answer_events(query: str, limit: Optional[int] = None, model: str = GEMINI_MODEL):
    """Generator of structured events for the streaming endpoint:
      {"type": "meta", ...retrieval details + full trend records...}   (first, once)
      {"type": "delta", "text": "..."}                                 (answer chunks)
      {"type": "done", "answer": "<complete answer>"}                  (last, once)
    A frontend that only wants the stream can render just the deltas; a backend
    consumer gets the query, filters, trends with sources, and the final answer.
    """
    api_key = load_settings()["api_key"]
    r = _run_retrieval(query, limit, api_key, model)
    yield {
        "type": "meta",
        "query": query,
        "parsed_filter": r["qfilter"].model_dump(),
        "filter_used": r["mongo_filter"],
        "limit_used": r["limit_used"],
        "total_matched": r["total_matched"],
        "broadened": r["broadened"],
        "trend_count": len(r["trends"]),
        "trends": r["trends"],
    }
    parts: List[str] = []
    for text in synthesize_stream(query, r["trends"], api_key, model, broadened=r["broadened"]):
        parts.append(text)
        yield {"type": "delta", "text": text}
    yield {"type": "done", "answer": "".join(parts).strip()}


if __name__ == "__main__":
    q = " ".join(sys.argv[1:]) or "What are the rising color trends?"
    # Stream the summary to the console (mirrors the /query/stream endpoint).
    api_key = load_settings()["api_key"]
    info = _run_retrieval(q, None, api_key, GEMINI_MODEL)
    print(f"\nPARSED : {json.dumps(info['qfilter'].model_dump(), ensure_ascii=False)}")
    print(f"FILTER : {json.dumps(info['mongo_filter'], ensure_ascii=False)}")
    print(f"LIMIT  : {info['limit_used']} | TOTAL_MATCHED: {info['total_matched']} | "
          f"RETURNED: {len(info['trends'])} | BROADENED: {info['broadened']}\n")
    for piece in synthesize_stream(q, info["trends"], api_key, GEMINI_MODEL, broadened=info["broadened"]):
        print(piece, end="", flush=True)
    print()
