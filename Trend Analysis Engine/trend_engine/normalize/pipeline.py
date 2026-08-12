"""Normalizer orchestration. Phase 2a wires the color normalizer; the LLM
attribute normalizer (fabric/pattern/silhouette/theme/details) plugs in here in
Phase 2b. See DESIGN.md §7.3.
"""
from __future__ import annotations

from trend_engine.normalize import color as color_norm
from trend_engine.schema.look import Look


def normalize_look(look: Look, *, do_colors: bool = True, do_attributes: bool = False,
                   client=None) -> Look:
    if do_colors:
        look.tags.colors = color_norm.color_tags_for_look(look)
    if do_attributes:
        from trend_engine.normalize import attributes as attr_norm
        attr_norm.normalize_attributes(look, client=client)
    return look


def normalize_looks(looks, *, do_colors: bool = True, do_attributes: bool = False, client=None):
    for look in looks:
        normalize_look(look, do_colors=do_colors, do_attributes=do_attributes, client=client)
    return looks
