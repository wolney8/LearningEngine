---
description: "Use when committing code, creating feature branches, writing commit messages, opening pull requests, or managing git history in any workflow."
---

# Git Workflow

## Branching

- Create one branch per phase or logical feature: `feature/<task-id>-<short-description>` or `fix/<task-id>-<short-description>`.
- Branch from `main` (or the project's declared primary branch). Never commit directly to `main`.
- Keep branch names lowercase and hyphen-separated.

## When to Commit

- Commit **once per phase**, after all quality gates and tests have passed for that phase.
- Never commit mid-phase or during remediation iterations.
- One logical change per commit — do not bundle unrelated fixes in a single commit.

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary in imperative mood>
```

| Type       | Use for                                           |
| ---------- | ------------------------------------------------- |
| `feat`     | New feature or behaviour                          |
| `fix`      | Bug fix                                           |
| `refactor` | Code restructure with no behaviour change         |
| `test`     | Adding or updating tests                          |
| `docs`     | Documentation changes only                        |
| `chore`    | Build scripts, dependency updates, config changes |
| `style`    | Formatting only — no logic change                 |

Example: `feat(auth): add JWT refresh token rotation`

- Summary must be 72 characters or fewer.
- Use imperative mood: "add", not "added" or "adds".
- Reference the related task ID in the body if one exists: `Relates to T3`.

## What Never to Commit

- `.env` files or any file containing secrets, tokens, or API keys
- Build outputs or compiled artefacts (`dist/`, `build/`, `__pycache__/`, `.next/`, etc.)
- Lockfiles without a corresponding dependency change in the manifest
- IDE or OS-specific files (`.DS_Store`, `.idea/`) unless intentionally shared via `.gitignore` exceptions
- Files outside the current phase's agreed scope (the Coder must verify this via `git diff --stat`)

## Pull Requests

- Open one PR per phase or logical feature branch.
- PR title must match the Conventional Commits format.
- Include `Closes #N` in the PR description to auto-link and close the relevant GitHub issue on merge.
- The Orchestrator flags the PR for user review. **The user approves and merges** — agents do not self-merge.
- Squash-merge feature branches into `main` to keep history linear.

## Coder Commit Responsibility

Before committing, the Coder must confirm:

1. `git diff --stat` shows only files within the current phase's scope.
2. All gate and test results are PASSED (no mid-remediation commits).
3. No files from the "What Never to Commit" list appear in the diff.

If any of these conditions fail, do not commit — raise a Blocking finding to the Orchestrator.
