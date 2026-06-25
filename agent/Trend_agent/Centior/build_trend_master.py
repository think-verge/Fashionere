"""
Build master raw observations and deduplicated TrendRecord objects.

Input:
    Raw_data/*.json

Output:
    Master_data/raw_objects/master_raw_observations.json
    Master_data/trend_records/master_trend_records.json

The LLM path uses Pydantic structured output and is strict about provenance:
every generated trend candidate must cite the raw observation_ids that support it.
If the LLM is unavailable, the script falls back to deterministic extraction from
the existing extracted_attributes fields only.
"""

import argparse
import hashlib
import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union, get_args

from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_RAW_DIR = SCRIPT_DIR / "Raw_data"
DEFAULT_OUTPUT_DIR = SCRIPT_DIR / "Master_data"
DEFAULT_MODEL = "gemini-2.5-pro"

TrendType = Literal[
    "color",
    "silhouette",
    "pattern",
    "material",
    "aesthetic",
    "item_style",
]
DemandDirection = Literal["rising", "peaking", "fading", "unknown"]
LifecycleStage = Literal["emerging", "rising", "peaking", "fading"]
ReviewStatus = Literal["approved", "pending"]

SilhouetteValue = Literal[
    "oversized",
    "relaxed",
    "baggy",
    "fitted",
    "tailored",
    "body_conscious",
    "mini",
    "midi",
    "maxi",
    "low_waist",
    "high_waist",
    "wide_leg",
    "straight_leg",
    "barrel_leg",
    "flared",
    "bootcut",
    "bubble_hem",
    "ruffled",
    "draped",
    "unknown",
]

PatternValue = Literal[
    "solid",
    "floral",
    "stripe",
    "check",
    "gingham",
    "dots",
    "animal",
    "zebra",
    "snake",
    "crocodile",
    "cow",
    "dalmatian",
    "lace",
    "other",
]

SILHOUETTE_LOOKUP = {
    "oversized": "oversized",
    "relaxed": "relaxed",
    "baggy": "baggy",
    "fitted": "fitted",
    "tailored": "tailored",
    "body conscious": "body_conscious",
    "body-conscious": "body_conscious",
    "mini": "mini",
    "midi": "midi",
    "maxi": "maxi",
    "low waist": "low_waist",
    "low-waist": "low_waist",
    "high waist": "high_waist",
    "high-waist": "high_waist",
    "wide leg": "wide_leg",
    "wide-leg": "wide_leg",
    "straight leg": "straight_leg",
    "straight-leg": "straight_leg",
    "barrel leg": "barrel_leg",
    "barrel-leg": "barrel_leg",
    "flared": "flared",
    "bootcut": "bootcut",
    "flared bootcut": "bootcut",
    "bubble hem": "bubble_hem",
    "bubble-hem": "bubble_hem",
    "ruffle": "ruffled",
    "ruffled": "ruffled",
    "draped": "draped",
}

PATTERN_LOOKUP = {
    "solid": "solid",
    "floral": "floral",
    "flower": "floral",
    "stripe": "stripe",
    "stripes": "stripe",
    "check": "check",
    "checked": "check",
    "windowpane checks": "check",
    "prince of wales": "check",
    "gingham": "gingham",
    "dot": "dots",
    "dots": "dots",
    "polka": "dots",
    "animal": "animal",
    "zebra": "zebra",
    "snake": "snake",
    "crocodile": "crocodile",
    "cow": "cow",
    "dalmatian": "dalmatian",
    "lace": "lace",
}

TEXT_SEASON_RE = re.compile(r"\b(?:SS|FW)\d{2}\b|\bQ[1-4][ -]?\d{2,4}\b|\bSpring \d{4}\b", re.I)
TEXT_MARKET_RE = re.compile(r"\b(?:EU|US|Europe|American|Milan|Q1 2026)\b", re.I)


class ColorAttribute(BaseModel):
    name: str
    hex: Optional[str] = None
    family: Optional[str] = None


