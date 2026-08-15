"""The trend sheet — the output of the Tally stage (Phase 3) and the input the
report reads (Phase 4). One DimensionAggregate per focus area. See DESIGN.md §10.7.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class MomentumInfo(BaseModel):
    yoy_delta: float | None = None          # share(C) - share(C-1)
    kind: str = "steady"                     # emerging | rising | steady | fading | dropped
    trustworthy: bool = True                 # like-season check agrees with the year-over-year sign
    by_year: dict[str, float] = Field(default_factory=dict)      # year -> share
    like_season: dict[str, float] = Field(default_factory=dict)  # season -> delta


class EvidenceRef(BaseModel):
    collection_id: str
    look_number: int
    hex: str | None = None                   # colour only
    image: str | None = None                 # direct image URL, when available


class RankedValue(BaseModel):
    value: str
    share: float                             # fraction of looks featuring it (0-1)
    looks: int
    signature_score: float | None = None     # prevalent AND recurring
    momentum: MomentumInfo | None = None
    evidence: list[EvidenceRef] = Field(default_factory=list)


class PaletteSwatch(BaseModel):
    hex: str
    family: str
    share: float
    pantone: str | None = None


class DimensionAggregate(BaseModel):
    dimension: str
    total_looks: int
    by_year: dict[str, int] = Field(default_factory=dict)
    ranked: list[RankedValue] = Field(default_factory=list)
    palette: list[PaletteSwatch] = Field(default_factory=list)   # colour only
    omitted_count: int = 0                   # rare values hidden by the small-n floor


class TrendReportSection(BaseModel):
    dimension: str
    label: str
    coined_name: str = ""
    narrative: str = ""
    designer_cue: str = ""


class TrendReportPullQuote(BaseModel):
    text: str = ""
    attribution: str = ""


class TrendReport(BaseModel):
    """Narrator's prose output for a TrendSheet (Phase 4, wired live via the
    generate/stream API). Numbers live only in TrendSheet.dimensions — this is
    prose + the fully-rendered magazine HTML, so the two never duplicate the
    same figures and can't drift apart."""
    headline: str = ""
    standfirst: str = ""
    at_a_glance: list[str] = Field(default_factory=list)
    sections: list[TrendReportSection] = Field(default_factory=list)
    pull_quote: TrendReportPullQuote = Field(default_factory=TrendReportPullQuote)
    rendered_html: str = ""
    generated_at: str = ""
    narrate_model: str = ""


class TrendSheet(BaseModel):
    brand: str
    brand_slug: str
    report_type: str
    window_years: list[int]
    collections: int
    total_looks: int
    dimensions: dict[str, DimensionAggregate] = Field(default_factory=dict)
    generated: dict = Field(default_factory=dict)
    report: TrendReport | None = None
