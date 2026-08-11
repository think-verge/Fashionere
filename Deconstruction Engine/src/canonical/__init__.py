"""Additive canonical pipeline (Step 1) — does NOT modify the legacy engine.

This subpackage makes the deconstruction engine *consume* the shared
`fashionairre-core` canonical schema (read-only, the source of truth) and emit a
NEW combined output: ``{ "look": <canonical Look>, "assets": <derived swatches/sketch> }``.

Nothing here mutates the canonical schema, and no legacy file (src/schemas.py,
src/deconstruct.py, src/webapp.py, …) is changed — the old path remains a working
fallback. We only *import* legacy generation helpers (schema-agnostic) and core.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make the shared core importable without packaging changes (monorepo sibling).
# .../Deconstruction Engine/src/canonical/__init__.py -> parents[3] = Fashionairre root
_CORE = Path(__file__).resolve().parents[3] / "core"
if _CORE.is_dir() and str(_CORE) not in sys.path:
    sys.path.insert(0, str(_CORE))
