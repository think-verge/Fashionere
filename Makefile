SHELL := /bin/bash
AGENT_VENV := agent/.venv

.PHONY: agent agent-install backend ui api-refresh

agent-install:
	test -d $(AGENT_VENV) || python3 -m venv $(AGENT_VENV)
	$(AGENT_VENV)/bin/pip install -r agent/requirements.txt

agent: agent-install
	cd agent && . .venv/bin/activate && uvicorn app.main:app --reload --port 8001

backend:
	cd backend && npm run dev

ui:
	cd ui && npm run dev

api-refresh:
	cd backend && npm run openapi && \
	cp openapi/openapi.json ../ui/openapi/openapi.json && \
	cd ../ui && npx orval
