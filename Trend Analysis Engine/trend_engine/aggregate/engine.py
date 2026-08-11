"""Aggregation math (Phase 3, Tally). See DESIGN.md §10.

Counting base is presence-per-look (distinct value per look, confidence-gated) so
detail shots never inflate a count. Produces, per dimension: dominance (share),
signature (prevalent AND recurring), momentum (year-over-year + like-season check),
and — for colour — a clustered palette. Honesty floors drop rare values and quiet
small wiggles.
"""
from __future__ import annotations

from collections import Counter, defaultdict

from trend_engine.config import config
from trend_engine.schema.trends import (
    DimensionAggregate,
    EvidenceRef,
    MomentumInfo,
    PaletteSwatch,
    RankedValue,
    TrendSheet,
)

DIMENSIONS = ["colors", "fabrics", "patterns", "silhouettes", "themes", "details"]

CMIN = config.CONFIDENCE_MIN
MIN_LOOKS = config.MIN_LOOKS_TO_RANK
SIG_FLOOR = config.SIGNATURE_BREADTH_FLOOR
MOM_MIN = config.MOMENTUM_MIN

# Words that mark a fabric as belonging to an accessory (shoe/bag/etc.), not a
# garment — used to keep footwear/handbag leather out of the garment-fabric trend.
ACCESSORY_WORDS = (
    "bag", "shoe", "loafer", "mule", "boot", "sandal", "heel", "pump", "sneaker",
    "footwear", "belt", "glove", "clutch", "tote", "sunglass", "hat", "headscarf",
    "jewel", "earring", "brooch", "sock", "tights", "hosiery", "stocking",
)


def _fabric_is_accessory(tag) -> bool:
    text = f"{tag.garment or ''} {tag.evidence or ''}".lower()
    return any(w in text for w in ACCESSORY_WORDS)


def look_values(look, dim: str) -> set[str]:
    """The DISTINCT vocab values a look contributes to a dimension (confidence-gated)."""
    if dim == "colors":
        return {t.family for t in look.tags.colors if t.confidence >= CMIN}
    if dim == "fabrics":
        return {t.value for t in look.tags.fabrics
                if t.confidence >= CMIN and not _fabric_is_accessory(t)}
    return {t.value for t in getattr(look.tags, dim) if t.confidence >= CMIN}


def _presence(looks, dim: str) -> Counter:
    counts: Counter = Counter()
    for lk in looks:
        counts.update(look_values(lk, dim))
    return counts


def _sign(x: float, eps: float = 0.03) -> int:
    return 0 if abs(x) < eps else (1 if x > 0 else -1)


def _kind(share_prev: float, share_cur: float, delta: float) -> str:
    if share_prev < 0.05 and share_cur >= 0.10:
        return "emerging"
    if share_cur < 0.05 and share_prev >= 0.10:
        return "dropped"
    if delta >= MOM_MIN:
        return "rising"
    if delta <= -MOM_MIN:
        return "fading"
    return "steady"


def _momentum(value, pres_year, size_year, pres_sy, size_sy, years) -> MomentumInfo:
    c, p = max(years), min(years)
    sc = pres_year.get(c, Counter()).get(value, 0) / size_year[c] if size_year.get(c) else 0.0
    sp = pres_year.get(p, Counter()).get(value, 0) / size_year[p] if size_year.get(p) else 0.0
    delta = sc - sp
    like: dict[str, float] = {}
    for season in {s for (s, _) in pres_sy}:
        if size_sy.get((season, c)) and size_sy.get((season, p)):
            a = pres_sy[(season, c)].get(value, 0) / size_sy[(season, c)]
            b = pres_sy[(season, p)].get(value, 0) / size_sy[(season, p)]
            like[season] = round(a - b, 4)
    trustworthy = True if not like else all(
        _sign(d) in (_sign(delta), 0) for d in like.values()
    )
    return MomentumInfo(
        yoy_delta=round(delta, 4), kind=_kind(sp, sc, delta), trustworthy=trustworthy,
        by_year={str(c): round(sc, 4), str(p): round(sp, 4)}, like_season=like,
    )


def _signature(value, pres_coll, size_coll) -> float:
    shares = []
    hits = 0
    for cid, pres in pres_coll.items():
        n = size_coll[cid]
        if not n:
            continue
        share = pres.get(value, 0) / n
        shares.append(share)
        if share >= SIG_FLOOR:
            hits += 1
    if not shares:
        return 0.0
    return round((sum(shares) / len(shares)) * (hits / len(shares)), 4)


