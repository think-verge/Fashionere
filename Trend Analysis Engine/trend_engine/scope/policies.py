"""Scope policies. A policy resolves (brand, today) -> a ScopeFilter that both
builds a Mongo query and can filter looks in memory. The dynamic {C-1, C}
window lives here as a policy, never hardcoded. See DESIGN.md §9.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass
class ScopeFilter:
    brand_slug: str
    kind: str
    years: list[int]

    def mongo(self) -> dict:
        return {"brand_slug": self.brand_slug, "year": {"$in": self.years}}

    def matches(self, look) -> bool:
        return look.brand_slug == self.brand_slug and look.year in self.years


def overall(brand_slug: str, *, today: date | None = None,
            available_years: list[int] | None = None) -> ScopeFilter:
    """Rolling window {C-1, C} where C is the current year. If the brand has no
    collections in that window, fall back to its two most recent years."""
    c = (today or date.today()).year
    years = [c - 1, c]
    if available_years:
        avail = sorted(set(available_years))
        if not any(y in avail for y in years):
            years = avail[-2:]
    return ScopeFilter(brand_slug=brand_slug, kind="overall", years=years)


POLICIES = {"overall": overall}


def resolve(report_type: str, brand_slug: str, *, today: date | None = None,
            available_years: list[int] | None = None) -> ScopeFilter:
    try:
        policy = POLICIES[report_type]
    except KeyError:
        raise KeyError(f"Unknown report_type '{report_type}'. Known: {list(POLICIES)}")
    return policy(brand_slug, today=today, available_years=available_years)
