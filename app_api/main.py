"""Fashionere App API — FastAPI entry.

    cd Fashionairre
    PYTHONPATH=core:. python3 -m uvicorn app_api.main:app --reload --port 8001
    # docs at http://localhost:8001/docs
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import canonical_looks, deconstructions
from .routes.assets import router as assets_router
from .routes.looks import router as looks_router
from .routes.tags import router as tags_router, brands_router
from .routes.trends import router as trends_router

app = FastAPI(
    title="Fashionere App API",
    version="0.1.0",
    description="Read-only unified card API — canonical_looks + deconstructions.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(looks_router, prefix="/api/v1")
app.include_router(tags_router, prefix="/api/v1")
app.include_router(brands_router, prefix="/api/v1")
app.include_router(trends_router, prefix="/api/v1")
app.include_router(assets_router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "service": "fashionere-app-api",
        "version": "0.1.0",
        "endpoints": {
            "docs": "/docs",
            "browse": "/api/v1/looks",
            "detail": "/api/v1/looks/{look_id}",
            "similar": "/api/v1/looks/{look_id}/similar",
            "brands": "/api/v1/brands",
            "tag_values": "/api/v1/tags/{dimension}",
            "tag_looks": "/api/v1/tags/{dimension}/{value}/looks",
            "trend": "/api/v1/trends/{dimension}/{value}",
            "asset": "/api/v1/assets/{gridfs_id}",
        },
    }


@app.get("/api/v1/health")
def health():
    try:
        total = canonical_looks().estimated_document_count()
        decon = deconstructions().estimated_document_count()
        return {"status": "ok", "canonical_looks": total, "deconstructions": decon}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}
