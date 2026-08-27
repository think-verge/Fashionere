"""Generic vocabulary normalizer.

Given a vocab file (fabrics.json, patterns.json, etc.) and a free-text string,
returns the list of matching term ids. Word-boundary regex, longest-match-first.

    >>> from fashionairre_core.vocab_normalize import VocabNormalizer
    >>> vn = VocabNormalizer("fabrics")
    >>> vn.match("textured leather")
    ['leather']
    >>> vn.match("polyester 100%")
    []
    >>> vn.match("silk crepe")
    ['crepe', 'silk']
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_VOCAB_DIR = (
    Path(__file__).resolve().parents[2]
    / "Trend Analysis Engine"
    / "trend_engine"
    / "registries"
    / "vocab"
)


class VocabNormalizer:
    def __init__(self, name: str):
        self.name = name
        self._rules = self._build_rules(name)

    @staticmethod
    @lru_cache(maxsize=16)
    def _build_rules(name: str) -> list[tuple[re.Pattern, str]]:
        path = _VOCAB_DIR / f"{name}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        raw: list[tuple[str, str]] = []
        for term in data["terms"]:
            tid = term["id"]
            raw.append((term["label"].lower(), tid))
            for alias in term.get("aliases", []):
                raw.append((alias.lower(), tid))
            for kw in term.get("keywords", []):
                raw.append((kw.lower(), tid))
        raw.sort(key=lambda p: (-len(p[0]), p[0]))
        rules = []
        for phrase, tid in raw:
            pat = re.compile(
                r"(?:^|[\s,;/\-(])(" + re.escape(phrase) + r")(?:[\s,;/\-).%]|$)",
                re.IGNORECASE,
            )
            rules.append((pat, tid))
        return rules

    def match(self, text: str | None) -> list[str]:
        """Return matching term ids for the given free-text string."""
        if not text:
            return []
        s = text.lower()
        matched: dict[str, None] = {}
        consumed_spans: list[tuple[int, int]] = []
        for pat, tid in self._rules:
            for m in pat.finditer(s):
                span = m.span(1)
                if any(cs <= span[0] < ce or cs < span[1] <= ce for cs, ce in consumed_spans):
                    continue
                matched[tid] = None
                consumed_spans.append(span)
        return list(matched.keys())