class TrendAttributes(BaseModel):
    colors: List[ColorAttribute] = Field(default_factory=list)
    silhouette: Optional[SilhouetteValue] = None
    pattern: Optional[PatternValue] = None
    material: Optional[str] = None
    keywords: List[str] = Field(default_factory=list)


class TrendContext(BaseModel):
    category: Optional[str] = None
    season: Optional[str] = None
    market: Optional[str] = None
    gender: Optional[str] = None


class RawObservation(BaseModel):
    model_config = ConfigDict(extra="allow")

    observation_id: str
    source: str
    source_url: str
    captured_date: str
    raw_type: str
    extracted_attributes: Union[Dict[str, Any], str] = Field(default_factory=dict)
    demand_direction: str = "unknown"
    raw_text: str


class TrendCandidate(BaseModel):
    type: TrendType
    label: str
    attributes: TrendAttributes = Field(default_factory=TrendAttributes)
    context: TrendContext = Field(default_factory=TrendContext)
    lifecycle_stage: LifecycleStage = "emerging"
    demand_direction: DemandDirection = "unknown"
    sources: List[str] = Field(default_factory=list)
    descriptor: str = ""


class TrendCandidateBatch(BaseModel):
    trends: List[TrendCandidate] = Field(default_factory=list)


class TrendRecord(BaseModel):
    trend_id: str
    type: TrendType
    label: str
    attributes: TrendAttributes
    context: TrendContext
    lifecycle_stage: LifecycleStage
    demand_direction: DemandDirection
    confidence_score: int = Field(ge=0, le=100)
    source_count: int
    sources: List[str]
    first_seen: str
    last_seen: str
    last_updated: str
    descriptor: str
    embedding: List[float] = Field(default_factory=list)
    review_status: ReviewStatus = "pending"


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def is_na(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip().upper() in {"", "NA", "N/A", "NONE", "NULL"}
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) == 0
    return False


def as_list(value: Any) -> List[str]:
    if is_na(value):
        return []
    if isinstance(value, (list, tuple, set)):
        out: List[str] = []
        for item in value:
            out.extend(as_list(item))
        return out
    if isinstance(value, dict):
        return [clean_text(v) for v in value.values() if not is_na(v)]
    return [clean_text(value)]


def unique_keep_order(values: List[str]) -> List[str]:
    seen = set()
    out = []
    for value in values:
        cleaned = clean_text(value)
        key = cleaned.casefold()
        if cleaned and key not in seen:
            seen.add(key)
            out.append(cleaned)
    return out


def normalize_key(value: str) -> str:
    value = value.casefold().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def stable_trend_id(trend_type: str, label: str) -> str:
    digest = hashlib.sha1(f"{trend_type}|{normalize_key(label)}".encode("utf-8")).hexdigest()[:12]
    return f"trend_{digest}"


def normalize_silhouette(value: str) -> SilhouetteValue:
    key = normalize_key(value)
    for phrase, normalized in SILHOUETTE_LOOKUP.items():
        if phrase in key:
            return normalized  # type: ignore[return-value]
    return "unknown"


def normalize_pattern(value: str) -> PatternValue:
    key = normalize_key(value)
    for phrase, normalized in PATTERN_LOOKUP.items():
        if phrase in key:
            return normalized  # type: ignore[return-value]
    return "other"


def collect_observation_dicts(value: Any, out: List[Dict[str, Any]]) -> None:
    if isinstance(value, dict):
        if {"observation_id", "raw_text"}.issubset(value):
            out.append(value)
            return
        observations = value.get("observations")
        if isinstance(observations, list):
            for item in observations:
                collect_observation_dicts(item, out)
            return
        for nested in value.values():
            collect_observation_dicts(nested, out)
    elif isinstance(value, list):
        for item in value:
            collect_observation_dicts(item, out)


