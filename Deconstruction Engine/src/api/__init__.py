"""Read-only API for the deconstruction store (FastAPI).

Serves the per-look deconstruction (garments -> colors/fabrics/patterns/flats with
metadata) and streams the swatch/flat PNGs out of GridFS. No fal, no writes.

Loads env (MONGO_URI) on import so `DeconstructionStore()` can connect.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

# Fashionairre root:  .../Fashionairre/Deconstruction Engine/src/api/__init__.py
_ROOT = Path(__file__).resolve().parents[3]
for _rel in ("Deconstruction Engine/src/.env", "Trend Analysis Engine/.env"):
    _p = _ROOT / _rel
    if not _p.exists():
        continue
    for _line in _p.read_text().splitlines():
        _m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.+)$", _line)
        if _m and _m.group(1) not in os.environ:
            os.environ[_m.group(1)] = _m.group(2).strip()
