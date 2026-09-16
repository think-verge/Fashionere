"""Application settings loaded from environment.

Defaults select **mock** providers everywhere so the app runs with zero API
keys and zero cost. Real providers activate when the corresponding env var is
set (and a key is present).
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

_REPO_ROOT = Path(__file__).resolve().parent.parent


def _path(value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else (_REPO_ROOT / p)


def _parse_tiles(raw: str | None, *, default: dict[str, int]) -> dict[str, int]:
    """Parse IMAGE_TILES like 'hero:2,silhouette:1' into {kind: count}."""
    if not raw:
        return dict(default)
    out = dict(default)
    for part in raw.split(","):
        if ":" not in part:
            continue
        kind, _, count = part.partition(":")
        try:
            out[kind.strip()] = max(0, int(count.strip()))
        except ValueError:
            continue
    return out


class Settings:
    """Plain settings object read once at startup."""

    def __init__(self) -> None:
        # Provider selection
        self.image_provider: str = os.getenv("IMAGE_PROVIDER", "mock").lower()
        self.text_provider: str = os.getenv("TEXT_PROVIDER", "mock").lower()
        self.trend_provider: str = os.getenv("TREND_PROVIDER", "mock").lower()

        # Keys
        self.fal_key: str | None = os.getenv("FAL_KEY") or None
        self.replicate_api_token: str | None = os.getenv("REPLICATE_API_TOKEN") or None
        self.anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY") or None
        self.openai_api_key: str | None = os.getenv("OPENAI_API_KEY") or None
        self.gemini_api_key: str | None = os.getenv("GEMINI_API_KEY") or None

        # Model overrides
        self.anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")
        self.openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o")
        self.fal_model: str = os.getenv("FAL_MODEL", "fal-ai/flux-pro")
        self.replicate_model: str = os.getenv("REPLICATE_MODEL", "black-forest-labs/flux-pro")
        self.gemini_text_model: str = os.getenv("GEMINI_TEXT_MODEL", "gemini-flash-latest")
        self.gemini_image_model: str = os.getenv("GEMINI_IMAGE_MODEL", "gemini-flash-latest")

        # Storage
        self.static_dir: Path = _path(os.getenv("STATIC_DIR", "./static"))
        self.public_base_url: str = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")

        # Storage backend for re-hosting images (local | supabase | none)
        self.storage: str = os.getenv("STORAGE", "local").lower()

        # Supabase (used when STORAGE=supabase)
        self.supabase_url: str | None = os.getenv("SUPABASE_URL") or None
        self.supabase_service_key: str | None = os.getenv("SUPABASE_SERVICE_KEY") or None
        self.supabase_bucket: str = os.getenv("SUPABASE_BUCKET", "moodboards")

        # MongoDB collections for persistence
        self.moodboards_collection: str = os.getenv("MOODBOARDS_COLLECTION", "moodboards")
        self.elements_collection: str = os.getenv("ELEMENTS_COLLECTION", "elements")

        # Data
        self.data_dir: Path = _path(os.getenv("DATA_DIR", "./data"))

        # MongoDB (used by trends_mongo provider)
        self.mongodb_uri: str | None = os.getenv("MONGODB_URI") or None
        self.mongodb_db: str = os.getenv("MONGODB_DB", "centoire")
        self.trends_collection: str = os.getenv("TRENDS_COLLECTION", "trend_records")

        # Job store
        self.job_store: str = os.getenv("JOB_STORE", "memory").lower()
        self.redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

        # Pipeline tuning
        self.provider_timeout_s: float = float(os.getenv("PROVIDER_TIMEOUT_S", "60"))
        # How many image tiles per kind. Default is a lean profile to keep real
        # provider cost down; override with IMAGE_TILES="hero:3,silhouette:2,...".
        self.image_tiles: dict[str, int] = _parse_tiles(
            os.getenv("IMAGE_TILES"),
            default={"hero": 2, "silhouette": 1, "texture": 1, "pattern": 1,
                     "detail": 0, "styling": 1, "colorway": 0},
        )

        self.static_dir.mkdir(parents=True, exist_ok=True)

    @property
    def mock_trends_path(self) -> Path:
        return self.data_dir / "mock_trends.json"

    @property
    def catalogue_path(self) -> Path:
        return self.data_dir / "catalogue.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
