"""Ensure the shared `core/` lib (fashionairre_core) is importable before any
sibling module in this package imports it — same shim as build_sheets.py, but
placed at the package level so import order elsewhere in this package can't
matter (this was a real bug caught by first-run testing)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "core"))
