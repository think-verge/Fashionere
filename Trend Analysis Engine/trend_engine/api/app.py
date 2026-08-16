"""Trend Analysis Engine live-generation API (Flow 2: single-brand report).

    cd "Trend Analysis Engine"
    python3 -m uvicorn trend_engine.api.app:app --reload --port 8002
    # docs at http://localhost:8002/docs
"""
from __future__ import annotations

from dotenv import load_dotenv

# trend_engine.config already calls load_dotenv() on import, but call it here
# too (defensive, matches the Deconstruction Engine's app.py) so env vars are
# guaranteed loaded before anything else in this module's import chain runs.
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router

app = FastAPI(title="Fashionairre Trend Analysis API", version="1.0",
              description="Generates and narrates brand trend reports (Flow 2 / "
                          "'overall' scope) and persists them to trend_sheets.")

# open CORS for local frontend dev; tighten allow_origins for production —
# Node is the sole intended caller, matching the Deconstruction Engine precedent.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False,
                   allow_methods=["GET", "POST"], allow_headers=["*"])

app.include_router(router)


@app.get("/")
def root():
    return {
        "service": "trend-analysis-api",
        "endpoints": {
            "generate_stream": "POST /api/generate/stream",
            "docs": "/docs",
        },
    }
