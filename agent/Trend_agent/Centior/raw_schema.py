"""
Shared RawObservation schema + extraction for every Centior scraper.

Every scraper (fashion.py, glimpse.py, Heu.py, lyst.py) imports from here so they
ALL emit the same structured shape. The key idea:

  ONE source page  ->  MANY atomic RawObservations.

Each RawObservation speaks about EXACTLY ONE "group" (one trend facet). A single
fashion report that mentions 3 colors, 2 silhouettes and 4 key items therefore
produces 9 separate observations, each tagged with its group. That keeps every
record atomic and easy to roll up into TrendRecords downstream
(see build_trend_master.py).

The 7 groups (deliberately aligned with build_trend_master.TrendType so the
raw -> trend mapping is 1:1, plus `brand` which is a driver, not a trend type):

    color | silhouette | pattern | material | item_style | aesthetic | brand

The `extracted_attributes` payload is group-specific: a color observation carries
color fields, a silhouette observation carries fit/volume/length, etc. The headline
value of each observation is stored under the key build_trend_master already reads
for that group (color / silhouette / pattern / material / product_type / style /
brand), so the existing downstream stays compatible without changes.

Nothing is guessed: any field not explicitly supported by the text becomes "NA".
`hex` is explicit-only -- recorded ONLY when a literal hex code is in the text.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field

NA = "NA"

# --------------------------------------------------------------------------- #
# Controlled vocabularies
# --------------------------------------------------------------------------- #
Group = Literal[
    "color",       # a colour / shade / palette entry        -> e.g. "butter yellow"
    "silhouette",  # a shape / cut / fit / proportion         -> e.g. "oversized", "wide-leg"
    "pattern",     # a print / pattern                        -> e.g. "leopard", "pinstripe"
    "material",    # a fabric / texture                       -> e.g. "sheer", "suede"
    "item_style",  # a garment / key item / product type      -> e.g. "cargo pants", "ballet flats"
    "aesthetic",   # an overarching vibe / style / mood        -> e.g. "quiet luxury", "balletcore"
    "brand",       # a brand / designer driver or ranking      -> e.g. "Miu Miu #1"
]

RawType = Literal["product", "search_term", "hashtag", "palette", "editorial", "brand"]
DemandDirection = Literal["rising", "peaking", "fading", "unknown"]

# Which attribute key holds the "headline" value for each group, and which extra
# fields belong to that group. The headline key matches what build_trend_master.py
# already reads, so downstream extraction keeps working. `season` and `keywords`
# are added to every group.
GROUP_PROJECTION: Dict[str, Dict[str, Any]] = {
    "color":      {"headline": "color",        "fields": ["hex", "color_family", "finish", "palette_role", "pairings"]},
    "silhouette": {"headline": "silhouette",   "fields": ["fit", "volume", "length", "applies_to"]},
    "pattern":    {"headline": "pattern",      "fields": ["pattern_family", "scale", "colorway", "placement"]},
    "material":   {"headline": "material",     "fields": ["material_family", "texture", "finish", "weight"]},
    "item_style": {"headline": "product_type", "fields": ["category", "key_features", "gender"]},
    "aesthetic":  {"headline": "style",        "fields": ["mood", "associated_items", "associated_colors", "consumer_segment"]},
    "brand":      {"headline": "brand",        "fields": ["rank", "movement", "ranking_list", "associated_products", "associated_aesthetic"]},
}

# Human-readable guide injected into the LLM prompt so it knows which fields go
# with which group.
GROUP_FIELD_GUIDE = """\
Choose ONE group per observation and fill ONLY that group's fields:

