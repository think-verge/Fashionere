"""On-demand comparison compute — brand-vs-brand and season-wide.

RUNTIME, not stored: the expensive building blocks (per-brand 'overall' sheets and
per-collection sheets) are already cached in `trend_sheets`. These functions read
the relevant ones for the caller's params and compute the comparison live — pure
read + arithmetic, no LLM. Return plain JSON-ready dicts the dashboard renders.

    compare_brands(sheets_coll, "prada", "chanel")
    season_report(sheets_coll, 2026, "Fall", "rtw")
    brand_options(sheets_coll) / season_options(sheets_coll)   # to drive dropdowns
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from statistics import mean, pstdev

from pydantic import BaseModel, Field

from trend_engine.config import config

DIMENSIONS = ["colors", "fabrics", "patterns", "silhouettes", "themes", "details"]
SHARED_MIN = 0.40      # a value "shared" if both brands are at least this
DISTINCT_GAP = 0.25    # a value "distinctive" to a brand if it leads by this many share-points


def _cat(collection_id: str) -> str:
    for c in ("couture", "rtw", "resort", "pre"):
        if c in collection_id:
            return "pre-fall" if c == "pre" else c
    return "other"


def _ranked_map(sheet: dict, dim: str) -> dict:
    return {rv["value"]: rv for rv in (sheet.get("dimensions", {}).get(dim, {}).get("ranked", []) or [])}


def _cosine_divergence(a: dict, b: dict) -> float:
    """1 - cosine similarity of the two share vectors over the union of values (0=identical,1=disjoint)."""
    keys = set(a) | set(b)
    if not keys:
        return 0.0
    av = [a.get(k, 0.0) for k in keys]; bv = [b.get(k, 0.0) for k in keys]
    dot = sum(x * y for x, y in zip(av, bv))
    na = math.sqrt(sum(x * x for x in av)); nb = math.sqrt(sum(y * y for y in bv))
    if na == 0 or nb == 0:
        return 1.0
    return round(1 - dot / (na * nb), 3)


def _mom(rv: dict | None):
    m = (rv or {}).get("momentum") or {}
    return m.get("kind"), m.get("yoy_delta")


# --- brand vs brand ----------------------------------------------------------
def compare_brands(sheets_coll, a_slug: str, b_slug: str, *, top_n: int = 8) -> dict:
    sa = sheets_coll.find_one({"_id": a_slug, "report_type": "overall"})
    sb = sheets_coll.find_one({"_id": b_slug, "report_type": "overall"})
    if not sa or not sb:
        missing = [s for s, d in [(a_slug, sa), (b_slug, sb)] if not d]
        raise ValueError(f"no brand sheet for: {', '.join(missing)}")

    dims = {}
    for dim in DIMENSIONS:
        amap, bmap = _ranked_map(sa, dim), _ranked_map(sb, dim)
        a_shares = {v: rv.get("share", 0.0) for v, rv in amap.items()}
        b_shares = {v: rv.get("share", 0.0) for v, rv in bmap.items()}
        values = set(amap) | set(bmap)

        rows = []
        for v in values:
            ash, bsh = a_shares.get(v, 0.0), b_shares.get(v, 0.0)
            ak, ay = _mom(amap.get(v)); bk, by = _mom(bmap.get(v))
            rows.append({"value": v, "a_share": ash, "b_share": bsh,
                         "delta": round(ash - bsh, 4), "a_momentum": ak, "b_momentum": bk})
        rows.sort(key=lambda r: max(r["a_share"], r["b_share"]), reverse=True)

        shared = sorted([{"value": r["value"], "a_share": r["a_share"], "b_share": r["b_share"]}
                         for r in rows if min(r["a_share"], r["b_share"]) >= SHARED_MIN],
                        key=lambda r: min(r["a_share"], r["b_share"]), reverse=True)
        dist_a = [{"value": r["value"], "a_share": r["a_share"], "b_share": r["b_share"], "gap": r["delta"]}
                  for r in rows if r["delta"] >= DISTINCT_GAP][:top_n]
        dist_b = [{"value": r["value"], "a_share": r["a_share"], "b_share": r["b_share"], "gap": round(-r["delta"], 4)}
                  for r in rows if r["delta"] <= -DISTINCT_GAP][:top_n]
        # momentum divergence: both have a direction and they disagree (one up, one down)
        momentum = []
        for r in rows[:top_n]:
            ak, bk = r["a_momentum"], r["b_momentum"]
            if ak and bk and ak != bk and "steady" not in (ak, bk):
                momentum.append({"value": r["value"], "a_kind": ak, "b_kind": bk, "note": "diverging"})
            elif ak and bk and ak == bk and ak != "steady":
                momentum.append({"value": r["value"], "a_kind": ak, "b_kind": bk, "note": "converging"})

        dims[dim] = {
            "divergence_score": _cosine_divergence(a_shares, b_shares),
            "table": rows[:top_n], "shared": shared,
            "distinctive_a": dist_a, "distinctive_b": dist_b, "momentum": momentum,
        }

    return {
        "brand_a": {"slug": a_slug, "name": sa.get("brand"), "window_years": sa.get("window_years"),
                    "total_looks": sa.get("total_looks")},
        "brand_b": {"slug": b_slug, "name": sb.get("brand"), "window_years": sb.get("window_years"),
                    "total_looks": sb.get("total_looks")},
        "dimensions": dims,
        "headline": _brand_headline(sa.get("brand"), sb.get("brand"), dims["colors"]),
    }


def _brand_headline(a_name, b_name, colors) -> str:
    shared = colors["shared"][0]["value"] if colors["shared"] else None
    da = colors["distinctive_a"][0]["value"] if colors["distinctive_a"] else None
    db_ = colors["distinctive_b"][0]["value"] if colors["distinctive_b"] else None
    parts = []
    if shared:
        parts.append(f"Both {a_name} and {b_name} lead with {shared}")
    if da:
        parts.append(f"{a_name} leans {da}")
    if db_:
        parts.append(f"{b_name} leans {db_}")
    return "; ".join(parts) + "." if parts else f"{a_name} vs {b_name}."


# --- season wide -------------------------------------------------------------
def season_report(sheets_coll, year: int, season: str, category: str, *, top_n: int = 8) -> dict:
    colls = [d for d in sheets_coll.find({"report_type": "collection", "year": year, "season": season})
             if _cat(d.get("collection_id", "")) == category]
    if not colls:
        raise ValueError(f"no collections for {season} {year} {category}")
    brands = sorted(d["brand_slug"] for d in colls)

    dims = {}
    for dim in DIMENSIONS:
        per_brand = {d["brand_slug"]: _ranked_map(d, dim) for d in colls}
        values = set().union(*[set(m) for m in per_brand.values()]) if per_brand else set()

        consensus, spreads = [], []
        for v in values:
            shares = [per_brand[b].get(v, {}).get("share", 0.0) for b in brands]
            present = sum(1 for b in brands if v in per_brand[b])
            consensus.append({"value": v, "avg_share": round(mean(shares), 4),
                              "brands_with_it": present,
                              "shares": {b: round(per_brand[b].get(v, {}).get("share", 0.0), 4) for b in brands}})
            spreads.append(pstdev(shares) if len(shares) > 1 else 0.0)
        consensus.sort(key=lambda c: c["avg_share"], reverse=True)
        top = consensus[:top_n]

        leaderboard = {c["value"]: sorted(
            [{"brand": b, "share": c["shares"][b]} for b in brands], key=lambda x: x["share"], reverse=True)
            for c in top[:5]}

        by_brand = {}
        for d in colls:
            ranked = (d.get("dimensions", {}).get(dim, {}).get("ranked", []) or [])[:top_n]
            by_brand[d["brand_slug"]] = [{"value": rv["value"], "share": rv.get("share"),
                                          "vs_brand": (rv.get("vs_brand") or {}).get("delta")} for rv in ranked]

        # outliers: (brand, value) shares that deviate most from the season average for that value
        avg_by_val = {c["value"]: c["avg_share"] for c in consensus}
        outs = []
        for b in brands:
            for v, rv in per_brand[b].items():
                dev = round(rv.get("share", 0.0) - avg_by_val.get(v, 0.0), 4)
                outs.append({"brand": b, "value": v, "share": round(rv.get("share", 0.0), 4),
                             "vs_season_avg": dev})
        outs.sort(key=lambda o: abs(o["vs_season_avg"]), reverse=True)

        dims[dim] = {
            "spread_index": round(mean(spreads[:top_n]) if spreads else 0.0, 3),
            "consensus": top, "leaderboard": leaderboard,
            "by_brand": by_brand, "outliers": outs[:top_n],
        }

    return {
        "season": {"year": year, "season": season, "category": category, "brands": brands,
                   "total_looks": sum(d.get("total_looks", 0) for d in colls)},
        "dimensions": dims,
        "headline": _season_headline(season, year, brands, dims["colors"]),
    }


def _season_headline(season, year, brands, colors) -> str:
    cons = colors["consensus"][0]["value"] if colors["consensus"] else None
    out = colors["outliers"][0] if colors["outliers"] else None
    s = f"{season} {year} ({len(brands)} brands): "
    if cons:
        s += f"shared lead is {cons}"
    if out:
        s += f"; {out['brand']} stands out on {out['value']} ({out['vs_season_avg']*100:+.0f}pt vs peers)"
    return s + "."


# --- dropdown options --------------------------------------------------------
def brand_options(sheets_coll) -> list[dict]:
    return sorted(({"slug": s["_id"], "name": s.get("brand"), "total_looks": s.get("total_looks"),
                    "collections": s.get("collections")}
                   for s in sheets_coll.find({"report_type": "overall"})), key=lambda x: x["slug"])


def season_options(sheets_coll) -> list[dict]:
    grid = defaultdict(set)
    for d in sheets_coll.find({"report_type": "collection"}):
        grid[(d["year"], d["season"], _cat(d.get("collection_id", "")))].add(d["brand_slug"])
    out = [{"year": y, "season": s, "category": c, "brands": sorted(bs), "id": f"{y}-{s.lower()}-{c}"}
           for (y, s, c), bs in grid.items() if len(bs) >= 2]
    return sorted(out, key=lambda o: (o["year"], o["season"], o["category"]))


# --- editorial narration (LLM writes the prose; the numbers stay untouched) -----
# Mirrors trend_engine.compose.narrator: the model receives ONLY the computed numbers
# as read-only context and returns magazine-style prose in a fixed JSON schema.

_COMPARE_SYSTEM = """You are the editor of a high-end fashion trend magazine writing a
head-to-head comparison of two houses. Write vivid, confident, designerly editorial prose —
grounded STRICTLY in the numbers provided.
Rules:
- Use ONLY the numbers given; never invent a statistic or percentage.
- headline: a short, evocative cover title for the face-off.
- standfirst: one evocative sentence beneath it.
- at_a_glance: 3-5 punchy noun phrases capturing the biggest contrasts.
- For EACH dimension section: coined_name (2-4 words), narrative (2-3 sentences on how the
  two houses compare — the shared foundation, each house's signature, and any diverging
  momentum), designer_cue (one practical line a working designer can act on).
