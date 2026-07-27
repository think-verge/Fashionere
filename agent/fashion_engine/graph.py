import os
import json
from typing import List, Dict, Any, TypedDict
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI

from schemas import FashionQueryPayload, FashionEngineResponse
from mongo_query import fetch_fashion_records

load_dotenv()


# 1. Define LangGraph State
class FashionGraphState(TypedDict):
    payload: FashionQueryPayload
    records: List[Dict[str, Any]]
    ai_report: str
    sources: List[str]
    designers: List[str]
    page_urls: List[str]
    runway_imgs: List[str]


# 2. Metadata extractor: unique citation lists + counts returned in the response body.
def extract_citation_metadata(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build the unique citation lists and their counts returned in the API response body.
    Single source of truth shared by the graph node, the response assembler, and the
    inspection tool (test_query_context_llm.py), so the report mirrors the live response.
    """
    sources = list({r.get("source") for r in records if r.get("source")})
    designers = list({r.get("designer") for r in records if r.get("designer")})
    page_urls = list({r.get("page_url") for r in records if r.get("page_url")})
    runway_imgs = list({r.get("runway_img") for r in records if r.get("runway_img")})
    return {
        "sources": sources, "sources_count": len(sources),
        "designers": designers, "designers_count": len(designers),
        "page_urls": page_urls, "page_urls_count": len(page_urls),
        "runway_imgs": runway_imgs, "runway_imgs_count": len(runway_imgs),
    }


# 2b. Node: Asynchronously fetch data from MongoDB & extract citation metadata
async def fetch_data_node(state: FashionGraphState) -> Dict[str, Any]:
    payload = state["payload"]
    records = await fetch_fashion_records(payload)
    meta = extract_citation_metadata(records)
    return {
        "records": records,
        "sources": meta["sources"],
        "designers": meta["designers"],
        "page_urls": meta["page_urls"],
        "runway_imgs": meta["runway_imgs"],
    }


# Fields that describe the whole collection (identical across all looks on a page).
# When constant across the returned records they are shown ONCE in a header instead of
# being repeated in every look — the single biggest token saving (summary alone ~56%).
COLLECTION_LEVEL_FIELDS = ["designer", "source", "collection_name", "page_url", "summary"]

# Friendly labels for the collection header.
_COLLECTION_LABELS = {
    "designer": "Designer",
    "source": "Source",
    "collection_name": "Collection",
    "page_url": "Collection Page",
    "summary": "Runway Summary",
}

# Sub-image fields that mirror the parent look; dropped when they exactly equal the parent's value.
_DETAILS_ECHO_FIELDS = ["fabric", "colors", "theme", "hex_code", "keywords"]


def _compact_detail_image(img: Dict[str, Any], parent: Dict[str, Any]) -> Dict[str, Any]:
    """
    Drop sub-image fields that merely repeat the parent look's same-named field.
    `details_img_url` and `description` (close-up text with no parent counterpart) are
    always kept. Lossless: a field is removed only when identical to the look-level value.
    """
    if not isinstance(img, dict):
        return img
    return {
        k: v for k, v in img.items()
        if not (k in _DETAILS_ECHO_FIELDS and v == parent.get(k))
    }


def _constant_fields(records: List[Dict[str, Any]], candidate_fields: List[str]) -> Dict[str, Any]:
    """Return the subset of candidate_fields whose value is identical across ALL records."""
    consts: Dict[str, Any] = {}
    for field in candidate_fields:
        if records and all(field in r for r in records):
            values = [r[field] for r in records]
            if all(v == values[0] for v in values):
                consts[field] = values[0]
    return consts


def _group_by_collection(records: List[Dict[str, Any]]):
    """
    Group records by their collection identity (source + designer + collection_name +
    page_url). This lets a multi-collection result (e.g. a "2026" query matching several
    shows) emit each collection's constants — above all the ~2.7K-char `summary` — once
    per collection instead of once per look. First-appearance order is preserved.
    Returns a list of (group_key, records_in_group).
    """
    groups = {}
    order = []
    for r in records:
        key = (r.get("source"), r.get("designer"), r.get("collection_name"), r.get("page_url"))
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(r)
    return [(key, groups[key]) for key in order]


def _compact_looks(records: List[Dict[str, Any]], hoisted: set) -> List[Dict[str, Any]]:
    """Strip already-hoisted collection-level fields + `_id` from each look and compact its details_images."""
    per_look = []
    for r in records:
        look = {k: v for k, v in r.items() if k not in hoisted and k != "_id"}
        if isinstance(look.get("details_images"), list):
            look["details_images"] = [_compact_detail_image(img, r) for img in look["details_images"]]
        per_look.append(look)
    return per_look


def _collection_header(consts: Dict[str, Any], indent: str = "") -> str:
    """Render hoisted collection-level fields as labeled markdown lines, in canonical order."""
    lines = [
        f"{indent}- **{_COLLECTION_LABELS[f]}:** {consts[f]}"
        for f in COLLECTION_LEVEL_FIELDS if f in consts
    ]
    return "\n".join(lines)


# 3. Prompt Builder: Assemble the exact context string handed to Gemini
def build_analysis_prompt(payload: FashionQueryPayload, records: List[Dict[str, Any]]) -> str:
    """
    Build the full LLM context string from the payload + retrieved records.
    Extracted so inspection tooling (e.g. test_query_context_llm.py) can print
    the EXACT context sent to the LLM without duplicating this logic.

    Token-compaction (lossless), two levels of hoisting so it scales to multi-collection
    results (e.g. a "2026" query spanning several shows):
      - GLOBAL constants: collection-level fields identical across EVERY returned record
        (e.g. designer/source when the whole result is one designer) -> shown once at top.
      - PER-COLLECTION constants: records are grouped by collection, and each group's own
        constants (collection_name / page_url / the ~2.7K-char summary) are shown once in
        that collection's header, NOT repeated per look.
    Additionally `details_images` sub-fields that merely echo their parent look are stripped.
    """
    focus_str = ", ".join(payload.focus_areas) if payload.focus_areas else "General macro trends"

    # Only surface filters that are actually set (drop the None/[] ones).
    active_filters = {
        k: v for k, v in {
            "colors": payload.colors,
            "themes": payload.themes,
            "fabrics": payload.fabrics,
            "item_styles": payload.item_styles,
        }.items() if v
    }
    filters_str = json.dumps(active_filters, ensure_ascii=False) if active_filters else "None (blanket analysis)"

    groups = _group_by_collection(records)

    # Level 1 — fields constant across the ENTIRE result set (shown once at the very top).
    global_consts = _constant_fields(records, COLLECTION_LEVEL_FIELDS)
    global_header = _collection_header(global_consts) or "- (varies per collection — see sections below)"

    # Level 2 — one section per collection, hoisting that collection's remaining constants.
    blocks = []
    for idx, (key, recs) in enumerate(groups, 1):
        group_consts = {
            f: v for f, v in _constant_fields(recs, COLLECTION_LEVEL_FIELDS).items()
            if f not in global_consts
        }
        hoisted = set(global_consts) | set(group_consts)
        looks_json = json.dumps(_compact_looks(recs, hoisted), indent=2, ensure_ascii=False, default=str)

        label = (group_consts.get("collection_name") or global_consts.get("collection_name")
                 or key[2] or key[3] or "Unlabeled collection")
        group_header = _collection_header(group_consts, indent="  ") \
            or "  - (all collection-level fields shown in Common Context above)"

        blocks.append(
            f"""--- Collection {idx} of {len(groups)}: {label} ({len(recs)} looks) ---
  Collection Context (applies to all looks in THIS collection):
{group_header}
  Looks:
{looks_json}"""
        )

    collections_context = "\n\n".join(blocks)

    cross_note = ""
    if len(groups) > 1:
        cross_note = (
            f"\n5. **Cross-Collection Comparison:** {len(groups)} collections matched — compare and "
            f"contrast trends across them and call out what is distinctive to each collection."
        )

    return f"""
You are an expert Fashion Intelligence Agent. Analyze the following fashion dataset retrieved from MongoDB and produce an insightful, professional trend analysis and recommendation report.

### Common Context (shared by ALL {len(groups)} collection(s) below — shown once):
{global_header}

### Request Context:
- **Action Function:** {payload.function}
- **Focus Areas to Prioritize:** {focus_str}
- **Active User Filters:** {filters_str}
- **Scope:** {len(groups)} collection(s), {len(records)} total looks.

### Directive:
1. **Filter Analysis:** If active filters are present, focus on how those specific elements (e.g., specific colors or fabrics) are styled and positioned across the looks.
2. **Blanket Analysis:** If no specific filters are applied, provide a broad macro-trend analysis covering dominant silhouettes, color palettes, key fabrics, and underlying themes.
3. **Focus Emphasis:** Dedicate targeted sections of your response to the requested focus areas ({focus_str}).
4. **Tone:** Provide an authoritative, high-end fashion journalism analysis with actionable commercial/design recommendations.{cross_note}

### Retrieved Data — {len(groups)} collection(s), {len(records)} looks (collection-level fields hoisted, not repeated per look):

{collections_context}
"""


# 3b. Node: Analyze Trends & Generate Recommendations via Gemini 2.5 Pro
async def analyze_trends_node(state: FashionGraphState) -> Dict[str, Any]:
    payload = state["payload"]
    records = state["records"]

    if not records:
        return {
            "ai_report": f"No records found matching designer '{payload.designer}', collection '{payload.collection}', and source '{payload.source}' with the supplied filters."
        }

    # Initialize Gemini 2.5 Pro
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-pro",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.3
    )

    prompt = build_analysis_prompt(payload, records)

    response = await llm.ainvoke(prompt)
    return {"ai_report": str(response.content)}


# 4. Assemble StateGraph
workflow = StateGraph(FashionGraphState)

workflow.add_node("fetch_data", fetch_data_node)
workflow.add_node("analyze_trends", analyze_trends_node)

workflow.set_entry_point("fetch_data")
workflow.add_edge("fetch_data", "analyze_trends")
workflow.add_edge("analyze_trends", END)

fashion_graph = workflow.compile()


# 5. Graph Invocation Helper
async def run_fashion_engine(payload: FashionQueryPayload) -> FashionEngineResponse:
    initial_state: FashionGraphState = {
        "payload": payload,
        "records": [],
        "ai_report": "",
        "sources": [],
        "designers": [],
        "page_urls": [],
        "runway_imgs": []
    }

    final_state = await fashion_graph.ainvoke(initial_state)

    # Same extractor the node and inspector use -> response matches the inspection report.
    meta = extract_citation_metadata(final_state["records"])

    return FashionEngineResponse(
        ai_report=final_state["ai_report"],
        **meta,
        total_records_analyzed=len(final_state["records"]),
    )