---
description: "Use when coordinating multi-agent workflows that include code generation, enforcing review gates after code changes, running code quality or accessibility validation, or managing remediation loops. Defines the mandatory halt-and-review cycle the Orchestrator must follow after any Coder task."
---
# Review & Quality Gates

## Scope
Every workflow in which the Coder agent modifies or creates files is subject to this loop. The Orchestrator owns enforcement — the Coder must **never** self-approve phase completion.

---

## Rule 1 — HALT After Code Changes

After the Coder returns from any code-producing task, the Orchestrator MUST:

1. **Halt further generation** — do not proceed to the next phase, task, or parallel branch.
2. **Declare a Review Phase** explicitly in the progress report.
3. Run both quality gates (§ Gate 1 and § Gate 2) before resuming.

> In parallel phases: if any parallel task produced code, the entire phase pauses at completion and all gates run before the next phase begins.

---

## Rule 2 — Gate Sequence

Gates run **in this order**. Both must pass; they cannot run concurrently.

### Gate 1 — Code Quality

| | |
|---|---|
| **Executor** | Coder agent |
| **Method** | Invoke the `#lint-and-analyse` skill against every file modified in the current phase |
| **Pass** | Zero blocking lint errors; type checker returns no errors after auto-fix |
| **Fail** | Any blocking lint error or type error persists after auto-fix |

### Gate 2 — Accessibility Compliance

| | |
|---|---|
| **Executor** | Coder agent |
| **Applicability** | Only when modified files include frontend code (HTML, JSX/TSX, templates, CSS affecting layout or colour) |
| **Method** | Use the Context7 MCP server to fetch current WCAG 2.2 success criteria for each modified component or pattern — query: `use context7` → search `"WCAG 2.2 <component or criterion name>"`. Validate each component against the returned criteria. |
| **Compliance target** | WCAG 2.2 Level AA minimum. For criteria, POUR principles, and the new SC table, refer to `wcag-accessibility.instructions.md` — do not duplicate them here. |
| **Pass** | All relevant AA success criteria are met for every modified component |
| **Fail** | Any AA violation is identified |
| **Not applicable** | No frontend files modified — record as "N/A" and proceed |

---

## Rule 3 — Remediation Loop

When either gate fails, execute this loop:

1. **Raise a structured finding** containing:
   - Which gate failed (Code Quality / Accessibility)
   - The specific file(s) and rule(s) violated
2. **Delegate to the Coder** with the finding as the sole input. The Coder addresses only the flagged items — no new features or unrelated changes.
3. **Re-run Gate 1 then Gate 2** after the Coder returns, regardless of which gate originally failed.
4. Repeat until both gates pass or the iteration cap is reached.

### Iteration Cap

- **Maximum 3 remediation iterations** per phase.
- If both gates have not passed after 3 iterations, **halt immediately and escalate to the user** with a structured report:
  - Which gate failed
  - Which files are affected
  - Remaining violations listed verbatim
- **Do not proceed** to the next phase under any circumstances until gates pass or the user explicitly overrides.

---

## Rule 4 — Gate Ownership

| Role | Responsibility |
|---|---|
| **Orchestrator** | Initiates each gate, evaluates pass/fail, tracks iteration count, escalates if cap is hit |
| **Coder** | Executes `#lint-and-analyse`, runs Context7 WCAG lookup, implements fixes |
| **Neither agent** | Self-approves gate passage — only the Orchestrator records a gate as passed |

---

## Rule 5 — Phase Completion Report

Once both gates pass, include a gate summary in the phase completion report before starting the next phase:

```
Gate 1 (Code Quality): PASSED — N issues auto-fixed, 0 remaining
Gate 2 (Accessibility): PASSED / NOT APPLICABLE
```

If a gate triggered remediation, note the iteration count: `PASSED after 2 iterations`.
