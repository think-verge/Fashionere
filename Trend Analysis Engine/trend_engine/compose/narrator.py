"""Narrator — the LLM writes the report's prose ONLY. It receives the composer's
numbers as read-only context and returns headline/coined names/narrative/cues.
Numbers are never touched (they live in separate fields), so they can't drift.
The pull quote is validated to be a verbatim phrase from a source summary.
See DESIGN.md §11.2.
"""
from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field

from trend_engine.config import config
from trend_engine.schema.report import PullQuote, ReportModel

SYSTEM = """You are the editor of a high-end fashion trend magazine. Write vivid,
confident editorial prose — but grounded strictly in the data given to you.
Rules:
- Use ONLY the numbers provided. Never invent a statistic or a percentage.
- Write in your OWN words. Do NOT copy sentences from the source reviews (they are
  reference for voice and for the single pull quote only).
- For each section, coin a short, memorable trend name (2-4 words).
- narrative: 2-3 sentences telling that section's story, referencing the real leaders
  and what is rising or fading.
- designer_cue: one practical "how to use it" line for a working designer.
- headline: a short, catchy cover title for the whole report; standfirst: one evocative
  sentence under it. at_a_glance: 4-5 punchy noun phrases.
- pull_quote_text: ONE short verbatim quote (max 15 words) copied EXACTLY from the
  provided reviews, with pull_quote_attribution (the designer or house). If nothing
  fits, leave both empty.
- Never describe or name brand logos/monograms."""


class SectionProse(BaseModel):
    dimension: str
    coined_name: str
    narrative: str
    designer_cue: str


class Narration(BaseModel):
    headline: str
    standfirst: str
    at_a_glance: list[str] = Field(default_factory=list)
    sections: list[SectionProse] = Field(default_factory=list)
    pull_quote_text: str = ""
    pull_quote_attribution: str = ""


def _payload(model: ReportModel) -> dict:
    return {
        "brand": model.brand,
        "window": model.window,
        "sections": [
            {
                "dimension": s.dimension,
                "label": s.label,
                "top": [{"value": i.value, "share_pct": round(i.share * 100),
                         "signature": i.signature} for i in s.top],
                "rising": [{"value": i.value, "delta_pct": round((i.delta or 0) * 100)} for i in s.rising],
                "fading": [{"value": i.value, "delta_pct": round((i.delta or 0) * 100)} for i in s.fading],
                "palette": [{"family": p.family, "hex": p.hex, "share_pct": round(p.share * 100)}
                            for p in s.palette],
            }
            for s in model.sections
        ],
    }


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower().replace("“", '"').replace("”", '"')
                  .replace("’", "'")).strip()


def narrate(model: ReportModel, summaries: list[str], *, client=None, model_name: str | None = None) -> ReportModel:
    from google import genai
    from google.genai import types

    if client is None:
        if not config.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY not set — add it to .env.")
        client = genai.Client(api_key=config.GEMINI_API_KEY)

    reviews = "\n\n".join(f"[Review {i + 1}]\n{s}" for i, s in enumerate(summaries) if s)
    contents = (
        f"TREND DATA (the only numbers you may use):\n{json.dumps(_payload(model), ensure_ascii=False)}\n\n"
        f"SOURCE REVIEWS (for voice + the single pull quote; do not copy):\n{reviews}\n\n"
        "Write the magazine report prose as JSON."
    )
    resp = client.models.generate_content(
        model=model_name or config.NARRATE_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            temperature=0.5,
            system_instruction=SYSTEM,
            response_mime_type="application/json",
            response_schema=Narration,
        ),
    )
    nar = resp.parsed or Narration.model_validate_json(resp.text)

    model.headline = nar.headline
    model.standfirst = nar.standfirst
    model.at_a_glance = nar.at_a_glance
    prose = {p.dimension: p for p in nar.sections}
    for sec in model.sections:
        p = prose.get(sec.dimension)
        if p:
            sec.coined_name, sec.narrative, sec.designer_cue = p.coined_name, p.narrative, p.designer_cue

    # pull quote must be a verbatim phrase from the reviews (grounding)
    if nar.pull_quote_text and _norm(nar.pull_quote_text) in _norm(reviews):
        model.pull_quote = PullQuote(text=nar.pull_quote_text.strip('"“” '),
                                     attribution=nar.pull_quote_attribution)
    return model
