"""Adapter interface. A new data source only implements this; nothing
downstream changes. See DESIGN.md §5.2.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from trend_engine.schema.collection import Collection
from trend_engine.schema.look import Look


class SourceAdapter(ABC):
    source_name: str = "base"

    @abstractmethod
    def parse_collection(
        self, raw: list[dict], *, file_hint: str = ""
    ) -> tuple[Collection, list[Look]]:
        """Map one raw collection (list of source records) to a canonical
        Collection plus its Looks."""
        raise NotImplementedError
