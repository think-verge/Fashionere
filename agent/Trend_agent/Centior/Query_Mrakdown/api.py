"""
FastAPI endpoint over the trend query engine.

Run (from this folder):
    ..\\venv\\Scripts\\python.exe -m uvicorn api:app --reload --port 8000

Then:
    GET  /health                      -> Mongo status + trend count
    POST /query  {"query": "..."}     -> answer + parsed filter + the trend records used
    POST /query/stream                -> NDJSON: one "meta" line (filter + trends),
                                         then "delta" lines with answer text, then "done"
    Interactive docs at /docs
"""

import json
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import query_engine as qe

app = FastAPI(
    title="Centoire Trend Query API",
    description="Ask questions in natural language; answers are grounded strictly in the trend_records DB.",
    version="1.0.0",
)


class QueryRequest(BaseModel):
    query: str = Field(..., description="Natural-language question, e.g. 'rising color trends for SS26 womenswear'")


@app.get("/health")
def health() -> Dict[str, Any]:
    try:
        collection = qe.get_collection()
        collection.database.client.admin.command("ping")
        return {"status": "ok", "collection": collection.name, "trend_count": collection.estimated_document_count()}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"MongoDB unavailable: {exc}")


@app.post("/query", response_model=qe.QueryResponse)
def query(req: QueryRequest) -> qe.QueryResponse:
    """Full JSON response: the recommendation summary + the trend records + diagnostics."""
    try:
        return qe.answer_query(req.query)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/query/stream")
def query_stream(req: QueryRequest) -> StreamingResponse:
    """Stream NDJSON events: first {"type": "meta", ...} with the query, parsed filter, the
    Mongo filter used and the full trend records (incl. sources), then {"type": "delta",
    "text"} chunks of the answer as it is generated, and finally {"type": "done", "answer"}
    carrying the complete assembled answer."""

    def generate():
        try:
            for event in qe.stream_answer_events(req.query):
                yield json.dumps(event, ensure_ascii=False, default=str) + "\n"
        except Exception as exc:  # noqa: BLE001
            yield json.dumps({"type": "error", "detail": str(exc)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")
