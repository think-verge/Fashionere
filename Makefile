.PHONY: agent backend ui api-refresh

agent:
	cd agent && uvicorn app.main:app --reload --port 8001

backend:
	cd backend && npm run dev

ui:
	cd ui && npm run dev

api-refresh:
	cd backend && npm run openapi && \
	cp openapi/openapi.json ../ui/openapi/openapi.json && \
	cd ../ui && npx orval
