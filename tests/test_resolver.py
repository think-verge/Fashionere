"""Resolver: all three input modes -> Target, on mock providers."""
from __future__ import annotations

import pytest

from app import resolver
from app.models import CatalogueRequest, ImageRequest, QueryRequest
from app.providers.text_mock import TextMockProvider


@pytest.fixture
def text():
    return TextMockProvider()


async def test_resolve_query_extracts_category(text):
    target = await resolver.resolve(
        "query", QueryRequest(query="latest trends for a beachwear collection"), text
    )
    assert target.source_mode == "query"
    assert target.category == "swimwear"  # beachwear -> swimwear
    assert target.raw_query == "latest trends for a beachwear collection"


async def test_resolve_query_picks_up_season(text):
    target = await resolver.resolve(
        "query", QueryRequest(query="SS27 womenswear dresses trends"), text
    )
    assert target.category == "dresses"
    assert target.season == "SS27"
    assert target.market == "womenswear"


async def test_resolve_catalogue(text):
    target = await resolver.resolve(
        "catalogue", CatalogueRequest(catalogue_item_id="dress_midi_01"), text
    )
    assert target.source_mode == "catalogue"
    assert target.category == "dresses"
    assert target.attributes.get("length") == "midi"


async def test_resolve_catalogue_unknown_raises(text):
    with pytest.raises(resolver.ResolverError):
        await resolver.resolve("catalogue", CatalogueRequest(catalogue_item_id="nope"), text)


async def test_resolve_image(text):
    target = await resolver.resolve(
        "image", ImageRequest(image_url="https://example.com/a-denim-jacket.jpg"), text
    )
    assert target.source_mode == "image"
    assert target.category == "denim"  # inferred from the URL keywords
    assert target.reference_image_url == "https://example.com/a-denim-jacket.jpg"
