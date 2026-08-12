"""Recency-weighted trend aggregation (additive; legacy engine untouched).

Window = the most recent up to 3 years present for a brand. The **two most
recent** years are full-weight and drive momentum (fixes the legacy max-vs-min
that would compare 2027 vs 2025); any older year (e.g. 2025 when 2027 exists) is
down-weighted to DECAY in the share/signature numbers only.

Reuses legacy helpers (`look_values`, `_kind`, `_sign`, `_signature`, `_evidence`,
`_palette`) so tagging semantics stay identical to the Prada path.
"""

from __future__ import annotations

from collections import Counter, defaultdict

import trend_engine.aggregate.engine as eng
from trend_engine.config import config
from trend_engine.schema.trends import (
    DimensionAggregate,
    MomentumInfo,
    RankedValue,
    TrendSheet,
)

DIMENSIONS = ["colors", "fabrics", "patterns", "silhouettes", "themes", "details"]
DECAY = 0.25  # weight of a look in a year older than the two most recent


def _weight(look, recent_two: list[int]) -> float:
    return 1.0 if look.year in recent_two else DECAY


def _wpresence(looks, dim: str, recent_two: list[int]) -> Counter:
    c: Counter = Counter()
    for lk in looks:
        w = _weight(lk, recent_two)
        for v in eng.look_values(lk, dim):
            c[v] += w
    return c


def _rawcount(looks, dim: str) -> Counter:
    c: Counter = Counter()
    for lk in looks:
        c.update(eng.look_values(lk, dim))
    return c


def _momentum(value, dim, looks_by_year, size_year, pres_sy, size_sy, recent_two) -> MomentumInfo:
    """Year-over-year on the TWO MOST RECENT years only (older years excluded)."""
    if len(recent_two) < 2:
        return MomentumInfo(yoy_delta=None, kind="steady", trustworthy=False,
                            by_year={}, like_season={})
    prev, cur = recent_two[0], recent_two[1]
    pres_cur = _rawcount(looks_by_year.get(cur, []), dim)
    pres_prev = _rawcount(looks_by_year.get(prev, []), dim)
    sc = pres_cur.get(value, 0) / size_year[cur] if size_year.get(cur) else 0.0
    sp = pres_prev.get(value, 0) / size_year[prev] if size_year.get(prev) else 0.0
    delta = sc - sp
    like: dict[str, float] = {}
    for season in {s for (s, _) in pres_sy}:
        if size_sy.get((season, cur)) and size_sy.get((season, prev)):
            a = pres_sy[(season, cur)].get(value, 0) / size_sy[(season, cur)]
            b = pres_sy[(season, prev)].get(value, 0) / size_sy[(season, prev)]
            like[season] = round(a - b, 4)
    trustworthy = True if not like else all(eng._sign(d) in (eng._sign(delta), 0) for d in like.values())
    return MomentumInfo(yoy_delta=round(delta, 4), kind=eng._kind(sp, sc, delta),
                        trustworthy=trustworthy,
                        by_year={str(cur): round(sc, 4), str(prev): round(sp, 4)}, like_season=like)


def build_dimension(dim, in_scope, years, recent_two) -> DimensionAggregate:
    wtotal = sum(_weight(lk, recent_two) for lk in in_scope)
    wpres = _wpresence(in_scope, dim, recent_two)
    raw = _rawcount(in_scope, dim)                     # unweighted look counts (honesty floor)

    looks_by_year = {y: [lk for lk in in_scope if lk.year == y] for y in years}
    size_year = {y: len(v) for y, v in looks_by_year.items()}

    # weighted per-collection for signature (Counters accept float weights)
    coll_ids = {lk.collection_id for lk in in_scope}
    wpres_coll = {cid: _wpresence([lk for lk in in_scope if lk.collection_id == cid], dim, recent_two)
                  for cid in coll_ids}
    wsize_coll = {cid: sum(_weight(lk, recent_two) for lk in in_scope if lk.collection_id == cid)
                  for cid in coll_ids}

    pres_sy: dict = defaultdict(Counter)
    size_sy: Counter = Counter()
    for lk in in_scope:
        pres_sy[(lk.season, lk.year)].update(eng.look_values(lk, dim))
        size_sy[(lk.season, lk.year)] += 1

    ranked, omitted = [], 0
    for value, wcnt in wpres.most_common():
        if raw[value] < eng.MIN_LOOKS:                # floor on raw look count, not weight
            omitted += 1
            continue
        ranked.append(RankedValue(
            value=value, share=round(wcnt / wtotal, 4) if wtotal else 0.0, looks=raw[value],
            signature_score=eng._signature(value, wpres_coll, wsize_coll),
            momentum=_momentum(value, dim, looks_by_year, size_year, pres_sy, size_sy, recent_two),
            evidence=eng._evidence(in_scope, dim, value),
        ))
    return DimensionAggregate(
        dimension=dim, total_looks=len(in_scope),
        by_year={str(y): size_year.get(y, 0) for y in years}, ranked=ranked,
        palette=eng._palette(in_scope, config.PALETTE_K) if dim == "colors" else [],
        omitted_count=omitted,
    )


def build_sheet(looks, brand, brand_slug, *, report_type="overall") -> TrendSheet:
    """Recency-weighted trend sheet over a brand's most-recent-≤3-years window."""
    years_all = sorted({lk.year for lk in looks})
    window = years_all[-3:]              # most recent up to 3 years
    recent_two = window[-2:]             # full weight + momentum
    in_scope = [lk for lk in looks if lk.year in window]
    coll_ids = {lk.collection_id for lk in in_scope}
    dims = {d: build_dimension(d, in_scope, window, recent_two) for d in DIMENSIONS}
    return TrendSheet(
        brand=brand, brand_slug=brand_slug, report_type=report_type, window_years=window,
        collections=len(coll_ids), total_looks=len(in_scope), dimensions=dims,
        generated={"vocab_ver": config.VOCAB_VER, "agg_ver": f"{config.AGG_VER}-recencyw",
                   "full_weight_years": recent_two, "decay_weight": DECAY},
    )
