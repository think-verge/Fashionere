"""Configuration: API key, model IDs, and tunables. No secrets in code."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

# Load .env (if present) into the environment. Real env vars win over .env.
load_dotenv()


class ConfigError(RuntimeError):
    """Raised when required configuration (e.g. the API key) is missing."""


# --- Model IDs -------------------------------------------------------------
# gemini-2.5-* were retired for new API keys (404 "no longer available to new
# users"). Use the rolling-latest aliases so this doesn't break again. Verify with
# `client.models.list()` if a 404 recurs.
VISION_MODEL_FAST = "gemini-flash-latest"
VISION_MODEL_QUALITY = "gemini-pro-latest"
IMAGE_MODEL = "gemini-3.1-flash-image"  # legacy image path only; fal handles image gen now

# --- Tunables --------------------------------------------------------------
MAX_PALETTE_SIZE = 6          # cap palette entries per garment
MAX_RETRIES = 3               # per API call (vision / image)
RETRY_BASE_DELAY = 2.0        # seconds; exponential backoff base
REQUEST_TIMEOUT = 120         # seconds per API call

# Output layout (relative to the --output dir)
LOOKS_DIRNAME = "looks"
ASSETS_DIRNAME = "assets"
INDEX_JSON = "index.json"
INDEX_HTML = "index.html"


def get_api_key() -> str:
    """Return the Gemini API key from the environment, or raise ConfigError.

    Accepts GEMINI_API_KEY (preferred) or GOOGLE_API_KEY as a fallback.
    """
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise ConfigError(
            "GEMINI_API_KEY is not set. Copy .env.example to .env and add your "
            "key, or export GEMINI_API_KEY. Get one at "
            "https://aistudio.google.com/apikey"
        )
    return key


@dataclass(frozen=True)
class RunConfig:
    """Resolved per-run settings derived from CLI flags."""

    input_dir: str
    output_dir: str
    quality: bool = False   # use the Pro vision model
    force: bool = False     # reprocess already-done looks
    limit: int | None = None  # process only the first N looks

    @property
    def vision_model(self) -> str:
        return VISION_MODEL_QUALITY if self.quality else VISION_MODEL_FAST

    @property
    def image_model(self) -> str:
        return IMAGE_MODEL
