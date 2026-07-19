"""
build_trends_from_raw.py
========================

Turn all RawObservations (Raw_data/*.json from the 4 scrapers) into deduplicated
TrendRecord objects via an LLM merge pass.

Strategy
--------
1. Load every observation, dedupe by observation_id, partition by `group`.
   (`group` maps 1:1 to trend `type`; brand is its own type here.)
2. For each group, ONE Gemini 2.5 Pro call merges same-trend observations into
   candidates, names them, normalizes attributes, writes a descriptor, and cites
   the observation_ids it merged. The LLM only does the fuzzy/semantic work.
3. Python computes every trustworthy field from the cited observations:
   source_count (INDEPENDENT sources), first/last_seen, combined demand_direction,
   lifecycle_stage, confidence_score, stable trend_id. Provenance is validated —
   any cited id that isn't real is dropped.
4. Write Master_data/trend_records/trend_records.json.

Standalone: defines its own schema; does not import build_trend_master.

.env (same folder):  GOOGLE_API_KEY=your_key_here
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union, get_args

from dotenv import load_dotenv
from pydantic import BaseModel, Field

SCRIPT_DIR = Path(__file__).resolve().parent
RAW_DIR = SCRIPT_DIR / "Raw_data"
MASTER_RAW_DIR = SCRIPT_DIR / "Master_data" / "raw_objects"
TREND_DIR = SCRIPT_DIR / "Master_data" / "trend_records"
GEMINI_MODEL = "gemini-2.5-pro"

# India Standard Time (UTC+05:30, no DST) — every timestamp + filename uses this.
IST = timezone(timedelta(hours=5, minutes=30))

load_dotenv(SCRIPT_DIR / ".env")

# --------------------------------------------------------------------------- #
# Vocabularies
# --------------------------------------------------------------------------- #
TrendType = Literal[
    "color", "silhouette", "pattern", "material", "aesthetic", "item_style", "brand"
]
DemandDirection = Literal["rising", "peaking", "fading", "unknown"]
LifecycleStage = Literal["emerging", "rising", "peaking", "fading"]
ReviewStatus = Literal["approved", "pending"]

# `group` value on each observation -> the attribute key holding its headline value.
HEADLINE_KEY: Dict[str, str] = {
    "color": "color",
    "silhouette": "silhouette",
    "pattern": "pattern",
    "material": "material",
    "item_style": "product_type",
    "aesthetic": "style",
    "brand": "brand",
}

# Per-type instruction for how the LLM should fill `attributes`.
ATTR_HINT: Dict[str, str] = {
    "color": "Set colors=[{name, hex (ONLY if a literal hex is present), family}]. keywords = mood words.",
    "silhouette": "Set silhouette to the canonical shape (e.g. wide-leg, oversized). keywords = related terms.",
    "pattern": "Set pattern to the print type (e.g. floral, leopard, pinstripe). keywords = related terms.",
    "material": "Set material to the fabric/texture (e.g. suede, sheer). keywords = related terms.",
    "aesthetic": "Leave structured fields null. keywords = the mood/aesthetic words.",
    "item_style": "The label IS the garment/key item. Leave structured fields null. keywords = descriptors.",
    "brand": "The label IS the brand name. Leave structured fields null. keywords = associated products / aesthetic.",
}


# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #
class ColorAttribute(BaseModel):
    name: str
    hex: Optional[str] = None
    family: Optional[str] = None


class TrendAttributes(BaseModel):
    colors: List[ColorAttribute] = Field(default_factory=list)
    silhouette: Optional[str] = None
    pattern: Optional[str] = None
    material: Optional[str] = None
    keywords: List[str] = Field(default_factory=list)


class TrendContext(BaseModel):
    category: Optional[str] = None
    season: Optional[str] = None
    market: Optional[str] = None
    gender: Optional[str] = None


class TrendCandidate(BaseModel):
    """What the LLM returns per group. No scores/dates — those are computed."""

    label: str
    attributes: TrendAttributes = Field(default_factory=TrendAttributes)
    context: TrendContext = Field(default_factory=TrendContext)
    descriptor: str = ""
    sources: List[str] = Field(default_factory=list)  # observation_ids merged


class TrendCandidateBatch(BaseModel):
    trends: List[TrendCandidate] = Field(default_factory=list)


class TrendRecord(BaseModel):
    trend_id: str
    type: TrendType
    group: TrendType   # same canonical value as `type`; the unifying key across the pipeline
    label: str
    attributes: Dict[str, Any]   # group-specific: only the fields relevant to this type
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


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def now_ist() -> str:
    return datetime.now(IST).isoformat()


def ist_file_stamp() -> str:
    return datetime.now(IST).strftime("%Y%m%d_%H%M%S")


def is_na(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip().upper() in {"", "NA", "N/A", "NONE", "NULL"}
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) == 0
    return False


def normalize_key(value: str) -> str:
    value = value.casefold().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def stable_trend_id(trend_type: str, label: str) -> str:
    digest = hashlib.sha1(f"{trend_type}|{normalize_key(label)}".encode("utf-8")).hexdigest()[:12]
    return f"trend_{digest}"


def parse_dt(value: str) -> Optional[datetime]:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(IST)
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# Load + partition
# --------------------------------------------------------------------------- #
def collect(value: Any, out: List[Dict[str, Any]]) -> None:
    if isinstance(value, dict):
        if {"observation_id", "raw_text"}.issubset(value):
            out.append(value)
            return
        if isinstance(value.get("observations"), list):
            for item in value["observations"]:
                collect(item, out)
            return
        for nested in value.values():
            collect(nested, out)
    elif isinstance(value, list):
        for item in value:
            collect(item, out)


def load_observations(raw_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Return {observation_id: observation} deduped across all Raw_data files."""
    raw: List[Dict[str, Any]] = []
    for path in sorted(raw_dir.glob("*.json")):
        with path.open("r", encoding="utf-8") as f:
            collect(json.load(f), raw)
    deduped: Dict[str, Dict[str, Any]] = {}
    for obs in raw:
        oid = obs.get("observation_id")
        if oid and oid not in deduped:
            deduped[oid] = obs
    return deduped


