"""Storage provider — re-hosts generated images so the frontend fetches them
from our own backend rather than a model provider's ephemeral CDN.

MVP1 ships a `LocalStorage` that writes into `static/` and serves via the
FastAPI `/static` mount. The same Protocol allows an S3/GCS impl later with no
pipeline changes.
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Optional, Protocol, runtime_checkable

import httpx

log = logging.getLogger("inspiration_engine.storage")

# content-type -> file suffix, for naming downloaded files.
_CT_SUFFIX = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/gif": ".gif",
}


@runtime_checkable
class Storage(Protocol):
    async def localize(self, url: str) -> str:
        """Return a URL served by us. Remote URLs are downloaded and re-hosted;
        URLs we already host are returned unchanged."""
        ...


class LocalStorage:
    def __init__(self, static_dir: Path, public_base_url: str) -> None:
        self._dir = Path(static_dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._base = public_base_url.rstrip("/")

    # --- writing ---

    def save_bytes(self, data: bytes, suffix: str, *, key: Optional[str] = None) -> str:
        name = (key or hashlib.sha1(data).hexdigest()[:16]) + suffix
        (self._dir / name).write_bytes(data)
        return f"{self._base}/static/{name}"

    def save_text(self, text: str, suffix: str, *, key: Optional[str] = None) -> str:
        return self.save_bytes(text.encode("utf-8"), suffix, key=key)

    # --- ingesting remote URLs ---

    async def localize(self, url: str) -> str:
        if not url or url.startswith(f"{self._base}/static/"):
            return url
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
            suffix = _suffix_for(resp.headers.get("content-type", ""), url)
            key = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]
            return self.save_bytes(resp.content, suffix, key=key)
        except Exception as e:  # noqa: BLE001 - keep the remote URL if re-host fails
            log.warning("could not re-host %s locally: %s", url, e)
            return url


def _suffix_for(content_type: str, url: str) -> str:
    ct = content_type.split(";")[0].strip().lower()
    if ct in _CT_SUFFIX:
        return _CT_SUFFIX[ct]
    # fall back to the URL's extension, else .png
    ext = Path(url.split("?")[0]).suffix.lower()
    return ext if ext in set(_CT_SUFFIX.values()) else ".png"
