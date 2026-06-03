# Architecture

## Purpose

Local Learning Engine is a local-first learning application for studying YAML-backed course content, taking tests, tracking learner progress, and administering content and users.

## Tech stack

- Backend: Python, FastAPI, SQLModel, SQLite
- Frontend: React 18, TypeScript, Vite
- Content: YAML packages in `packages/`
- Validation: Pydantic on backend, Zod on frontend
- Testing: pytest, Playwright, axe-core Playwright checks
- Linting: Ruff, Biome

## Main structure

- `backend/app/main.py` — FastAPI entry point and startup wiring
- `backend/app/models/` — SQLModel and Pydantic models
- `backend/app/routers/` — HTTP route handlers
- `backend/app/services/` — package loading, settings, DB, security, AI helpers
- `backend/tests/` — backend tests
- `frontend/src/components/` — reusable UI pieces
- `frontend/src/context/` — React context providers
- `frontend/src/hooks/` — app hooks
- `frontend/src/pages/` — routed screens
- `frontend/src/services/` — frontend API client layer
- `frontend/tests/e2e/` — Playwright coverage
- `packages/` — editable learning packages

## Likely patterns in use

- FastAPI router + service helper split
- Startup-loaded package cache in backend app state
- React routed SPA
- Hook/context-based frontend state
- Centralised API client module
- Admin routes separated from learner routes

## Data and runtime flow

- Frontend calls FastAPI over JSON
- Backend loads package YAML from disk
- Backend persists user state in SQLite
- Admin-only AI generation/refresh uses optional external provider configuration

## Areas requiring care

- `frontend/src/services/api.ts` is large and tightly coupled
- SQLite schema compatibility is handled manually in code
- Documentation exists in both legacy upper-case and newer lower-case files
- Admin and AI flows have broader blast radius than learner-facing changes
- Generated artefacts exist locally and should not be edited or committed

## Related docs

- `docs/adr/0001-initial-architecture.md`
- `docs/known-issues.md`
- Legacy reference: `docs/ARCHITECTURE.md`
