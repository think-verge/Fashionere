"""FastAPI app: routes, startup wiring, provider selection.

Default config selects mock providers everywhere, so this runs with zero keys.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app import pipeline, resolver
from app.config import Settings, get_settings
from app.jobs import JobStore, make_job_store
from app.storage import LocalStorage, Storage
from app.models import (
    CatalogueItem,
    CatalogueRequest,
    ImageRequest,
    JobCreated,
    JobStatus,
    QueryRequest,
    Target,
)
from app.providers.base import ImageProvider, TextProvider, TrendProvider

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("inspiration_engine")


# ---------- provider factory ----------

def build_trend_provider(s: Settings) -> TrendProvider:
    # Only a mock implementation exists in MVP1; the real Trend Agent slots in
    # behind this same interface later (Phase 2).
    from app.providers.trends_mock import TrendsMockProvider

    return TrendsMockProvider(s.mock_trends_path)


def build_image_provider(s: Settings, storage: LocalStorage | None) -> ImageProvider:
    if s.image_provider == "fal":
        from app.providers.image_fal import FalImageProvider

        return FalImageProvider(s.fal_key or "", s.fal_model)
    if s.image_provider == "replicate":
        from app.providers.image_replicate import ReplicateImageProvider

        return ReplicateImageProvider(s.replicate_api_token or "", s.replicate_model)
    if s.image_provider == "gemini":
        from app.providers.image_gemini import GeminiImageProvider

        return GeminiImageProvider(s.gemini_api_key or "", s.gemini_image_model, storage)
    from app.providers.image_mock import ImageMockProvider

    # Give the mock our storage so it writes self-contained local SVG tiles.
    return ImageMockProvider(storage=storage)


def build_text_provider(s: Settings) -> TextProvider:
    if s.text_provider == "anthropic":
        from app.providers.text_anthropic import AnthropicTextProvider

        return AnthropicTextProvider(s.anthropic_api_key or "", s.anthropic_model)
    if s.text_provider == "openai":
        from app.providers.text_openai import OpenAITextProvider

        return OpenAITextProvider(s.openai_api_key or "", s.openai_model)
    if s.text_provider == "gemini":
        from app.providers.text_gemini import GeminiTextProvider

        return GeminiTextProvider(s.gemini_api_key or "", s.gemini_text_model)
    from app.providers.text_mock import TextMockProvider

    return TextMockProvider()


# ---------- app + container ----------

class Container:
    settings: Settings
    job_store: JobStore
    trend_provider: TrendProvider
    image_provider: ImageProvider
    text_provider: TextProvider
    storage: Storage | None


container = Container()


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    container.settings = s
    container.storage = None if s.storage == "none" else LocalStorage(s.static_dir, s.public_base_url)
    container.job_store = make_job_store(s.job_store, s.redis_url)
    container.trend_provider = build_trend_provider(s)
    container.image_provider = build_image_provider(s, container.storage if isinstance(container.storage, LocalStorage) else None)
    container.text_provider = build_text_provider(s)
    log.info(
        "providers: trend=%s image=%s text=%s job_store=%s storage=%s",
        s.trend_provider, s.image_provider, s.text_provider, s.job_store, s.storage,
    )
    yield


app = FastAPI(title="Centoire Inspiration Engine", version="1.0.0-mvp1", lifespan=lifespan)

# Serve generated/re-hosted images from our own backend.
app.mount("/static", StaticFiles(directory=str(get_settings().static_dir)), name="static")


# ---------- background execution ----------

async def _run_job(job_id: str, target: Target) -> None:
    store = container.job_store
    await store.set_running(job_id)
    try:
        moodboard = await pipeline.generate_moodboard(
            target,
            trend_provider=container.trend_provider,
            image_provider=container.image_provider,
            text_provider=container.text_provider,
            storage=container.storage,
            tiles=container.settings.image_tiles,
            timeout_s=container.settings.provider_timeout_s,
        )
        await store.set_done(job_id, moodboard)
    except Exception as e:  # noqa: BLE001
        log.exception("job %s failed", job_id)
        await store.set_error(job_id, f"{type(e).__name__}: {e}")


async def _enqueue(target: Target) -> JobCreated:
    job_id = await container.job_store.create()
    asyncio.create_task(_run_job(job_id, target))
    return JobCreated(job_id=job_id, status="pending")


# ---------- routes ----------

@app.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    # Land visitors on the interactive API docs.
    return RedirectResponse(url="/docs")


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}


@app.get("/api/catalogue", response_model=list[CatalogueItem])
async def get_catalogue() -> list[CatalogueItem]:
    return [CatalogueItem(**item) for item in resolver.load_catalogue()]


@app.post("/api/moodboard/from-query", response_model=JobCreated, status_code=202)
async def from_query(req: QueryRequest) -> JobCreated:
    try:
        target = await resolver.resolve("query", req, container.text_provider)
    except resolver.ResolverError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return await _enqueue(target)


@app.post("/api/moodboard/from-catalogue", response_model=JobCreated, status_code=202)
async def from_catalogue(req: CatalogueRequest) -> JobCreated:
    try:
        target = await resolver.resolve("catalogue", req, container.text_provider)
    except resolver.ResolverError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return await _enqueue(target)


@app.post("/api/moodboard/from-image", response_model=JobCreated, status_code=202)
async def from_image(req: ImageRequest) -> JobCreated:
    try:
        target = await resolver.resolve("image", req, container.text_provider)
    except resolver.ResolverError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return await _enqueue(target)


@app.get("/api/moodboard/jobs/{job_id}", response_model=JobStatus)
async def get_job(job_id: str) -> JobStatus:
    status = await container.job_store.get(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Unknown job_id: {job_id}")
    return status
