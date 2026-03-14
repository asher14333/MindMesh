.PHONY: backend api

# Run FastAPI backend (from repo root)
backend api:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0
