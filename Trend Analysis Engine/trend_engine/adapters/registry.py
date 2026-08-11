"""source name -> adapter instance."""
from __future__ import annotations

from trend_engine.adapters.base import SourceAdapter
from trend_engine.adapters.vogue import VogueAdapter

_ADAPTERS: dict[str, SourceAdapter] = {a.source_name: a for a in (VogueAdapter(),)}


def get_adapter(source: str) -> SourceAdapter:
    adapter = _ADAPTERS.get((source or "").lower()) or _ADAPTERS.get("vogue")
    if adapter is None:
        raise KeyError(f"No adapter registered for source '{source}'")
    return adapter
