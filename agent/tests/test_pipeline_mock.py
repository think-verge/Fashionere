"""Full moodboard on mock providers — every section populated; parallelism."""
from __future__ import annotations

import asyncio
import time

import pytest

from app import pipeline
from app.config import get_settings
from app.models import Target
from app.providers.base import ImageProvider
from app.providers.image_mock import ImageMockProvider
from app.providers.text_mock import TextMockProvider
from app.providers.trends_mock import TrendsMockProvider


@pytest.fixture
def providers():
    s = get_settings()
    return (
        TrendsMockProvider(s.mock_trends_path),
        ImageMockProvider(),
        TextMockProvider(),
    )


def _swimwear_target() -> Target:
    return Target(category="swimwear", season="SS27", market="womenswear", source_mode="query")


async def test_full_moodboard_all_sections(providers):
    trend, image, text = providers
    mb = await pipeline.generate_moodboard(
        _swimwear_target(), trend_provider=trend, image_provider=image, text_provider=text
    )

    # written
    assert mb.narrative
    assert len(mb.keywords) >= 6
    assert len(mb.name_suggestions) >= 1
    # pulled
    assert len(mb.palette) >= 1
    assert all(s.hex.startswith("#") for s in mb.palette)
    assert len(mb.badges) >= 1
    # generated — every visual section present
    assert mb.hero_images
    assert mb.silhouettes
    assert mb.textures
    assert mb.patterns
    assert mb.details
    assert mb.styling
    assert mb.colorways


async def test_badges_reflect_trend_metadata(providers):
    trend, image, text = providers
    target = _swimwear_target()
    trends = await trend.get_trends(target)
    mb = await pipeline.generate_moodboard(
        target, trend_provider=trend, image_provider=image, text_provider=text
    )
    by_label = {t.label: t for t in trends}
    for badge in mb.badges:
        src = by_label[badge.label]
        assert badge.confidence_score == src.confidence_score
        assert badge.lifecycle_stage == src.lifecycle_stage
        assert badge.sources == src.sources
        assert badge.why


async def test_images_generated_in_parallel():
    """A provider that sleeps proves gather runs tiles concurrently:
    total time ~= one delay, not the sum of all delays."""
    s = get_settings()
    trend = TrendsMockProvider(s.mock_trends_path)
    text = TextMockProvider()

    class SlowImage(ImageProvider):
        async def generate(self, prompt, *, aspect_ratio="1:1", seed=None, reference_image_url=None):
            await asyncio.sleep(0.1)
            return f"https://slow/{seed}"

    start = time.perf_counter()
    mb = await pipeline.generate_moodboard(
        _swimwear_target(), trend_provider=trend, image_provider=SlowImage(), text_provider=text
    )
    elapsed = time.perf_counter() - start

    total_tiles = sum(
        len(x) for x in [
            mb.hero_images, mb.silhouettes, mb.textures, mb.patterns,
            mb.details, mb.styling, mb.colorways,
        ]
    )
    assert total_tiles >= 10
    # Sequential would be >= total_tiles * 0.1s; parallel should be well under.
    assert elapsed < total_tiles * 0.1 * 0.6


async def test_tolerates_individual_tile_failure():
    """One failing tile is skipped; the board still composes."""
    s = get_settings()
    trend = TrendsMockProvider(s.mock_trends_path)
    text = TextMockProvider()

    class FlakyImage(ImageProvider):
        def __init__(self):
            self.calls = 0

        async def generate(self, prompt, *, aspect_ratio="1:1", seed=None, reference_image_url=None):
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("boom")
            return f"https://ok/{seed}"

    mb = await pipeline.generate_moodboard(
        _swimwear_target(), trend_provider=trend, image_provider=FlakyImage(),
        text_provider=text, timeout_s=5,
    )
    # Board still has content despite one (retried, then skipped) failure.
    assert mb.hero_images or mb.silhouettes
