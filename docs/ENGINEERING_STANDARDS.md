# ENGINEERING STANDARDS

This document defines mandatory engineering rules for all agents and contributors in the Local Learning Engine project.

## 1. Branching

- Never commit directly to `main`.
- One branch per phase or logical feature: `feature/<phase>-<short-description>` or `fix/<task-id>-<short-description>`.
- Branch names must be lowercase and hyphen-separated.
- The first working branch for this project is `project-initialisation`.

## 2. Commits

- Commit once per phase, after all quality gates and tests pass.
- Use Conventional Commits format:
  - `feat(<scope>): <summary>` - new behaviour
  - `fix(<scope>): <summary>` - bug fix
  - `refactor(<scope>): <summary>` - restructure, no behaviour change
  - `test(<scope>): <summary>` - adding or updating tests
  - `docs(<scope>): <summary>` - documentation only
  - `chore(<scope>): <summary>` - build, config, dependencies
  - `style(<scope>): <summary>` - formatting only
- Summary must use imperative mood and be 72 characters or fewer.
- Reference task ID in the commit body: `Relates to T3`.

## 3. Pull requests

- One PR per phase or feature branch.
- PR title must match Conventional Commits format.
- Include `Closes #N` in the PR description to auto-close the linked issue on merge.
- User approves and merges; agents do not self-merge.
- Squash-merge into `main`.

## 4. What never to commit

- `.env` files or any file containing secrets, tokens, or API keys.
- Build artefacts: `dist/`, `build/`, `__pycache__/`, `.next/`.
- IDE or OS files: `.DS_Store`, `.idea/`.
- Lockfiles without a corresponding manifest change.

## 5. Code quality gates (mandatory before any commit)

- Backend: `ruff check backend/` must return exit code 0.
- Frontend: `biome check frontend/src/` must return exit code 0; `tsc --noEmit` must pass.
- Maximum 3 remediation iterations per phase before escalating to the user.

## 6. Testing requirements

| Work type              | Minimum coverage                                                         |
| ---------------------- | ------------------------------------------------------------------------ |
| New function or module | Unit tests for all exported functions - happy path + one error/edge case |
| Modified function      | Tests for changed behaviour only                                         |
| UI component           | Click, keyboard navigation, form submission (Playwright)                 |
| API endpoint           | Request/response contract + one error-path test                          |
| Integration change     | One end-to-end test covering the primary user journey                    |

## 7. Security

- Run `pip-audit` before any Python dependency change is merged.
- Run `npm audit --audit-level=high` (or pnpm equivalent) before any frontend dependency change is merged.
- No hard-coded credentials, API keys, or secrets in source files.
- OWASP Top 10 patterns must not be introduced.

## 8. Comments and documentation

Comments must explain:

- Intent or why a decision was made.
- Business rules and scoring logic.
- Accessibility decisions.
- Non-obvious or counterintuitive code.

Do not comment:

- Obvious code (for example, `# increment counter`).
- What the code already says clearly.

Inline documentation (docstrings, JSDoc) is required for all exported functions, classes, and API route handlers.

## 9. Accessibility (brief, see docs/ACCESSIBILITY_STANDARD.md for detail)

- All frontend changes require an accessibility review gate before the phase is closed.
- WCAG 2.2 AA is the mandatory minimum.
- No PR touching frontend source files may be merged without Designer sign-off.

## 10. Linting configuration

- **Python**: Ruff, line length 88, rules E/W/F/I, isort enabled - config in `backend/pyproject.toml`.
- **Frontend**: Biome, indent width 2, double quotes, semicolons - config in `frontend/biome.json`.
- **CI**: Both linters run on every PR.

## 11. Environment variables

- Backend: configure via environment variables with sensible defaults (for example, `PACKAGES_DIR=packages/`, `PORT=8000`).
- Frontend: configure via `.env` files (`.env.local` for local overrides, never committed); use `VITE_` prefix.
- Document every environment variable in a section of the README.