def load_raw_observations(raw_dir: Path) -> List[RawObservation]:
    raw_items: List[Dict[str, Any]] = []
    for path in sorted(raw_dir.glob("*.json")):
        with path.open("r", encoding="utf-8") as f:
            collect_observation_dicts(json.load(f), raw_items)

    deduped: Dict[str, RawObservation] = {}
    for item in raw_items:
        try:
            observation = RawObservation.model_validate(item)
        except Exception as exc:
            print(f"Skipping invalid raw observation: {exc}")
            continue
        if observation.observation_id not in deduped:
            deduped[observation.observation_id] = observation
    return list(deduped.values())


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def write_master_raw(observations: List[RawObservation], output_dir: Path) -> Path:
    path = output_dir / "raw_objects" / "master_raw_observations.json"
    payload = {
        "generated_at": now_utc(),
        "observation_count": len(observations),
        "observations": [obs.model_dump(mode="json") for obs in observations],
    }
    write_json(path, payload)
    return path


def observation_payload(observations: List[RawObservation]) -> List[Dict[str, Any]]:
    return [
        {
            "observation_id": obs.observation_id,
            "source": obs.source,
            "source_url": obs.source_url,
            "captured_date": obs.captured_date,
            "raw_type": obs.raw_type,
            "extracted_attributes": obs.extracted_attributes,
            "demand_direction": obs.demand_direction,
            "raw_text": obs.raw_text,
        }
        for obs in observations
    ]


def load_api_key() -> Optional[str]:
    load_dotenv(SCRIPT_DIR / ".env")
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if api_key and not os.getenv("GOOGLE_API_KEY"):
        os.environ["GOOGLE_API_KEY"] = api_key
    return api_key


def build_candidates_with_llm(
    observations: List[RawObservation],
    model_name: str,
) -> List[TrendCandidate]:
    api_key = load_api_key()
    if not api_key:
        raise RuntimeError("Set GOOGLE_API_KEY or GEMINI_API_KEY in .env to use LLM extraction.")

    from langchain_core.prompts import ChatPromptTemplate
    from langchain_google_genai import ChatGoogleGenerativeAI

    valid_ids = sorted(obs.observation_id for obs in observations)
    valid_types = ", ".join(get_args(TrendType))
    valid_silhouettes = ", ".join(get_args(SilhouetteValue))
    valid_patterns = ", ".join(get_args(PatternValue))

    system_prompt = (
        "You convert existing fashion RawObservation objects into deduplicated trend candidates. "
        "Use ONLY facts that are explicitly present in the provided observations. "
        "Do not invent colors, hex values, materials, categories, markets, genders, seasons, or sources. "
        "Create only these trend types: {valid_types}. "
        "Do not create a trend from a pure brand ranking unless the row also contains a product, item style, "
        "material, color, silhouette, pattern, or aesthetic. "
        "Group duplicate or near-duplicate labels into one candidate. "
        "Every candidate must cite only observation_ids from the provided ID list. "
        "Use null for missing context fields. Use an empty list for missing colors or keywords. "
        "For colors, set hex only if a hex code is explicitly present in the observations. "
        "For silhouette, use only this fixed list: {valid_silhouettes}. "
        "For pattern, use only this fixed list: {valid_patterns}. "
        "Keep descriptors short and only based on the cited observations."
    )
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                system_prompt.format(
                    valid_types=valid_types,
                    valid_silhouettes=valid_silhouettes,
                    valid_patterns=valid_patterns,
                ),
            ),
            (
                "human",
                "Valid observation_ids:\n{valid_ids}\n\n"
                "Raw observations JSON:\n{observations_json}\n\n"
                "Return deduplicated trend candidates with provenance.",
            ),
        ]
    )
    llm = ChatGoogleGenerativeAI(
        model=model_name,
        temperature=0,
        google_api_key=api_key,
    )
    chain = prompt | llm.with_structured_output(TrendCandidateBatch)
    result = chain.invoke(
        {
            "valid_ids": "\n".join(valid_ids),
            "observations_json": json.dumps(observation_payload(observations), ensure_ascii=False, indent=2),
        }
    )
    batch = result if isinstance(result, TrendCandidateBatch) else TrendCandidateBatch.model_validate(result)
    return batch.trends


def attrs_dict(obs: RawObservation) -> Dict[str, Any]:
    return obs.extracted_attributes if isinstance(obs.extracted_attributes, dict) else {}


