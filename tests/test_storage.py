"""Local storage: mock tiles are written to disk and served from our backend."""
from __future__ import annotations

from pathlib import Path

import pytest

from app import pipeline
from app.config import get_settings
from app.models import Target
from app.providers.image_mock import ImageMockProvider
from app.providers.text_mock import TextMockProvider
from app.providers.trends_mock import TrendsMockProvider
from app.storage import LocalStorage


@pytest.fixture
def storage(tmp_path: Path):
    return LocalStorage(tmp_path, "http://localhost:8000")


async def test_mock_image_written_locally(storage):
    img = ImageMockProvider(storage=storage)
    url = await img.generate("A swimwear garment in buttery yellow", seed=1)
    assert url.startswith("http://localhost:8000/static/")
    name = url.rsplit("/", 1)[-1]
    assert (Path(storage._dir) / name).exists()


async def test_mock_without_storage_uses_placeholder():
    img = ImageMockProvider()
    url = await img.generate("A dress", seed=1)
    assert url.startswith("https://placehold.co/")


async def test_localize_is_noop_for_local_urls(storage):
    local = storage.save_text("<svg/>", ".svg", key="x")
    assert await storage.localize(local) == local


async def test_pipeline_serves_local_urls(storage):
    s = get_settings()
    mb = await pipeline.generate_moodboard(
        Target(category="swimwear", source_mode="query"),
        trend_provider=TrendsMockProvider(s.mock_trends_path),
        image_provider=ImageMockProvider(storage=storage),
        text_provider=TextMockProvider(),
        storage=storage,
    )
    assert mb.hero_images
    assert all(i.url.startswith("http://localhost:8000/static/") for i in mb.hero_images)