def _evidence(looks, dim, value, limit=6) -> list[EvidenceRef]:
    out = []
    for lk in looks:
        if value in look_values(lk, dim):
            hexv = None
            if dim == "colors":
                hexv = next((t.hex for t in lk.tags.colors if t.family == value), None)
            img = None
            if lk.images and lk.images.runway and lk.images.runway.kind == "image":
                img = lk.images.runway.url
            out.append(EvidenceRef(collection_id=lk.collection_id, look_number=lk.look_number,
                                   hex=hexv, image=img))
            if len(out) >= limit:
                break
    return out


def _palette(looks, k: int) -> list[PaletteSwatch]:
    import numpy as np
    from coloraide import Color
    from sklearn.cluster import KMeans

    pts, meta = [], []
    for lk in looks:
        for t in lk.tags.colors:
            if not t.hex:
                continue
            try:
                lab = Color(t.hex).convert("lab").coords()
            except Exception:
                continue
            pts.append([float(lab[0]), float(lab[1]), float(lab[2])])
            meta.append((t.hex, t.family, t.pantone, lk.look_id))
    if not pts:
        return []
    x = np.array(pts)
    kk = max(1, min(k, len({tuple(p) for p in pts})))
    km = KMeans(n_clusters=kk, n_init=10, random_state=0).fit(x)
    swatches = []
    for ci in range(kk):
        idxs = [i for i, lbl in enumerate(km.labels_) if lbl == ci]
        if not idxs:
            continue
        cen = km.cluster_centers_[ci]
        best = min(idxs, key=lambda i: float(np.sum((x[i] - cen) ** 2)))
        hx, fam, pan, _ = meta[best]
        looks_in = {meta[i][3] for i in idxs}
        swatches.append(PaletteSwatch(hex=hx, family=fam, share=round(len(looks_in) / len(looks), 4),
                                      pantone=pan))
    swatches.sort(key=lambda s: s.share, reverse=True)
    return swatches


def build_dimension(dim, in_scope, looks_by_year, looks_by_coll, looks_by_sy, years) -> DimensionAggregate:
    n = len(in_scope)
    pres_all = _presence(in_scope, dim)
    pres_year = {y: _presence(v, dim) for y, v in looks_by_year.items()}
    size_year = {y: len(v) for y, v in looks_by_year.items()}
    pres_coll = {cid: _presence(v, dim) for cid, v in looks_by_coll.items()}
    size_coll = {cid: len(v) for cid, v in looks_by_coll.items()}
    pres_sy = {sy: _presence(v, dim) for sy, v in looks_by_sy.items()}
    size_sy = {sy: len(v) for sy, v in looks_by_sy.items()}

    ranked, omitted = [], 0
    for value, cnt in pres_all.most_common():
        if cnt < MIN_LOOKS:
            omitted += 1
            continue
        ranked.append(RankedValue(
            value=value, share=round(cnt / n, 4), looks=cnt,
            signature_score=_signature(value, pres_coll, size_coll),
            momentum=_momentum(value, pres_year, size_year, pres_sy, size_sy, years),
            evidence=_evidence(in_scope, dim, value),
        ))
    return DimensionAggregate(
        dimension=dim, total_looks=n,
        by_year={str(y): size_year.get(y, 0) for y in years},
        ranked=ranked,
        palette=_palette(in_scope, config.PALETTE_K) if dim == "colors" else [],
        omitted_count=omitted,
    )


def build_trend_sheet(collections, looks, scope, brand, brand_slug, report_type) -> TrendSheet:
    in_scope = [lk for lk in looks if scope.matches(lk)]
    years = scope.years
    looks_by_year = {y: [lk for lk in in_scope if lk.year == y] for y in years}
    coll_ids = {lk.collection_id for lk in in_scope}
    looks_by_coll = {cid: [lk for lk in in_scope if lk.collection_id == cid] for cid in coll_ids}
    looks_by_sy: dict = defaultdict(list)
    for lk in in_scope:
        looks_by_sy[(lk.season, lk.year)].append(lk)
    dims = {d: build_dimension(d, in_scope, looks_by_year, looks_by_coll, dict(looks_by_sy), years)
            for d in DIMENSIONS}
    return TrendSheet(
        brand=brand, brand_slug=brand_slug, report_type=report_type, window_years=years,
        collections=len(coll_ids), total_looks=len(in_scope), dimensions=dims,
        generated={"vocab_ver": config.VOCAB_VER, "agg_ver": config.AGG_VER},
    )