def infer_context(obs: RawObservation) -> TrendContext:
    attrs = attrs_dict(obs)
    text = clean_text(obs.raw_text)
    category_values = (
        as_list(attrs.get("product_category"))
        or as_list(attrs.get("product_type"))
        or as_list(attrs.get("garments"))
        or as_list(attrs.get("product_name"))
    )
    seasons = (
        as_list(attrs.get("seasons"))
        or as_list(attrs.get("season"))
        or TEXT_SEASON_RE.findall(text)
        or TEXT_SEASON_RE.findall(clean_text(attrs.get("ranking_list")))
    )
    markets = TEXT_MARKET_RE.findall(text)

    gender = None
    gender_text = normalize_key(" ".join([text, json.dumps(attrs, ensure_ascii=False)]))
    has_women = "women" in gender_text or "womenswear" in gender_text
    has_men = re.search(r"\bmen\b|menswear", gender_text) is not None
    if has_women and has_men:
        gender = "unisex"
    elif has_women:
        gender = "women"
    elif has_men:
        gender = "men"

    return TrendContext(
        category=", ".join(unique_keep_order(category_values)) or None,
        season=", ".join(unique_keep_order(seasons)) or None,
        market=", ".join(unique_keep_order(markets)) or None,
        gender=gender,
    )


def demand_from_obs(obs: RawObservation) -> DemandDirection:
    value = clean_text(obs.demand_direction).casefold()
    if value in get_args(DemandDirection):
        return value  # type: ignore[return-value]
    return "unknown"


def lifecycle_from_demand(demand: DemandDirection, source_count: int) -> LifecycleStage:
    if demand == "fading":
        return "fading"
    if demand == "peaking":
        return "peaking"
    if demand == "rising" and source_count > 1:
        return "rising"
    return "emerging"


def keyword_values(attrs: Dict[str, Any]) -> List[str]:
    return unique_keep_order(
        as_list(attrs.get("styles"))
        + as_list(attrs.get("style"))
        + as_list(attrs.get("consumer_segment"))
        + as_list(attrs.get("keywords"))
        + as_list(attrs.get("fabric_treatment"))
        + as_list(attrs.get("detail"))
    )


def make_candidate(
    trend_type: TrendType,
    label: str,
    obs: RawObservation,
    attributes: TrendAttributes,
) -> Optional[TrendCandidate]:
    label = clean_text(label)
    if not label:
        return None
    return TrendCandidate(
        type=trend_type,
        label=label,
        attributes=attributes,
        context=infer_context(obs),
        lifecycle_stage=lifecycle_from_demand(demand_from_obs(obs), 1),
        demand_direction=demand_from_obs(obs),
        sources=[obs.observation_id],
        descriptor=label,
    )


def build_candidates_deterministically(observations: List[RawObservation]) -> List[TrendCandidate]:
    candidates: List[TrendCandidate] = []

    for obs in observations:
        attrs = attrs_dict(obs)
        keywords = keyword_values(attrs)
        color_families = as_list(attrs.get("color_family"))

        for color in as_list(attrs.get("colors")) + as_list(attrs.get("color")):
            family = color_families[0] if color_families else None
            candidate = make_candidate(
                "color",
                color,
                obs,
                TrendAttributes(colors=[ColorAttribute(name=color, family=family)], keywords=keywords),
            )
            if candidate:
                candidates.append(candidate)

        for pattern in as_list(attrs.get("patterns")) + as_list(attrs.get("pattern")):
            candidate = make_candidate(
                "pattern",
                pattern,
                obs,
                TrendAttributes(pattern=normalize_pattern(pattern), keywords=keywords),
            )
            if candidate:
                candidates.append(candidate)

        for material in as_list(attrs.get("materials")) + as_list(attrs.get("material")) + as_list(attrs.get("fabric")):
            candidate = make_candidate(
                "material",
                material,
                obs,
                TrendAttributes(material=material, keywords=keywords),
            )
            if candidate:
                candidates.append(candidate)

        for silhouette in as_list(attrs.get("silhouettes")) + as_list(attrs.get("silhouette")):
            candidate = make_candidate(
                "silhouette",
                silhouette,
                obs,
                TrendAttributes(silhouette=normalize_silhouette(silhouette), keywords=keywords),
            )
            if candidate:
                candidates.append(candidate)

        for style in as_list(attrs.get("styles")) + as_list(attrs.get("style")):
            candidate = make_candidate(
                "aesthetic",
                style,
                obs,
                TrendAttributes(keywords=unique_keep_order([style] + keywords)),
            )
            if candidate:
                candidates.append(candidate)

        item_values = (
            as_list(attrs.get("garments"))
            + as_list(attrs.get("product_type"))
            + as_list(attrs.get("product_name"))
            + as_list(attrs.get("detail"))
        )
        if obs.raw_type == "product":
            item_values += as_list(attrs.get("trend_name"))
        for item in item_values:
            candidate = make_candidate(
                "item_style",
                item,
                obs,
                TrendAttributes(keywords=keywords),
            )
            if candidate:
                candidates.append(candidate)

    return candidates


