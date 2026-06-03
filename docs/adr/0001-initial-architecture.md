# ADR 0001: Current Working Architecture

## Status

Accepted as a working description of the current repository state.

## Context

The repository contains a Python/FastAPI backend, a React/TypeScript frontend, YAML content packages, SQLite persistence, and a mix of legacy project docs and newer workflow scaffolding.

## Decision

Treat the current architecture as:
- FastAPI backend with router/service split
- SQLModel over SQLite for persisted user/application state
- React SPA frontend with hooks and contexts for app state
- YAML packages as the editable content source of truth
- Ruff, Biome, pytest, and Playwright as the primary validation toolchain

## Consequences

- Backend and frontend changes often require contract awareness on both sides.
- Package-related work may span YAML, backend validation, and frontend rendering.
- Admin workflows should be treated as high-impact changes.
- Manual schema compatibility code should be preserved carefully until migrations are introduced.

## To confirm

- Whether this ADR should supersede the older upper-case architecture docs formally
- Whether future ADRs should cover migrations, API module splitting, and retention rules
