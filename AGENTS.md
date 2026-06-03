# Codex Working Guide

Use Codex as a disciplined single-agent workflow for this repository.

## Start here

Before any non-trivial change:
1. Restate the task briefly.
2. Check `git status` and current branch.
3. Inspect the relevant files before proposing edits.
4. Make a short plan.
5. Identify risks or unknowns.

## Default cadence

Work in this order:
- analyse
- plan
- implement
- review
- test
- summarise

## Hard rules

- Do not edit files before inspecting the relevant code or docs.
- Do not silently overwrite unexpected user changes.
- Keep changes small and reviewable.
- Preserve existing architecture unless explicitly asked to refactor.
- Run relevant checks where available.
- Review `git diff` before finishing.
- Flag uncertainty as `To confirm` rather than guessing.

## Required checks

Before editing:
- `git status --short --branch`

After editing:
- review the diff
- run the most relevant lint/test/type-check commands available
- report anything not run and why

## Supporting docs

Use these alongside the codebase:
- `docs/architecture.md`
- `docs/coding-standards.md`
- `docs/known-issues.md`
- `docs/roadmap.md`
- `docs/playbooks/working-cadence.md`
- `docs/playbooks/git-safety.md`
- `docs/playbooks/testing-and-validation.md`
- `docs/playbooks/feature-development.md`
- `docs/playbooks/bug-fix.md`
- `docs/adr/0001-initial-architecture.md`
- `docs/research/codex-workflow-findings.md`

## Final response

End each substantive task with:
- files changed
- why they changed
- checks run
- risks, follow-up items, or `To confirm`
