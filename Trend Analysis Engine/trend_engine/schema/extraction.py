"""The shape the AI attribute-normalizer must return for one look (Phase 2b).

This is the LLM-facing contract, kept separate from the canonical `tags`
models: the normalizer validates the LLM output against these, enforces the
grounding rules (every `value` must be a vocab id or "__unmapped__"; every tag
must cite an `evidence` phrase found in the source), then maps them to the
canonical FabricTag/PatternTag/... adding `origin` + confidence. See DESIGN.md §7.2.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class LLMFabric(BaseModel):
    value: str                       # vocab id or "__unmapped__"
    material: str | None = None
    garment: str | None = None
    treatment: str | None = None
    evidence: str
    confidence: float = 0.7


class LLMPattern(BaseModel):
    value: str
    motif: str | None = None
    evidence: str
    confidence: float = 0.7


class LLMSilhouette(BaseModel):
    value: str
    garment: str | None = None
    fit: str | None = None
    evidence: str
    confidence: float = 0.7


class LLMTheme(BaseModel):
    value: str
    evidence: str
    confidence: float = 0.7


class LLMDetail(BaseModel):
    value: str
    type: str | None = None
    evidence: str
    confidence: float = 0.7


class Unmapped(BaseModel):
    dimension: str                   # fabrics | patterns | silhouettes | themes | details
    raw_phrase: str


class LookExtraction(BaseModel):
    """One LLM call per look returns exactly this."""
    fabrics: list[LLMFabric] = Field(default_factory=list)
    patterns: list[LLMPattern] = Field(default_factory=list)
    silhouettes: list[LLMSilhouette] = Field(default_factory=list)
    themes: list[LLMTheme] = Field(default_factory=list)
    details: list[LLMDetail] = Field(default_factory=list)
    routed_to_vibe: list[str] = Field(default_factory=list)
    unmapped: list[Unmapped] = Field(default_factory=list)
