"""Color normalizer — deterministic, no LLM (DESIGN.md §7.1).

Each source color already carries a hex, so a color's `family` is decided by:
  1. its name, via a priority-ordered keyword list (handles the cases pure
     distance confuses: "deep navy blue" -> navy, "charcoal grey" -> grey), then
  2. nearest anchor family by CIEDE2000 distance, as a fallback.
The exact hex / pantone / name are always kept for display.
"""
from __future__ import annotations

import re

from coloraide import Color

from trend_engine.schema.look import Look, RawColor
from trend_engine.schema.tags import ColorTag

# Representative anchor per family; used only as the hex fallback. DESIGN.md §8.2.
FAMILY_ANCHORS: dict[str, str] = {
    "black": "#111111", "white": "#F5F5F2", "grey": "#808080", "silver": "#C0C4C8",
    "navy": "#1F2A44", "blue": "#2A4B8D", "teal": "#256D6A", "green": "#2E7D32",
    "olive": "#6B6A3A", "yellow": "#E6C229", "gold": "#C9A227", "orange": "#E1521A",
    "red": "#C0392B", "burgundy": "#6E1E2A", "pink": "#E29AB0", "purple": "#5B2A83",
    "brown": "#6B4A2B", "cream": "#E8E0CE",
}

# Priority-ordered name keywords -> family. Specific families first so that
# "deep navy blue" -> navy (not blue) and "charcoal grey" -> grey.
NAME_RULES: list[tuple[str, str]] = [
    ("navy", "navy"),
    ("teal", "teal"), ("turquoise", "teal"),
    ("burgundy", "burgundy"), ("maroon", "burgundy"), ("wine", "burgundy"),
    ("oxblood", "burgundy"), ("bordeaux", "burgundy"), ("merlot", "burgundy"),
    ("olive", "olive"), ("chartreuse", "olive"),
    ("charcoal", "grey"), ("slate", "grey"), ("graphite", "grey"),
    ("cream", "cream"), ("ivory", "cream"), ("ecru", "cream"),
    ("off-white", "cream"), ("off white", "cream"), ("nude", "cream"),
    ("blush", "pink"), ("rose", "pink"), ("magenta", "pink"),
    ("fuchsia", "pink"), ("salmon", "pink"), ("coral", "pink"),
    ("cobalt", "blue"), ("powder blue", "blue"), ("sky", "blue"), ("azure", "blue"),
    ("mustard", "gold"), ("golden", "gold"), ("gold", "gold"),
    ("silver", "silver"),
    ("jet", "black"),
    ("chocolate", "brown"), ("tortoise", "brown"), ("camel", "brown"),
    ("cognac", "brown"), ("tan", "brown"), ("beige", "brown"),
    ("taupe", "brown"), ("khaki", "brown"), ("mocha", "brown"), ("caramel", "brown"),
    ("lavender", "purple"), ("lilac", "purple"), ("violet", "purple"),
    ("plum", "purple"), ("mauve", "purple"),
    ("scarlet", "red"), ("crimson", "red"),
    # generic family words last
    ("black", "black"), ("white", "white"), ("grey", "grey"), ("gray", "grey"),
    ("blue", "blue"), ("green", "green"), ("red", "red"), ("pink", "pink"),
    ("purple", "purple"), ("yellow", "yellow"), ("orange", "orange"), ("brown", "brown"),
]

_ANCHORS = {fam: Color(hx) for fam, hx in FAMILY_ANCHORS.items()}

# Word-boundary matchers so "red" doesn't match inside "laye-red". Priority
# (list order) only breaks ties when two keywords match at the same position.
_KW_MATCHERS = [(re.compile(rf"\b{re.escape(kw)}\b"), fam, i)
                for i, (kw, fam) in enumerate(NAME_RULES)]

# If a name's family is this far (CIEDE2000) from the actual swatch hex, the
# name is describing something else — trust the hex instead.
_MAX_NAME_OVERRIDE_DE = 28.0


def family_from_name(name: str | None) -> str | None:
    """Family of the EARLIEST color word in the name — the swatch names its own
    color first; context colors ('... with navy trouser') come later. Ties are
    broken by NAME_RULES priority."""
    n = (name or "").lower()
    if not n:
        return None
    best_key: tuple[int, int] | None = None
    best_fam: str | None = None
    for rx, fam, prio in _KW_MATCHERS:
        m = rx.search(n)
        if m:
            key = (m.start(), prio)
            if best_key is None or key < best_key:
                best_key, best_fam = key, fam
    return best_fam


def family_from_hex(hexstr: str | None) -> str | None:
    if not hexstr:
        return None
    try:
        c = Color(hexstr)
    except Exception:
        return None
    best, best_d = None, 1e9
    for fam, anchor in _ANCHORS.items():
        d = c.delta_e(anchor, method="2000")
        if d < best_d:
            best_d, best = d, fam
    return best


def classify(color: RawColor) -> str:
    """Name-first (a swatch's own name is usually accurate), but let the hex
    override a name-family that is perceptually far from the actual color — the
    guard against descriptive, multi-color names."""
    name_fam = family_from_name(color.name)
    hex_fam = family_from_hex(color.hex)
    if name_fam and hex_fam and name_fam != hex_fam and color.hex:
        try:
            if Color(color.hex).delta_e(_ANCHORS[name_fam], method="2000") > _MAX_NAME_OVERRIDE_DE:
                return hex_fam
        except Exception:
            pass
    return name_fam or hex_fam or "other"


def color_tags_for_look(look: Look) -> list[ColorTag]:
    """One ColorTag per DISTINCT family in the look — look-level colors first,
    then families that only appear in detail shots. Dominant = family of the
    first look-level color; the rest are accents. Distinct-per-look keeps the
    detail shots from inflating a family's count (DESIGN.md §7.3)."""
    tags: list[ColorTag] = []
    seen: set[str] = set()

    for i, rc in enumerate(look.raw.colors):
        fam = classify(rc)
        if fam in seen:
            continue
        seen.add(fam)
        tags.append(ColorTag(
            family=fam, name=rc.name or "", hex=rc.hex or "", pantone=rc.pantone,
            role="dominant" if i == 0 else "accent", origin="look", confidence=1.0,
        ))

    for shot in look.raw.detail_shots:
        for rc in shot.colors:
            fam = classify(rc)
            if fam in seen:
                continue
            seen.add(fam)
            tags.append(ColorTag(
                family=fam, name=rc.name or "", hex=rc.hex or "", pantone=rc.pantone,
                role="accent", origin="detail", confidence=1.0,
            ))
    return tags