def merge_text_field(left: Optional[str], right: Optional[str]) -> Optional[str]:
    values = unique_keep_order(as_list(left) + as_list(right))
    return ", ".join(values) or None


def merge_attributes(left: TrendAttributes, right: TrendAttributes) -> TrendAttributes:
    color_map: Dict[str, ColorAttribute] = {}
    for color in left.colors + right.colors:
        key = normalize_key(color.name)
        if not key:
            continue
        existing = color_map.get(key)
        if existing:
            existing.hex = existing.hex or color.hex
            existing.family = existing.family or color.family
        else:
            color_map[key] = color

    return TrendAttributes(
        colors=list(color_map.values()),
        silhouette=left.silhouette or right.silhouette,
        pattern=left.pattern or right.pattern,
        material=left.material or right.material,
        keywords=unique_keep_order(left.keywords + right.keywords),
    )


def merge_context(left: TrendContext, right: TrendContext) -> TrendContext:
    return TrendContext(
        category=merge_text_field(left.category, right.category),
        season=merge_text_field(left.season, right.season),
        market=merge_text_field(left.market, right.market),
        gender=merge_text_field(left.gender, right.gender),
    )


def merge_candidates(candidates: List[TrendCandidate], obs_by_id: Dict[str, RawObservation]) -> List[TrendCandidate]:
    merged: Dict[str, TrendCandidate] = {}
    for candidate in candidates:
        valid_sources = [source_id for source_id in unique_keep_order(candidate.sources) if source_id in obs_by_id]
        if not valid_sources:
            continue
        label = clean_text(candidate.label)
        if not label:
            continue

        key = f"{candidate.type}|{normalize_key(label)}"
        candidate.sources = valid_sources
        candidate.label = label

        existing = merged.get(key)
        if not existing:
            merged[key] = candidate
            continue

        existing.sources = unique_keep_order(existing.sources + candidate.sources)
        existing.attributes = merge_attributes(existing.attributes, candidate.attributes)
        existing.context = merge_context(existing.context, candidate.context)
        existing.descriptor = existing.descriptor or candidate.descriptor

    return sorted(merged.values(), key=lambda item: (item.type, normalize_key(item.label)))


def parse_datetime(value: str) -> Optional[datetime]:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def combine_demand(source_ids: List[str], obs_by_id: Dict[str, RawObservation]) -> DemandDirection:
    counts: Counter[str] = Counter()
    for source_id in source_ids:
        direction = demand_from_obs(obs_by_id[source_id])
        if direction != "unknown":
            counts[direction] += 1
    if not counts:
        return "unknown"
    return counts.most_common(1)[0][0]  # type: ignore[return-value]


def score_confidence(source_count: int, observation_count: int, demand: DemandDirection, attrs: TrendAttributes) -> int:
    score = 45
    score += min(source_count, 3) * 12
    if observation_count > 1:
        score += 8
    if demand != "unknown":
        score += 15
    if attrs.colors or attrs.silhouette or attrs.pattern or attrs.material or attrs.keywords:
        score += 8
    return max(0, min(100, score))