def partition_by_group(obs_by_id: Dict[str, Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    buckets: Dict[str, List[Dict[str, Any]]] = {t: [] for t in get_args(TrendType)}
    for obs in obs_by_id.values():
        group = obs.get("group")
        if group in buckets:
            buckets[group].append(obs)
    return buckets


def headline_of(obs: Dict[str, Any]) -> str:
    attrs = obs.get("extracted_attributes")
    if isinstance(attrs, dict):
        key = HEADLINE_KEY.get(obs.get("group", ""), "")
        val = attrs.get(key)
        if not is_na(val):
            return str(val)
    return ""


# --------------------------------------------------------------------------- #
# LLM merge pass (one call per group)
# --------------------------------------------------------------------------- #
def _build_prompt(trend_type: str):
    from langchain_core.prompts import ChatPromptTemplate

    system = (
        "You merge raw fashion observations of a SINGLE trend type into deduplicated "
        f"trend candidates. Every observation below is type '{trend_type}'.\n"
        "Merge observations describing the SAME trend (including spelling/wording "
        "variants and close synonyms) into ONE candidate. Do NOT merge clearly "
        "different trends.\n\n"
        "For each candidate:\n"
        f"- attributes: {ATTR_HINT[trend_type]}\n"
        "- label: the clean canonical name.\n"
        "- context: category/season/market/gender ONLY if explicitly supported, else null.\n"
        "- descriptor: ONE clean sentence summarizing the trend, suitable for generating "
        "a moodboard image.\n"
        "- sources: the observation_ids you merged. Cite ONLY ids from the provided list.\n\n"
        "STRICT: use only facts present in the observations; never invent."
    )
    # Escape any literal braces in the system text (e.g. the color attr hint) so the
    # template engine doesn't read them as variables. Real variables live only in the
    # human message below.
    system = system.replace("{", "{{").replace("}", "}}")
    return ChatPromptTemplate.from_messages(
        [
            ("system", system),
            (
                "human",
                "Valid observation_ids:\n{valid_ids}\n\n"
                "Observations:\n{rows}\n\n"
                "Return deduplicated trend candidates with provenance.",
            ),
        ]
    )


def build_chain(trend_type: str, api_key: str):
    from langchain_google_genai import ChatGoogleGenerativeAI

    llm = ChatGoogleGenerativeAI(model=GEMINI_MODEL, temperature=0, google_api_key=api_key)
    return _build_prompt(trend_type) | llm.with_structured_output(TrendCandidateBatch)


def merge_bucket(trend_type: str, observations: List[Dict[str, Any]], api_key: str) -> List[TrendCandidate]:
    if not observations:
        return []
    rows = [
        {
            "observation_id": o.get("observation_id"),
            "headline": headline_of(o),
            "attributes": o.get("extracted_attributes"),
            "demand_direction": o.get("demand_direction"),
            "source": o.get("source"),
            "raw_text": o.get("raw_text"),
        }
        for o in observations
    ]
    valid_ids = [o.get("observation_id") for o in observations]
    chain = build_chain(trend_type, api_key)
    try:
        result = chain.invoke(
            {
                "valid_ids": "\n".join(valid_ids),
                "rows": json.dumps(rows, ensure_ascii=False, indent=2),
            }
        )
        batch = result if isinstance(result, TrendCandidateBatch) else TrendCandidateBatch.model_validate(result)
        return batch.trends
    except Exception as exc:  # noqa: BLE001
        print(f"  merge failed for '{trend_type}' ({exc}); skipping bucket")
        return []


# --------------------------------------------------------------------------- #
# Python: compute the trustworthy fields from cited observations
# --------------------------------------------------------------------------- #
def combine_demand(obs_list: List[Dict[str, Any]]) -> DemandDirection:
    counts: Counter[str] = Counter()
    for obs in obs_list:
        d = str(obs.get("demand_direction", "unknown")).strip().casefold()
        if d in get_args(DemandDirection) and d != "unknown":
            counts[d] += 1
    return counts.most_common(1)[0][0] if counts else "unknown"  # type: ignore[return-value]


def lifecycle_from(demand: DemandDirection, source_count: int) -> LifecycleStage:
    if demand == "fading":
        return "fading"
    if demand == "peaking":
        return "peaking"
    if demand == "rising":
        return "rising" if source_count > 1 else "emerging"
    return "emerging"


def score_confidence(source_count: int, demand: DemandDirection, has_attrs: bool) -> int:
    score = 30
    score += min(source_count, 4) * 15      # 1->45  2->60  3->75  4+->90
    if demand != "unknown":
        score += 10
    if has_attrs:
        score += 5
    return max(0, min(100, score))


# Which structured attribute field(s) belong to each trend type. `keywords` is added
# to every type. Mirrors the per-group raw schema: a color trend carries colours, a
# silhouette trend carries silhouette — never each other's empty fields.
TREND_ATTR_FIELDS: Dict[str, List[str]] = {
    "color": ["colors"],
    "silhouette": ["silhouette"],
    "pattern": ["pattern"],
    "material": ["material"],
    "aesthetic": [],
    "item_style": [],
    "brand": [],
}


def project_trend_attributes(trend_type: str, attrs: TrendAttributes) -> Dict[str, Any]:
    """Keep only the attribute fields relevant to this trend's type (+ keywords)."""
    data = attrs.model_dump()
    out: Dict[str, Any] = {field: data.get(field) for field in TREND_ATTR_FIELDS.get(trend_type, [])}
    out["keywords"] = data.get("keywords") or []
    return out


def has_attributes(attrs: Dict[str, Any]) -> bool:
    return any(bool(v) for v in attrs.values())


def finalize(
    trend_type: str,
    candidate: TrendCandidate,
    obs_by_id: Dict[str, Dict[str, Any]],
    updated_at: str,
) -> Optional[TrendRecord]:
    """Compute provenance-derived fields. Returns None if no valid sources."""
    cited = [obs_by_id[i] for i in dict.fromkeys(candidate.sources) if i in obs_by_id]
    if not cited or not candidate.label.strip():
        return None

    source_ids = [o["observation_id"] for o in cited]
    independent = {o.get("source") for o in cited}
    source_count = len(independent)
    dates = [d for o in cited if (d := parse_dt(o.get("captured_date", ""))) is not None]
    demand = combine_demand(cited)
    attributes = project_trend_attributes(trend_type, candidate.attributes)

    return TrendRecord(
        trend_id=stable_trend_id(trend_type, candidate.label),
        type=trend_type,  # type: ignore[arg-type]
        group=trend_type,  # type: ignore[arg-type]
        label=candidate.label.strip(),
        attributes=attributes,
        context=candidate.context,
        lifecycle_stage=lifecycle_from(demand, source_count),
        demand_direction=demand,
        confidence_score=score_confidence(source_count, demand, has_attributes(attributes)),
        source_count=source_count,
        sources=source_ids,
        first_seen=min(dates).isoformat() if dates else updated_at,
        last_seen=max(dates).isoformat() if dates else updated_at,
        last_updated=updated_at,
        descriptor=candidate.descriptor.strip() or candidate.label.strip(),
        embedding=[],
        review_status="pending",
    )


def dedupe_records(records: List[TrendRecord], obs_by_id: Dict[str, Dict[str, Any]], updated_at: str) -> List[TrendRecord]:
    """Merge any records that collapsed to the same trend_id (union their sources)."""
    by_id: Dict[str, TrendRecord] = {}
    for rec in records:
        existing = by_id.get(rec.trend_id)
        if not existing:
            by_id[rec.trend_id] = rec
            continue
        merged_sources = list(dict.fromkeys(existing.sources + rec.sources))
        cited = [obs_by_id[i] for i in merged_sources if i in obs_by_id]
        existing.sources = merged_sources
        existing.source_count = len({o.get("source") for o in cited})
        existing.demand_direction = combine_demand(cited)
        existing.lifecycle_stage = lifecycle_from(existing.demand_direction, existing.source_count)
        existing.confidence_score = score_confidence(
            existing.source_count, existing.demand_direction, has_attributes(existing.attributes)
        )
        existing.last_updated = updated_at
    return sorted(by_id.values(), key=lambda r: (r.type, normalize_key(r.label)))


# --------------------------------------------------------------------------- #
# Orchestrate
# --------------------------------------------------------------------------- #
def build_trends(obs_by_id: Dict[str, Dict[str, Any]], updated_at: str, api_key: str) -> List[TrendRecord]:
    buckets = partition_by_group(obs_by_id)
    print(f"Loaded {len(obs_by_id)} observations across {sum(1 for v in buckets.values() if v)} groups.")

    records: List[TrendRecord] = []
    for trend_type, observations in buckets.items():
        if not observations:
            continue
        print(f"  merging {len(observations):>3} '{trend_type}' observations ...")
        candidates = merge_bucket(trend_type, observations, api_key)
        for cand in candidates:
            rec = finalize(trend_type, cand, obs_by_id, updated_at)
            if rec:
                records.append(rec)

    return dedupe_records(records, obs_by_id, updated_at)


def save_master_raw(obs_by_id: Dict[str, Dict[str, Any]], stamp: str) -> Path:
    """Snapshot the deduped union of all Raw_data observations (IST-stamped)."""
    path = MASTER_RAW_DIR / f"master_raw_object_{stamp}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": now_ist(),
        "observation_count": len(obs_by_id),
        "observations": list(obs_by_id.values()),
    }
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    return path


def save_trends(records: List[TrendRecord], stamp: str) -> Path:
    path = TREND_DIR / f"trend_records_{stamp}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": now_ist(),
        "trend_count": len(records),
        "trend_records": [r.model_dump(mode="json") for r in records],
    }
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    return path


def main() -> None:
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("Set GOOGLE_API_KEY or GEMINI_API_KEY in .env to run the merge pass.")

    stamp = ist_file_stamp()          # one shared IST stamp for both files this run
    updated_at = now_ist()

    obs_by_id = load_observations(RAW_DIR)
    raw_path = save_master_raw(obs_by_id, stamp)
    print(f"Wrote master raw objects -> {raw_path}")

    records = build_trends(obs_by_id, updated_at, api_key)
    trend_path = save_trends(records, stamp)

    by_type = Counter(r.type for r in records)
    print(f"\nBuilt {len(records)} trend records: {dict(by_type)}")
    print(f"Wrote {trend_path}")


if __name__ == "__main__":
    main()
