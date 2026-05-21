## 1. Branching strategy

- Never commit directly to `main`
- Create one branch per phase or logical feature
- Naming: `feature/<phase>-<short-description>` or `fix/<task-id>-<short-description>`
- Example branch names:
  - `project-initialisation`
  - `feature/phase-1-scaffolding`
  - `feature/phase-2-data-models`
  - `fix/T14-router-404`

## 2. Commit format (Conventional Commits)

```
<type>(<scope>): <summary in imperative mood>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`

Example: `docs(project): add initial documentation suite`

- Summary: 72 characters or fewer
- Imperative mood: "add", not "added" or "adds"
- Reference task ID in body: `Relates to T1–T3`

## 3. Pull request process

1. Push branch to remote
2. Open PR with a Conventional Commits title
3. Include `Closes #N` to auto-close the related GitHub issue on merge
4. Orchestrator flags the PR for user review
5. User reviews and approves
6. Squash-merge into `main`

**Agents do not self-merge.**

## 4. Review gates (must pass before merge)

1. **Code Quality** — Ruff (Python) and Biome (frontend) exit 0; `tsc --noEmit` passes
2. **Accessibility** — Required on all PRs that touch frontend source files; Designer sign-off required
3. **Security** — `pip-audit` / `pnpm audit` clean; no hard-coded secrets
4. **Testing** — All tests pass; no skipped or suppressed failures
5. **Functional review** — Orchestrator evaluates against the Planner's spec

## 5. Release process

- Releases are tagged from `main` after a set of phases are merged
- Tag format: `v<major>.<minor>.<patch>` (Semantic Versioning)
- Update `CHANGELOG.md` before tagging
- No release process has been executed yet

## 6. CHANGELOG maintenance

- Update `CHANGELOG.md` in every PR that contains a user-visible change
- Follow [Keep a Changelog](https://keepachangelog.com) format
- Sections: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`
- Move items from `[Unreleased]` to a version block on release
