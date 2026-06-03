# Testing and Validation

## Backend

From `backend/`:

```bash
ruff check .
pytest
```

Use narrower backend checks first when possible, for example:

```bash
pytest tests/<target_file>.py
```

## Frontend

From `frontend/`:

```bash
pnpm exec biome check src/
pnpm exec tsc --noEmit
pnpm exec playwright test
```

For local development:

```bash
pnpm dev
```

## Full local run

Backend:

```bash
uvicorn app.main:app --reload
```

Frontend:

```bash
pnpm dev
```

## Guidance

- Start with the narrowest useful check.
- If a check is skipped, say why.
- Do not fix unrelated failures unless the user asks.
- Treat accessibility-sensitive UI changes with extra care.
