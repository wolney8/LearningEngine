# Coding Standards

## General

- Make the smallest coherent change.
- Follow existing patterns before introducing new ones.
- Do not add dependencies without approval.
- Prefer explicit code over clever abstractions.
- Mark uncertainty as `To confirm`.

## Before editing

- Check `git status --short --branch`.
- Inspect the exact files affected.
- Check for related tests before changing behaviour.

## Python

- Follow the current FastAPI router/service split.
- Keep route handlers thin when existing services already hold logic.
- Use Ruff-compatible formatting and imports.
- Keep changes consistent with `backend/pyproject.toml`.

## Frontend

- Follow current page/component/hook/context separation.
- Reuse existing schemas and API helpers where possible.
- Keep user-facing behaviour explicit; avoid hidden state changes.
- Keep Biome and TypeScript clean.

## Testing

- Add or update the nearest relevant tests for behavioural changes.
- Start with narrow checks, then widen only if needed.
- If tests are not run, say why.

## Documentation

- Update docs when behaviour, commands, or workflow expectations change.
- Keep Codex workflow docs concise and practical.
