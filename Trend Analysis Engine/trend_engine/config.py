"""Runtime configuration, loaded from environment / .env.

Keep this the single place that reads os.environ so the rest of the code
depends on `config`, not on env var names.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


def _f(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _i(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


class Config:
    # storage
    MONGO_URI: str = os.getenv("MONGO_URI", "")
    MONGO_DB: str = os.getenv("MONGO_DB", "fashionairre_trends")

    # models — gemini-2.5-* were retired for new API keys (404 "no longer available
    # to new users"); default to the rolling-latest aliases so this doesn't break.
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    NORMALIZE_MODEL: str = os.getenv("NORMALIZE_MODEL", "gemini-flash-latest")
    NARRATE_MODEL: str = os.getenv("NARRATE_MODEL", "gemini-flash-latest")

    # thresholds (DESIGN.md §15)
    CONFIDENCE_MIN: float = _f("CONFIDENCE_MIN", 0.6)
    SIGNATURE_BREADTH_FLOOR: float = _f("SIGNATURE_BREADTH_FLOOR", 0.10)
    MOMENTUM_MIN: float = _f("MOMENTUM_MIN", 0.05)
    MIN_LOOKS_TO_RANK: int = _i("MIN_LOOKS_TO_RANK", 3)
    PALETTE_K: int = _i("PALETTE_K", 6)

    # versions stamped onto derived artifacts (DESIGN.md §13.3)
    VOCAB_VER: str = os.getenv("VOCAB_VER", "v1")
    PROMPT_VER: str = os.getenv("PROMPT_VER", "v1")
    AGG_VER: str = os.getenv("AGG_VER", "v1")
    RENDER_VER: str = os.getenv("RENDER_VER", "v1")

    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")


config = Config()
