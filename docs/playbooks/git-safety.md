# Git Safety

## Before editing

Run:

```bash
git status --short --branch
```

Check:
- current branch
- uncommitted changes
- untracked files that may be relevant

## During work

- Do not overwrite unexpected changes.
- Keep scope tight.
- Avoid broad formatting passes unless requested.

## Before finishing

Run and review:

```bash
git diff --stat
git diff
```

Check:
- only intended files changed
- no generated artefacts were touched
- formatting-only changes are not mixed in without reason

## Do not commit

Do not edit or commit these generated/runtime paths unless explicitly required:
- `backend/.venv/`
- `backend/.pytest_cache/`
- `backend/.ruff_cache/`
- `backend/app/__pycache__/`
- `backend/tests/__pycache__/`
- `frontend/node_modules/`
- `frontend/dist/`
- `frontend/.pytest_cache/`
- `frontend/playwright-report/`
- `frontend/test-results/`
- `backend/data/lle.db`
