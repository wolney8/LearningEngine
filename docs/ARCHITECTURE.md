# Architecture

This document reflects planned architecture. No application code exists yet.

## System overview

The system is a local web application with a React frontend communicating with a FastAPI backend, where the backend loads and validates package content from version-controlled YAML files in packages/.

```text
+-------------------+        HTTP/JSON        +-------------------+        File I/O        +------------------+
| Browser           | <---------------------> | React frontend    | <--------------------> | FastAPI backend  |
| (User)            |       port 5173         | (Vite dev server) |      port 8000         |                  |
+-------------------+                         +-------------------+                         +--------+---------+
                                                                                                      |
                                                                                                      | reads
                                                                                                      v
                                                                                               +--------------+
                                                                                               | packages/    |
                                                                                               | YAML files   |
                                                                                               +--------------+
```

## Backend

- Framework: FastAPI.
- Python version: TBD (to be pinned in backend/.python-version).
- Module structure: app/main.py, app/models/, app/routers/, app/services/.
- Key responsibilities: serve validated package data, run scoring engine, expose REST API.
- Package loading: scan packages/ on startup, validate each YAML via Pydantic, cache in-process.
- Persistence: in-memory only for Phase 1-7; SQLite deferred to a future phase if needed.

## Frontend

- Framework: React 18 + TypeScript.
- Build tool: Vite.
- Routing: React Router v6.
- Schema validation: Zod (mirrors Pydantic models).
- Linting/formatting: Biome.
- State: local component state and React context; no global state library at this stage.

## Content packages

- Format: YAML.
- Location: packages/ directory (editable files, version-controlled).
- Schema: defined in docs/CONTENT_PACKAGE_TEMPLATE.md.
- Validation: Pydantic on backend; Zod schema on frontend.

## API design

- Style: REST, JSON.
- Planned endpoints:
  - GET /health - liveness check.
  - GET /packages - list package summaries.
  - GET /packages/{id} - full package.
  - POST /sessions/submit - score a completed test.
- Error envelope: { "detail": "<message>" } (FastAPI default).

## Testing

- Backend: pytest.
- Frontend: Playwright (end-to-end).
- CI: GitHub Actions (skeleton in Phase 1).

## Open architecture questions

- OA-001: If multiple packages load concurrently, is in-memory caching sufficient or should we use a simple file-watcher?
- OA-002: When SQLite is added, which ORM or query library? (options: SQLAlchemy, SQLModel, raw sqlite3)
