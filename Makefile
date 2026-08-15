SHELL := /bin/bash
DECON_VENV := Deconstruction Engine/.venv
TREND_VENV := Trend Analysis Engine/.venv

.PHONY: deconstruction-engine deconstruction-engine-install trend-engine trend-engine-install backend ui api-refresh

deconstruction-engine-install:
	@if [ ! -x "$(DECON_VENV)/bin/python3" ] || ! "$(DECON_VENV)/bin/python3" -c "" >/dev/null 2>&1; then \
		rm -rf "$(DECON_VENV)"; \
		python3 -m venv "$(DECON_VENV)"; \
	fi
	"$(DECON_VENV)/bin/pip" install -r "Deconstruction Engine/requirements.txt"

deconstruction-engine: deconstruction-engine-install
	cd "Deconstruction Engine" && . .venv/bin/activate && uvicorn src.api.app:app --reload --port 8001

trend-engine-install:
	@if [ ! -x "$(TREND_VENV)/bin/python3" ] || ! "$(TREND_VENV)/bin/python3" -c "" >/dev/null 2>&1; then \
		rm -rf "$(TREND_VENV)"; \
		python3 -m venv "$(TREND_VENV)"; \
	fi
	"$(TREND_VENV)/bin/pip" install -r "Trend Analysis Engine/requirements.txt"

trend-engine: trend-engine-install
	cd "Trend Analysis Engine" && . .venv/bin/activate && uvicorn trend_engine.api.app:app --reload --port 8002

backend:
	cd backend && npm run dev

ui:
	cd ui && npm run dev

api-refresh:
	cd backend && npm run openapi && \
	cp openapi/openapi.json ../ui/openapi/openapi.json && \
	cd ../ui && npx orval
