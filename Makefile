SHELL := /bin/bash
AGENT_VENV := agent/.venv
DECON_VENV := Deconstruction\ Engine/.venv
APP_API_VENV := Trend\ Analysis\ Engine/.venv

.PHONY: agent agent-install backend ui api-refresh install deconstruction-engine app_api

agent-install:
	test -d $(AGENT_VENV) || python3 -m venv $(AGENT_VENV)
	$(AGENT_VENV)/bin/pip install -r agent/requirements.txt

agent: agent-install
	cd agent && . .venv/bin/activate && uvicorn app.main:app --reload --port 8001

deconstruction-engine:
	cd "Deconstruction Engine" && \
	  test -d .venv || python3 -m venv .venv && \
	  . .venv/bin/activate && \
	  pip install -q -r requirements.txt && \
	  uvicorn src.api.app:app --reload --port 8002

app_api:
	PYTHONPATH=core:. "Trend Analysis Engine/.venv/bin/python3" -m uvicorn app_api.main:app --reload --port 8001

install:
	cd backend && npm install
	cd ui && npm install

backend:
	cd backend && npm run dev

ui:
	cd ui && npm run dev

api-refresh:
	cd backend && npm run openapi && \
	cp openapi/openapi.json ../ui/openapi/openapi.json && \
	cd ../ui && npm run api:refresh
