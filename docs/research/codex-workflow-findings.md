# Codex Workflow Findings

## Aim

Reproduce a robust multi-phase delivery cadence in Codex without relying on external multi-agent orchestration.

## Working model

Codex works best here as a disciplined single agent using explicit phases:
- analyse
- plan
- implement
- review
- test
- summarise

## Repository-specific findings

- The repo already contains prior Copilot multi-agent scaffolding in `.github/`, but that is not the same as the current Codex tool environment.
- Codex can follow the same operating discipline through local docs and consistent prompts.
- Root `AGENTS.md` is the best place to enforce session-start behaviour.
- Supporting playbooks reduce prompt repetition and make future sessions more consistent.

## Practical constraints observed

- Tool availability may differ from earlier VS Code Copilot or MCP-based sessions.
- GitHub issue/PR automation should not be assumed in Codex unless the current environment clearly exposes it.
- Existing dirty worktrees must be handled cautiously; Codex should not normalise unrelated changes.

## Recommended prompt pattern

Use prompts that specify:
- task goal
- scope boundaries
- whether code changes are allowed
- required checks
- whether to wait for approval before editing

## To confirm

- Whether future sessions should use the new lower-case docs as the canonical guidance set
- Whether the repo should retire or redirect the older duplicated documentation set
