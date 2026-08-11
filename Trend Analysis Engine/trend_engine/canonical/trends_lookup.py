"""Step 3 — the JOIN: tag a look's elements with trend momentum.

Takes a canonical Look, runs the Step-2 bridge to get its vocab tags, then looks
each element's value up in a produced `TrendSheet` and attaches its
share / momentum (rising · fading · steady · emerging · dropped). This is what
puts a "trending / fading" badge on a deconstructed element — surfaced only when
the trend sheet actually covers that value (else `trend=None`, i.e. no data).

Additive; imports the Step-2 bridge + reads a TrendSheet as plain JSON.
"""

from __future__ import annotations

import json
from pathlib import Path

from trend_engine.canonical.bridge import normalize_from_canonical

# tag list attribute -> (TrendSheet dimension key, value field on the tag)
_DIMS = {
    "colors": ("colors", "family"),
    "fabrics": ("fabrics", "value"),
    "patterns": ("patterns", "value"),
    "silhouettes": ("silhouettes", "value"),
    "themes": ("themes", "value"),
    "details": ("details", "value"),
}


def load_sheet(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def momentum_for(sheet: dict, dimension: str, value: str) -> dict | None:
    """Look up one value's share + momentum in the sheet. None if not ranked."""
    dim = (sheet.get("dimensions") or {}).get(dimension)
    if not dim:
        return None
    rv = next((r for r in dim.get("ranked", []) if r.get("value") == value), None)
    if not rv:
        return None
    m = rv.get("momentum") or {}
    return {
        "share": rv.get("share"),
        "looks": rv.get("looks"),
        "yoy_delta": m.get("yoy_delta"),
        "kind": m.get("kind"),
        "trustworthy": m.get("trustworthy"),
        "signature_score": rv.get("signature_score"),
    }


def enrich(clook, sheet: dict, *, client=None) -> dict:
    """canonical Look → vocab tags → per-element trend badges (against `sheet`)."""
    look = normalize_from_canonical(clook, client=client)
    t = look.tags

    def elems(tags, dim, field):
        out = []
        for tag in tags:
            val = getattr(tag, field)
            out.append({
                "value": val,
                "label": getattr(tag, "name", None) or val,
                "trend": momentum_for(sheet, dim, val),
            })
        return out

    return {
        "look_id": look.look_id,
        "brand": look.brand,
        "season": look.season,
        "year": look.year,
        "trend_scope": {"brand": sheet.get("brand"), "window_years": sheet.get("window_years")},
        "elements": {
            attr: elems(getattr(t, attr), dim, field)
            for attr, (dim, field) in _DIMS.items()
        },
    }


_ARROW = {"rising": "▲", "emerging": "✦", "steady": "→", "fading": "▼", "dropped": "✕"}


def badge(trend: dict | None) -> str:
    """One-line human badge for an element's trend, e.g. '▲ rising (+14pts · 23% of looks)'."""
    if not trend:
        return "— no trend data"
    kind = trend.get("kind", "steady")
    d, s = trend.get("yoy_delta"), trend.get("share")
    parts = []
    if isinstance(d, (int, float)):
        parts.append(f"{d * 100:+.0f}pts")
    if isinstance(s, (int, float)):
        parts.append(f"{s * 100:.0f}% of looks")
    tail = f" ({' · '.join(parts)})" if parts else ""
    return f"{_ARROW.get(kind, '·')} {kind}{tail}"
