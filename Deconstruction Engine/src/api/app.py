"""Deconstruction Engine read API.

    cd "Deconstruction Engine"
    python3 -m uvicorn src.api.app:app --reload --port 8000
    # docs at http://localhost:8000/docs
"""
from __future__ import annotations

from dotenv import load_dotenv

# Load MONGO_URI (etc.) from .env before anything reads os.environ — this app
# has no other entrypoint that does so (config.py's load_dotenv() is not
# imported here).
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router

app = FastAPI(title="Fashionairre Deconstruction API", version="1.0",
              description="Read-only access to deconstructed runway looks (swatches, "
                          "patterns, technical flats) by look_id.")

# open CORS for local frontend dev; tighten allow_origins for production
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False,
                   allow_methods=["GET"], allow_headers=["*"])

app.include_router(router)


@app.get("/")
def root():
    return {
        "service": "deconstruction-api",
        "endpoints": {
            "list_looks": "/api/looks[?brand=<slug>]",
            "get_look": "/api/looks/{look_id}",
            "get_asset": "/api/assets/{gridfs_id}",
            "docs": "/docs",
        },
    }
