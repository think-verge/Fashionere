"""The report model — the endpoint's structured response and the renderer's input.
Composer fills the numeric/evidence fields; narrator fills only the prose fields
(headline, coined_name, narrative, designer_cue, pull_quote). See DESIGN.md §11.1.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from trend_engine.schema.trends import EvidenceRef, PaletteSwatch


class ReportRankedItem(BaseModel):
    value: str
    share: float
    signature: float | None = None
    kind: str | None = None          # momentum kind
    delta: float | None = None       # year-over-year delta
    trustworthy: bool = True


class CollageImage(BaseModel):
    image: str
    value: str
    collection_id: str
    look_number: int


class ReportSection(BaseModel):
    dimension: str
    label: str
    # prose (narrator)
    coined_name: str = ""
    narrative: str = ""
    designer_cue: str = ""
    # data (composer)
    top: list[ReportRankedItem] = Field(default_factory=list)
    rising: list[ReportRankedItem] = Field(default_factory=list)
    fading: list[ReportRankedItem] = Field(default_factory=list)
    palette: list[PaletteSwatch] = Field(default_factory=list)
    evidence: list[EvidenceRef] = Field(default_factory=list)
    collage: list["CollageImage"] = Field(default_factory=list)  # weighted image picks


class PullQuote(BaseModel):
    text: str = ""
    attribution: str = ""


class ReportModel(BaseModel):
    brand: str
    report_type: str
    window: dict = Field(default_factory=dict)
    # prose (narrator)
    headline: str = ""
    standfirst: str = ""
    at_a_glance: list[str] = Field(default_factory=list)
    pull_quote: PullQuote = Field(default_factory=PullQuote)
    # data (composer)
    sections: list[ReportSection] = Field(default_factory=list)
    provenance: dict = Field(default_factory=dict)
