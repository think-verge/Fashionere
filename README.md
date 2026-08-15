# Fashionare

An AI-assisted fashion platform: a canonical runway-look dataset feeding two
Python engines (**trend analysis**, **look deconstruction**), surfaced through
an Express API and a React UI.

## Layout

```
backend/                  Express + TypeScript API, port 8000 (MongoDB + JWT auth)
ui/                        React + Vite + TypeScript, port 5173 (Orval-generated API client)
core/                      Shared canonical `Look` schema + Mongo adapters (Python)
Trend Analysis Engine/     Per-brand recency-weighted trend sheets (Python, batch/CLI)
Deconstruction Engine/     Per-garment color/fabric/pattern/sketch extraction (Python, read API on :8001)
```

`backend/` is the single authenticated entry point the UI talks to. It proxies
the Deconstruction Engine's read-only FastAPI and reads the Trend Analysis
Engine's output directly out of MongoDB (`Fashionere.trend_sheets`) — neither
Python engine is exposed to the browser directly. See `PROJECT_STATUS.md` for
the full data pipeline (`Raw Data` → `canonical_looks` → trend sheets /
deconstructions) and engine-specific docs in each engine's own README/DESIGN.

## Quick start

```bash
# 1. Deconstruction Engine (reads Fashionere.deconstructions + GridFS)
make deconstruction-engine        # installs its venv, runs uvicorn on :8001

# 2. Backend API
cd backend && cp .env.example .env && npm install && npm run dev   # :8000

# 3. UI
cd ui && npm install && npm run dev                                 # :5173
```

The Trend Analysis Engine has no server — it's run as a batch job that writes
straight to Mongo:

```bash
cd "Trend Analysis Engine"
python -m trend_engine.canonical.build_sheets --env .env --brand prada
```

## Regenerating the API client

Whenever `backend/src/schemas/index.ts` changes:

```bash
make api-refresh   # backend openapi export -> copies spec into ui/ -> orval codegen
```

## Env vars (backend)

| Var | Purpose |
|---|---|
| `MONGODB_URI` | backend-owned data (users, projects) — database `centoire` |
| `FASHIONAIRRE_MONGO_URI` | read-only access to the engines' data — database `Fashionere` |
| `DECONSTRUCTION_ENGINE_URL` | base URL of the Deconstruction Engine's FastAPI (default `http://localhost:8001`) |
| `JWT_SECRET`, `CLIENT_ORIGIN` | auth + CORS |
