---
name: task-board
description: "Use when managing project tasks, mapping cross-module dependencies, creating GitHub issues from a plan, updating project boards, tracking phase completion, or identifying blocked work items."
---
# Task Board and Dependency Tracking

## When to Use
- Planning a multi-phase implementation and needing to track what blocks what
- Creating GitHub issues from an Orchestrator or Planner output
- Reporting phase completion status back to the user
- Mapping which modules depend on shared interfaces or outputs from other tasks

## Procedure

### 1. Map Tasks and Dependencies
For each task in the plan, record:
- **ID**: short identifier (e.g. `T1`, `T2`)
- **Description**: one sentence
- **Depends on**: list of IDs that must complete first
- **Assignee**: which agent or role handles it
- **Files touched**: paths affected

Output as a dependency table before execution begins.

### 2. Identify Blockers
- A task is **blocked** if any dependency is incomplete or has an open question.
- A task is **ready** if all dependencies are resolved.
- Escalate persistent blockers to the user before proceeding.

### 3. Create GitHub Issues (when `github/*` is available)
For each task, open an issue with:
- Title: `[Phase N] <description>`
- Labels: `phase:N`, `status:ready` or `status:blocked`
- Body: dependencies listed as `Depends on: #<issue-number>`
- Milestone: map to the current sprint or release

### 4. Track In-Session Progress
Use the `todo` tool to mirror task state during the session:
- Mark tasks `in-progress` as agents begin work
- Mark `completed` immediately when an agent confirms done
- Never batch completions

### 5. Report Status
Before each new phase, output:
```
## Phase N Status
Ready:   T3, T4
Blocked: T5 (waiting on T3)
Done:    T1, T2
```
