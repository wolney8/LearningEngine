---
description: "Use when designing multi-agent systems, orchestration workflows, agent pipelines, subagent delegation, parallel task execution, or fan-out/gather patterns."
---

# Multi-Agent Orchestration

## Architecture Patterns

- **Orchestrator–worker**: one coordinating agent decomposes the task and delegates to specialised workers; workers return structured results.
- **Fan-out / gather**: launch independent subtasks in parallel, aggregate results before proceeding.
- **Sequential chain**: output of one agent becomes the input of the next; use only when strict ordering is required.
- **Hierarchical**: limit nesting to 2–3 levels; deeper trees increase latency and error propagation.

## Context Isolation

- Each subagent receives only the context it needs — avoid passing the full conversation history.
- Subagents communicate via structured outputs (typed objects or JSON), not free-form prose.
- Never share mutable state directly between agents; use explicit handoffs.

## Tool Restrictions

- Assign the minimal tool set required for each agent's role.
- Restrict write/destructive tools to the single agent responsible for side effects.
- Read-only exploration agents must not invoke write or shell tools.

## Reliability

- Design each agent to be idempotent where possible.
- Include a fallback or retry strategy at the orchestrator level, not inside workers.
- Surface errors explicitly through structured error fields rather than silent failures.

## Agent Failure Recovery

When a subagent returns an empty response, an unhandled error, or output that does not match the assigned task:

1. **Retry once** with the identical input — transient failures are common.
2. **Decompose** — if the retry fails, break the task into smaller subtasks and delegate each independently.
3. **Escalate** — if decomposition does not resolve the failure after one further attempt, halt and report to the user:
   - Which agent failed and on which task
   - What input was provided
   - What error or missing output was returned
   - A suggested next step (manual intervention or task reformulation)

Never silently substitute a different agent for the intended one, or proceed as if the task completed, without informing the user.

## Single Responsibility

- One concern per agent where possible.
- The deliberate exception in this scaffold: the Coder **executes** tests as a coupled pre-submission step, while the Orchestrator independently **evaluates** results — providing logical separation without an additional agent.
- If an agent's description covers more than one domain beyond this sanctioned exception, split it.