- verdict: one closing sentence naming the essential difference between the two houses.
- Never name or describe brand logos/monograms."""

_SEASON_SYSTEM = """You are the editor of a high-end fashion trend magazine writing a season
round-up on how several houses interpreted ONE season. Write vivid, designerly editorial
prose — grounded STRICTLY in the numbers provided.
Rules:
- Use ONLY the numbers given; never invent a statistic or percentage.
- headline: a short, evocative cover title for the season.
- standfirst: one evocative sentence beneath it.
- at_a_glance: 3-5 punchy noun phrases (the season's defining moves).
- For EACH dimension section: coined_name (2-4 words), narrative (2-3 sentences — the shared
  story across the houses, who led, and who broke from the pack), designer_cue (one practical line).
- verdict: one closing sentence — was the season a consensus or a divergence, and its defining move.
- Never name or describe brand logos/monograms."""


class _Section(BaseModel):
    dimension: str
    coined_name: str = ""
    narrative: str = ""
    designer_cue: str = ""


class _Editorial(BaseModel):
    headline: str = ""
    standfirst: str = ""
    at_a_glance: list[str] = Field(default_factory=list)
    sections: list[_Section] = Field(default_factory=list)
    verdict: str = ""


def _narrate(system: str, payload: dict, *, client=None, model_name: str | None = None) -> dict:
    from google import genai
    from google.genai import types
    if client is None:
        if not config.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY not set")
        client = genai.Client(api_key=config.GEMINI_API_KEY)
    resp = client.models.generate_content(
        model=model_name or config.NARRATE_MODEL,
        contents=("DATA (the only numbers you may use):\n"
                  + json.dumps(payload, ensure_ascii=False)
                  + "\n\nWrite the editorial as JSON."),
        config=types.GenerateContentConfig(
            temperature=0.5, system_instruction=system,
            response_mime_type="application/json", response_schema=_Editorial),
    )
    nar = resp.parsed or _Editorial.model_validate_json(resp.text)
    return nar.model_dump()


def _compare_payload(result: dict) -> dict:
    dims = []
    for dim, d in result["dimensions"].items():
        dims.append({
            "dimension": dim, "divergence_0to1": d["divergence_score"],
            "top": [{"value": r["value"], f"{result['brand_a']['name']}_pct": round(r["a_share"] * 100),
                     f"{result['brand_b']['name']}_pct": round(r["b_share"] * 100),
                     "a_trend": r["a_momentum"], "b_trend": r["b_momentum"]} for r in d["table"][:6]],
            "shared": [s["value"] for s in d["shared"]],
            f"signature_{result['brand_a']['name']}": [s["value"] for s in d["distinctive_a"]],
            f"signature_{result['brand_b']['name']}": [s["value"] for s in d["distinctive_b"]],
        })
    return {"brand_a": result["brand_a"]["name"], "brand_b": result["brand_b"]["name"], "dimensions": dims}


def _season_payload(result: dict) -> dict:
    s = result["season"]
    dims = []
    for dim, d in result["dimensions"].items():
        dims.append({
            "dimension": dim, "spread_0to1": d["spread_index"],
            "consensus": [{"value": c["value"], "avg_pct": round(c["avg_share"] * 100),
                           "by_brand_pct": {b: round(v * 100) for b, v in c["shares"].items()}}
                          for c in d["consensus"][:6]],
            "outliers": [{"brand": o["brand"], "value": o["value"],
                          "vs_peers_pt": round(o["vs_season_avg"] * 100)} for o in d["outliers"][:5]],
        })
    return {"season": f"{s['season']} {s['year']} {s['category'].upper()}",
            "brands": s["brands"], "dimensions": dims}


def narrate_compare(result: dict, *, client=None, model_name: str | None = None) -> dict:
    return _narrate(_COMPARE_SYSTEM, _compare_payload(result), client=client, model_name=model_name)


def narrate_season(result: dict, *, client=None, model_name: str | None = None) -> dict:
    return _narrate(_SEASON_SYSTEM, _season_payload(result), client=client, model_name=model_name)
