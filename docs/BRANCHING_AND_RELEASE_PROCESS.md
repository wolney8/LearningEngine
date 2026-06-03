# Branching and Release Process

## 1. Branching strategy

- Never commit directly to `main`.
- Create one branch per logical feature or fix.
- Preferred naming: `feature/<short-description>` or `fix/<short-description>`.
- Keep branch names lowercase and hyphen-separated.

## 2. Commit format

Use Conventional Commits:

```text
<type>(<scope>): <summary>
```

Examples:
- `docs(workflow): add Codex playbooks`
- `fix(admin): prevent deleting active admin`

Types in use:
- `feat`
- `fix`
- `docs`
- `refactor`
- `test`
- `chore`
- `style`

## 3. Pull request process

1. Push the branch to the remote.
2. Open a PR with a Conventional Commits title.
3. Link the relevant issue if one exists.
4. User reviews and approves.
5. Merge to `main`.

## 4. Review gates before merge

- Code quality checks pass
- Relevant tests pass
- Accessibility review for frontend-impacting changes
- No secrets or generated artefacts are included
- Scope matches the intended change

## 5. Release process

- Releases are tagged from `main`.
- Tag format: `v<major>.<minor>.<patch>`.
- Update `CHANGELOG.md` before tagging.

## 6. Notes

- Tool-assisted PR and merge automation depends on the active environment.
- To confirm: whether merge remains strictly user-driven in every environment.
