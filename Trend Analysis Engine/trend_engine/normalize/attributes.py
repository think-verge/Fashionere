"""AI attribute normalizer (Phase 2b) — one Gemini call per look maps the
free-text attributes to vocabulary-constrained tags, enforcing the grounding
rules from DESIGN.md §7.2:

  1. closed vocabulary (value must be a vocab id, else "__unmapped__")
  2. evidence-first (every tag cites a phrase found in the look text)
  3. no brand marks tagged as patterns
  4. descriptive/mood keywords routed to vibe, not counted
  5. no inference beyond the text; colors handled elsewhere

`build_prompt` needs no API key, so prompt construction is verifiable offline;
only `extract_look` calls Gemini.
"""
from __future__ import annotations

import re

from trend_engine.config import config
from trend_engine.registries import vocabulary as vocab
from trend_engine.schema.extraction import LookExtraction
from trend_engine.schema.look import Look
from trend_engine.schema.tags import (
    DetailTag,
    FabricTag,
    PatternTag,
    SilhouetteTag,
    ThemeTag,
)

SYSTEM_INSTRUCTION = """You are a fashion-runway tagger. Convert ONE look's text into
structured tags, following these rules exactly:
1. CLOSED VOCABULARY: every `value` must be an id from the ALLOWED list for that
   dimension. If nothing fits, set value to "__unmapped__" and add the phrase to `unmapped`.
2. EVIDENCE: for every tag, quote in `evidence` the exact phrase from the look text that
   supports it. Never tag anything not stated in the text.
3. NO BRAND MARKS: never tag a logo, monogram, or house crest (e.g. a brand triangle or
   crest) as a pattern.
4. ROUTE KEYWORDS: send descriptive/mood keywords that are not concrete attributes to
   `routed_to_vibe`.
5. NO GUESSING: if unsure, lower `confidence` or use "__unmapped__". Do not infer beyond the
   text. Do NOT tag colors — colors are handled separately."""


def _raw_text(look: Look) -> str:
    parts = [
        look.raw.description or "",
        f"Fabric: {look.raw.fabric_text or ''}",
        f"Theme: {look.raw.theme_text or ''}",
        "Keywords: " + ", ".join(look.raw.keywords or []),
    ]
    for ds in look.raw.detail_shots:
        parts.append(
            f"Detail: {ds.description or ''} | fabric: {ds.fabric_text or ''} "
            f"| theme: {ds.theme_text or ''} | kw: {', '.join(ds.keywords or [])}"
        )
    return "\n".join(p for p in parts if p.strip())


def build_prompt(look: Look) -> str:
    allowed = "\n\n".join(
        f"{d.upper()} — allowed ids:\n{vocab.prompt_block(d)}" for d in vocab.DIMENSIONS
    )
    return (
        f"LOOK TEXT:\n{_raw_text(look)}\n\n"
        f"ALLOWED VOCABULARY (choose ids ONLY from these):\n{allowed}\n\n"
        "Return JSON with this look's fabrics, patterns, silhouettes, themes, details, "
        "routed_to_vibe, and unmapped."
    )


def _client():
    from google import genai
    if not config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set — add it to .env.")
    return genai.Client(api_key=config.GEMINI_API_KEY)


def extract_look(look: Look, *, client=None, model: str | None = None) -> LookExtraction:
    from google.genai import types
    client = client or _client()
    resp = client.models.generate_content(
        model=model or config.NORMALIZE_MODEL,
        contents=build_prompt(look),
        config=types.GenerateContentConfig(
            temperature=0.0,
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=LookExtraction,
            thinking_config=types.ThinkingConfig(thinking_budget=0),  # bulk classification: no thinking
        ),
    )
    out = resp.parsed
    if out is None:  # fall back to parsing the raw JSON text
        out = LookExtraction.model_validate_json(resp.text)
    return out


def _evidence_found(evidence: str | None, haystack_lower: str) -> bool:
    """Grounding check: the evidence phrase must appear verbatim, or ALL of its
    significant (>3-char) words must be present — so a stray matching word can't
    smuggle in an unsupported tag."""
    e = (evidence or "").strip().lower()
    if not e:
        return False
    if e in haystack_lower:
        return True
    words = [w for w in re.split(r"[\s/,\-]+", e) if len(w) > 3]
    return bool(words) and all(w in haystack_lower for w in words)


def _dedup(tags: list) -> list:
    """Collapse repeated values within one look (keep first — it carries evidence)."""
    seen, out = set(), []
    for t in tags:
        if t.value in seen:
            continue
        seen.add(t.value)
        out.append(t)
    return out


def map_to_tags(look: Look, ex: LookExtraction, *, conf_min: float | None = None) -> list:
    """Map an LLM extraction onto canonical tags, dropping anything that fails the
    grounding checks (vocab membership, confidence, evidence-in-text). Returns the
    unmapped log entries."""
    cmin = config.CONFIDENCE_MIN if conf_min is None else conf_min
    hay = _raw_text(look).lower()

    def keep(value: str, dim: str, evidence: str, conf: float) -> bool:
        return (
            value != "__unmapped__"
            and value in vocab.allowed_ids(dim)
            and conf >= cmin
            and _evidence_found(evidence, hay)
        )

    look.tags.fabrics = _dedup([
        FabricTag(value=f.value, material=f.material, garment=f.garment, treatment=f.treatment,
                  evidence=f.evidence, origin="look", confidence=f.confidence)
        for f in ex.fabrics if keep(f.value, "fabrics", f.evidence, f.confidence)
    ])
    look.tags.patterns = _dedup([
        PatternTag(value=p.value, motif=p.motif, evidence=p.evidence, origin="look",
                   confidence=p.confidence)
        for p in ex.patterns if keep(p.value, "patterns", p.evidence, p.confidence)
    ])
    look.tags.silhouettes = _dedup([
        SilhouetteTag(value=s.value, garment=s.garment, fit=s.fit, evidence=s.evidence,
                      origin="look", confidence=s.confidence)
        for s in ex.silhouettes if keep(s.value, "silhouettes", s.evidence, s.confidence)
    ])
    look.tags.themes = _dedup([
        ThemeTag(value=t.value, evidence=t.evidence, origin="look", confidence=t.confidence)
        for t in ex.themes if keep(t.value, "themes", t.evidence, t.confidence)
    ])
    look.tags.details = _dedup([
        DetailTag(value=d.value, type=d.type, evidence=d.evidence, origin="look",
                  confidence=d.confidence)
        for d in ex.details if keep(d.value, "details", d.evidence, d.confidence)
    ])
    if ex.routed_to_vibe:
        look.vibe_phrases = list(dict.fromkeys((look.vibe_phrases or []) + ex.routed_to_vibe))
    return list(ex.unmapped)


def normalize_attributes(look: Look, *, client=None, model: str | None = None) -> list:
    return map_to_tags(look, extract_look(look, client=client, model=model))
