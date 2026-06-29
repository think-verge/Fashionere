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
from app.storage import LocalStorage, Storage, SupabaseStorage
from app.models import (
    ApplyTextureRequest,
    CatalogueItem,
    CatalogueRequest,
    EditRequest,
    ElementResponse,
    ImageRequest,
    JobCreated,
    JobStatus,
    QueryRequest,
    RegenerateRequest,
    Target,
)
from app.providers.base import ImageProvider, TextProvider, TrendProvider

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("inspiration_engine")


# ---------- provider factory ----------

def build_storage(s: Settings) -> Storage | None:
    if s.storage == "supabase":
        if not s.supabase_url or not s.supabase_service_key:
            raise RuntimeError("STORAGE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_KEY")
        return SupabaseStorage(s.supabase_url, s.supabase_service_key, s.supabase_bucket)
    if s.storage == "local":
        return LocalStorage(s.static_dir, s.public_base_url)
    return None


def build_trend_provider(s: Settings) -> TrendProvider:
    if s.trend_provider == "mongo":
        if not s.mongodb_uri:
            raise RuntimeError("TREND_PROVIDER=mongo requires MONGODB_URI to be set in .env")
        from app.providers.trends_mongo import TrendsMongoProvider

        return TrendsMongoProvider(s.mongodb_uri, s.mongodb_db, s.trends_collection)
    from app.providers.trends_mock import TrendsMockProvider

    return TrendsMockProvider(s.mock_trends_path)


def build_image_provider(s: Settings, storage: Storage | None) -> ImageProvider:
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
    container.storage = build_storage(s)
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
        # Persist elements + moodboard to MongoDB if configured.
        s = container.settings
        if s.mongodb_uri:
            from app.persistence import save_moodboard
            await save_moodboard(
                moodboard,
                mongodb_uri=s.mongodb_uri,
                db_name=s.mongodb_db,
                moodboards_collection=s.moodboards_collection,
                elements_collection=s.elements_collection,
            )
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


# ---------- element customisation ----------

async def _fetch_element_or_404(element_id: str) -> dict:
    s = container.settings
    if not s.mongodb_uri:
        raise HTTPException(status_code=503, detail="MongoDB not configured")
    from app.persistence import get_element
    doc = await get_element(element_id, s.mongodb_uri, s.mongodb_db, s.elements_collection)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Element not found: {element_id}")
    return doc


async def _save_variant(original: dict, new_url: str, new_prompt: str) -> dict:
    import uuid
    from datetime import datetime, timezone
    from app.persistence import save_element
    s = container.settings
    variant = {
        **{k: v for k, v in original.items() if k != "_id"},
        "element_id": f"elem_{uuid.uuid4().hex[:12]}",
        "url": new_url,
        "prompt": new_prompt,
        "parent_element_id": original["element_id"],
        "created_at": datetime.now(timezone.utc),
    }
    if s.mongodb_uri:
        await save_element(variant, s.mongodb_uri, s.mongodb_db, s.elements_collection)
    return variant


@app.post("/api/element/{element_id}/regenerate", response_model=ElementResponse)
async def regenerate_element(element_id: str, req: RegenerateRequest) -> ElementResponse:
    """Regenerate a tile with color/pattern overrides, preserving the original prompt structure."""
    original = await _fetch_element_or_404(element_id)
    from app import prompts as _prompts
    new_prompt = _prompts.swap_prompt_descriptors(
        original["prompt"], color=req.color, pattern=req.pattern
    )
    url = await container.image_provider.generate(new_prompt, aspect_ratio="1:1")
    if container.storage:
        url = await container.storage.localize(url)
    variant = await _save_variant(original, url, new_prompt)
    return ElementResponse(
        element_id=variant["element_id"],
        kind=variant["kind"],
        url=variant["url"],
        prompt=variant["prompt"],
        moodboard_id=variant["moodboard_id"],
    )


@app.post("/api/element/{element_id}/edit", response_model=ElementResponse)
async def edit_element(element_id: str, req: EditRequest) -> ElementResponse:
    """Edit a tile in-place: apply color/pattern/fabric changes to the existing image."""
    if not req.color and not req.pattern and not req.fabric:
        raise HTTPException(status_code=422, detail="Provide at least one of: color, pattern, fabric")
    original = await _fetch_element_or_404(element_id)
    from app import prompts as _prompts
    from app.providers.image_gemini_edit import GeminiImageEditProvider
    s = container.settings
    if not s.gemini_api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")
    editor = GeminiImageEditProvider(s.gemini_api_key, s.gemini_image_model)
    instruction = _prompts.build_edit_instruction(req.color, req.pattern, req.fabric)
    image_bytes, mime_type = await editor.edit(original["url"], instruction)
    # Upload edited image bytes directly to storage.
    suffix = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}.get(mime_type, ".png")
    if container.storage:
        import hashlib
        key = hashlib.sha1(instruction.encode()).hexdigest()[:16] + suffix
        if hasattr(container.storage, "save_bytes"):
            url = container.storage.save_bytes(image_bytes, suffix, key=key)
        else:
            import base64
            data_url = f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"
            url = await container.storage.localize(data_url)
    else:
        import base64
        url = f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"
    edit_prompt = f"{original['prompt']} [edited: {instruction}]"
    variant = await _save_variant(original, url, edit_prompt)
    return ElementResponse(
        element_id=variant["element_id"],
        kind=variant["kind"],
        url=variant["url"],
        prompt=variant["prompt"],
        moodboard_id=variant["moodboard_id"],
    )


@app.post("/api/element/{element_id}/apply-texture", response_model=ElementResponse)
async def apply_texture(element_id: str, req: ApplyTextureRequest) -> ElementResponse:
    """Apply the exact visual texture/pattern from a source tile onto a target outfit image.

    target  = the hero/styling image to modify  (element_id in the path)
    source  = the pattern/texture/fabric tile to apply  (source_element_id in body)

    Both images are sent to Gemini together. Gemini transfers the surface appearance
    of the source tile onto the garment in the target image, preserving pose and background.
    """
    target = await _fetch_element_or_404(element_id)
    source = await _fetch_element_or_404(req.source_element_id)

    s = container.settings
    if not s.gemini_api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")

    from app.providers.image_gemini_edit import GeminiImageEditProvider
    editor = GeminiImageEditProvider(s.gemini_api_key, s.gemini_image_model)

    image_bytes, mime_type = await editor.apply_texture(
        target_url=target["url"],
        texture_url=source["url"],
        texture_kind=source["kind"],   # "pattern", "texture", "colorway" etc.
    )

    suffix = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}.get(mime_type, ".png")
    if container.storage:
        import base64
        data_url = f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"
        url = await container.storage.localize(data_url)
    else:
        import base64
        url = f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"

    new_prompt = (
        f"{target['prompt']} "
        f"[texture applied from element {source['element_id']} ({source['kind']})]"
    )
    variant = await _save_variant(target, url, new_prompt)
    return ElementResponse(
        element_id=variant["element_id"],
        kind=variant["kind"],
        url=variant["url"],
        prompt=variant["prompt"],
        moodboard_id=variant["moodboard_id"],
    )
