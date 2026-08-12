"""Additive canonical bridge (Step 2) — lets the trend engine CONSUME the shared
`fashionairre-core` canonical Look, without modifying any legacy trend file.

It maps a canonical Look → a trend `Look` (populating `raw`), then the EXISTING
normalizer (deterministic colors + LLM vocab attributes) tags it exactly like the
legacy Vogue path. The legacy `adapters/vogue.py` text path stays a working
fallback for the 268 pre-scraped Prada looks.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make the shared core importable without packaging changes (monorepo sibling).
_CORE = Path(__file__).resolve().parents[3] / "core"
if _CORE.is_dir() and str(_CORE) not in sys.path:
    sys.path.insert(0, str(_CORE))
