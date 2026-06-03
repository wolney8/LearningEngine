# Engineering Standards

This document defines working rules for contributors and coding agents in the Local Learning Engine project.

## 1. Branching

- Never commit directly to `main`.
- Use one branch per logical feature or fix.
- Keep branch names lowercase and hyphen-separated.

## 2. Commits

- Prefer small, reviewable commits.
- Use Conventional Commits.
- Keep unrelated changes out of the same commit.

## 3. Pull requests

- One PR per logical change set.
- User approval is required before merge unless the working environment explicitly delegates merge authority.
- Do not assume GitHub automation is available in every tool environment.

## 4. What not to commit

- Secrets or `.env` files
- Build artefacts and caches
- Local database files
- Dependency directories such as `node_modules/` or `.venv/`

## 5. Code quality

Backend checks inferred from config:

```bash
cd backend
ruff check .
pytest
```

Frontend checks inferred from config:

```bash
cd frontend
pnpm exec biome check src/
pnpm exec tsc --noEmit
pnpm exec playwright test
```

## 6. Testing expectations

- New behaviour should update the nearest relevant tests.
- Bug fixes should ideally include a focused regression check.
- Start with narrow checks before broad suites.

## 7. Security

- Do not hard-code credentials or tokens.
- Treat admin, auth, and AI paths as high-care areas.
- Review diffs for generated files and accidental secret exposure.

## 8. Documentation

- Update docs when behaviour, workflow, or commands change.
- Mark uncertainty as `To confirm`.
- Keep practical guidance concise.

## 9. Accessibility

- Treat WCAG 2.2 AA as the baseline target.
- Review interactive frontend changes for keyboard and focus behaviour.