- color       -> name = the colour/shade (e.g. "butter yellow"). Fields: hex (ONLY if a literal #RRGGBB code is in the text, else leave blank), color_family, finish (matte/metallic/pastel/neon), palette_role (hero/accent/base), pairings (colours shown with it).
- silhouette  -> name = the shape/cut (e.g. "oversized blazer", "wide-leg"). Fields: fit, volume, length (cropped/midi/maxi), applies_to (which garment).
- pattern     -> name = the print (e.g. "leopard", "pinstripe"). Fields: pattern_family (animal/floral/geometric/stripe/check), scale (micro/large), colorway, placement.
- material    -> name = the fabric/texture (e.g. "sheer", "suede"). Fields: material_family (leather/knit/synthetic/natural), texture (sheer/glossy/matte), finish, weight.
- item_style  -> name = the garment/key item (e.g. "cargo pants", "ballet flats"). Fields: category (top/bottom/outerwear/footwear/accessory/dress), key_features, gender.
- aesthetic   -> name = the vibe/style (e.g. "quiet luxury", "balletcore"). Fields: mood, associated_items, associated_colors, consumer_segment.
- brand       -> name = the brand/designer (e.g. "Miu Miu"). Fields: rank, movement (up/down/new), ranking_list, associated_products, associated_aesthetic.

Common to every group: season (e.g. SS26, FW25, Q1-26) and keywords (other salient terms).\
"""


# --------------------------------------------------------------------------- #
# LLM extraction models (what Gemini fills)
# --------------------------------------------------------------------------- #
class ExtractionItem(BaseModel):
    """One atomic observation about exactly one group.

    Flat by design: a fully-typed flat schema is the most reliable shape for
    Gemini structured output. Only fields relevant to `group` should be filled;
    everything else stays at its default and is dropped during projection.
    """

    group: Group = Field(description="The single trend facet this observation is about")
    name: str = Field(
        description="The headline value, e.g. 'butter yellow', 'oversized', 'cargo pants', 'quiet luxury', 'Miu Miu'"
    )
    raw_type: RawType = Field(default="editorial", description="Kind of raw item")
    demand_direction: DemandDirection = Field(
        default="unknown",
        description="Only set rising/peaking/fading on an EXPLICIT momentum signal, else unknown",
    )
    season: str = Field(default="", description="e.g. SS26, FW25, Q1-26; empty if not stated")
    raw_text: str = Field(description="Verbatim snippet from the source that supports this observation")

    # color
    hex: str = Field(default="", description="Literal #RRGGBB ONLY if present in the text; never inferred")
    color_family: str = ""
    palette_role: str = ""
    pairings: List[str] = Field(default_factory=list)
    # silhouette
    fit: str = ""
    volume: str = ""
    length: str = ""
    applies_to: str = ""
    # pattern
    pattern_family: str = ""
    scale: str = ""
    colorway: List[str] = Field(default_factory=list)
    placement: str = ""
    # material (note: `finish` is shared with color)
    material_family: str = ""
    texture: str = ""
    finish: str = ""
    weight: str = ""
    # item_style
    category: str = ""
    key_features: List[str] = Field(default_factory=list)
    gender: str = ""
    # aesthetic
    mood: str = ""
    associated_items: List[str] = Field(default_factory=list)
    associated_colors: List[str] = Field(default_factory=list)
    consumer_segment: str = ""
    # brand
    rank: str = ""
    movement: str = ""
    ranking_list: str = ""
    associated_products: List[str] = Field(default_factory=list)
    associated_aesthetic: str = ""
    # common
    keywords: List[str] = Field(default_factory=list)


class ExtractionBatch(BaseModel):
    """All atomic observations found on one page/source."""

    observations: List[ExtractionItem] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Final saved record
# --------------------------------------------------------------------------- #
class RawObservation(BaseModel):
    observation_id: str
    source: str
    source_url: str
    captured_date: str
    raw_type: str
    group: str                                         # NEW: the trend facet
    extracted_attributes: Union[Dict[str, Any], str]   # group-specific dict, or "NA"
    demand_direction: str
    raw_text: str


# --------------------------------------------------------------------------- #
# NA handling + projection + build
# --------------------------------------------------------------------------- #
def na(value: Any) -> Any:
    """Empty / missing -> 'NA', otherwise the value unchanged."""
    if value is None:
        return NA
    if isinstance(value, str) and not value.strip():
        return NA
    if isinstance(value, (list, dict, tuple, set)) and len(value) == 0:
        return NA
    return value


def project_attributes(item: ExtractionItem) -> Union[Dict[str, Any], str]:
    """Keep only the fields that belong to this observation's group.

    The headline (`name`) is stored under the key build_trend_master reads for the
    group (e.g. color/silhouette/product_type). `season` and `keywords` are added
    for every group. Everything is NA-filled.
    """
    spec = GROUP_PROJECTION[item.group]
    data = item.model_dump()

    attrs: Dict[str, Any] = {spec["headline"]: na(item.name)}
    for field in spec["fields"]:
        attrs[field] = na(data.get(field))
    attrs["season"] = na(item.season)
    attrs["keywords"] = na(item.keywords)

    # If the headline is NA and every other field is NA too, there is nothing here.
    if all(v == NA for v in attrs.values()):
        return NA
    return attrs


def build_observation(
    item: ExtractionItem,
    *,
    source: str,
    source_url: str,
    captured_date: str,
) -> dict:
    """Turn one ExtractionItem into a saved RawObservation dict."""
    obs = RawObservation(
        observation_id=str(uuid.uuid4()),
        source=na(source),
        source_url=na(source_url),
        captured_date=na(captured_date),
        raw_type=na(item.raw_type),
        group=na(item.group),
        extracted_attributes=project_attributes(item),
        demand_direction=na(item.demand_direction),
        raw_text=na(item.raw_text),
    )
    return obs.model_dump()


def build_observations(
    items: List[ExtractionItem],
    *,
    source: str,
    source_url: str,
    captured_date: str,
) -> List[dict]:
    return [
        build_observation(it, source=source, source_url=source_url, captured_date=captured_date)
        for it in items
    ]


# --------------------------------------------------------------------------- #
# Save (one timestamped file per run)
# --------------------------------------------------------------------------- #
def run_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def save_observations(
    observations: List[dict],
    *,
    source_slug: str,
    raw_data_dir: str,
) -> str:
    """Write observations to Raw_data/<slug>_raw_observations_<YYYYMMDD_HHMMSS>.json.

    Shape matches what build_trend_master.collect_observation_dicts expects
    (a top-level `observations` list).
    """
    os.makedirs(raw_data_dir, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{source_slug}_raw_observations_{stamp}.json"
    filepath = os.path.join(raw_data_dir, filename)

    payload = {
        "source": source_slug,
        "captured_date": run_timestamp(),
        "observation_count": len(observations),
        "observations": observations,
    }
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    return filepath


# --------------------------------------------------------------------------- #
# Shared Gemini extraction chain
# --------------------------------------------------------------------------- #
SYSTEM_PROMPT = (
    "You normalize raw fashion text into a list of ATOMIC trend observations.\n"
    "Create ONE observation per distinct trend-thing the text mentions. A single "
    "article usually yields MANY observations: split colours, silhouettes, prints, "
    "fabrics, key items, aesthetics and brands into separate entries.\n\n"
    "Each observation must be about EXACTLY ONE group.\n\n"
    f"{GROUP_FIELD_GUIDE}\n\n"
    "STRICT RULES:\n"
    "- Use ONLY information explicitly present in the text. Never invent or infer.\n"
    "- Fill ONLY the fields that belong to the chosen group; leave the rest blank.\n"
    "- Record `hex` ONLY when a literal hex code appears in the text; never infer a "
    "hex value from a colour name.\n"
    "- If a colour, silhouette, item etc. is mentioned but you cannot tell its group, "
    "pick the single best-fitting group.\n"
    "- Set demand_direction to rising/peaking/fading ONLY on an explicit momentum "
    "signal ('exploding'/'growing' -> rising, 'peaked' -> peaking, "
    "'declining'/'fading' -> fading); otherwise 'unknown'.\n"
    "- Keep raw_text close to the source's own wording for that one thing."
)


def build_extraction_chain(model_name: str = "gemini-2.5-pro", api_key: Optional[str] = None):
    """Build the LangChain chain that returns an ExtractionBatch.

    Imports are local so this module can be imported without langchain installed
    (e.g. for tests that only touch the schema/projection helpers).
    """
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_google_genai import ChatGoogleGenerativeAI

    kwargs: Dict[str, Any] = {"model": model_name, "temperature": 0}
    if api_key:
        kwargs["google_api_key"] = api_key
    llm = ChatGoogleGenerativeAI(**kwargs)
    structured_llm = llm.with_structured_output(ExtractionBatch)
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            ("human", "Extract all atomic fashion observations from this text:\n\n{text}"),
        ]
    )
    return prompt | structured_llm


def run_extraction(chain, raw_text: str, *, max_chars: int = 200000) -> List[ExtractionItem]:
    """Invoke the chain; return [] on empty input or any failure (no hallucination)."""
    if not raw_text or not raw_text.strip():
        return []
    try:
        result = chain.invoke({"text": raw_text[:max_chars]})
        batch = result if isinstance(result, ExtractionBatch) else ExtractionBatch.model_validate(result)
        return batch.observations
    except Exception as exc:  # noqa: BLE001 - log and degrade gracefully
        print(f"   extraction failed ({exc}); no observations produced")
        return []