def descriptor_for(candidate: TrendCandidate) -> str:
    parts = [candidate.label, candidate.type.replace("_", " ")]
    attr_bits = []
    if candidate.attributes.colors:
        attr_bits.append("colors: " + ", ".join(color.name for color in candidate.attributes.colors))
    if candidate.attributes.silhouette:
        attr_bits.append(f"silhouette: {candidate.attributes.silhouette}")
    if candidate.attributes.pattern:
        attr_bits.append(f"pattern: {candidate.attributes.pattern}")
    if candidate.attributes.material:
        attr_bits.append(f"material: {candidate.attributes.material}")
    if candidate.attributes.keywords:
        attr_bits.append("keywords: " + ", ".join(candidate.attributes.keywords[:8]))
    if attr_bits:
        parts.append("; ".join(attr_bits))

    context_bits = [
        candidate.context.category,
        candidate.context.season,
        candidate.context.market,
        candidate.context.gender,
    ]
    context = ", ".join([bit for bit in context_bits if bit])
    if context:
        parts.append(f"context: {context}")
    return ". ".join(parts)


def build_trend_records(
    candidates: List[TrendCandidate],
    observations: List[RawObservation],
) -> List[TrendRecord]:
    obs_by_id = {obs.observation_id: obs for obs in observations}
    merged = merge_candidates(candidates, obs_by_id)
    updated_at = now_utc()
    records: List[TrendRecord] = []

    for candidate in merged:
        source_ids = unique_keep_order(candidate.sources)
        independent_sources = {obs_by_id[source_id].source for source_id in source_ids}
        dates = [
            parsed
            for source_id in source_ids
            if (parsed := parse_datetime(obs_by_id[source_id].captured_date)) is not None
        ]
        first_seen = min(dates).isoformat() if dates else updated_at
        last_seen = max(dates).isoformat() if dates else updated_at
        demand = combine_demand(source_ids, obs_by_id)
        source_count = len(independent_sources)
        lifecycle = lifecycle_from_demand(demand, source_count)
        confidence = score_confidence(source_count, len(source_ids), demand, candidate.attributes)

        records.append(
            TrendRecord(
                trend_id=stable_trend_id(candidate.type, candidate.label),
                type=candidate.type,
                label=candidate.label,
                attributes=candidate.attributes,
                context=candidate.context,
                lifecycle_stage=lifecycle,
                demand_direction=demand,
                confidence_score=confidence,
                source_count=source_count,
                sources=source_ids,
                first_seen=first_seen,
                last_seen=last_seen,
                last_updated=updated_at,
                descriptor=descriptor_for(candidate),
                embedding=[],
                review_status="pending",
            )
        )

    return records


def write_trend_records(records: List[TrendRecord], output_dir: Path) -> Path:
    path = output_dir / "trend_records" / "master_trend_records.json"
    payload = {
        "generated_at": now_utc(),
        "trend_count": len(records),
        "trend_records": [record.model_dump(mode="json") for record in records],
    }
    write_json(path, payload)
    return path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build master raw observations and TrendRecord JSON files.")
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="Use deterministic extracted_attributes only, without calling Gemini.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    observations = load_raw_observations(args.raw_dir)
    raw_path = write_master_raw(observations, args.output_dir)

    if args.no_llm:
        candidates = build_candidates_deterministically(observations)
        mode = "deterministic"
    else:
        try:
            candidates = build_candidates_with_llm(observations, args.model)
            mode = f"LLM structured output ({args.model})"
        except Exception as exc:
            print(f"LLM extraction failed: {exc}")
            print("Falling back to deterministic extracted_attributes grouping.")
            candidates = build_candidates_deterministically(observations)
            mode = "deterministic fallback"

    records = build_trend_records(candidates, observations)
    trend_path = write_trend_records(records, args.output_dir)

    print(f"Loaded {len(observations)} raw observations.")
    print(f"Trend build mode: {mode}.")
    print(f"Wrote raw master: {raw_path}")
    print(f"Wrote trend records: {trend_path}")
    print(f"Built {len(records)} deduplicated trend records.")


if __name__ == "__main__":
    main()
