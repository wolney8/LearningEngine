# Ultralight Multi-Agent Scaffold

A stack-agnostic scaffold for multi-agent AI workflows in VS Code Copilot. Pull this into any project and the orchestration system, review gates, testing feedback loop, and accessibility standards apply immediately.

---

## Stack Declaration

Fill this in when adopting this scaffold for a specific project. Agents read this section before starting any task. If a field is blank, agents detect the toolchain from config files at runtime.

```
Language:        # e.g. TypeScript, Python, Go
Framework:       # e.g. Next.js, FastAPI, Gin
Frontend:        # e.g. React (JSX/TSX), Vue (SFC), Jinja2, None
Test runner:     # e.g. Vitest, Jest, pytest, go test
Linter:          # e.g. ESLint + Biome, Ruff, golangci-lint
Package manager: # e.g. pnpm, poetry, go modules
```

## Build, Test, and Lint Commands

Fill these in once the project's tooling is configured.

```
build:
test:
lint:
```

## Architecture

No source files yet — update this section as the project takes shape.

---

## Agent System

| Agent        | Model             | Role                                                                                     |
| ------------ | ----------------- | ---------------------------------------------------------------------------------------- |
| Orchestrator | Claude Sonnet 4.6 | Coordinates phases, enforces review gates, communicates to user                          |
| Planner      | Claude Sonnet 4.6 | Researches codebase, produces phased implementation plans                                |
| Coder        | GPT-5.3-Codex     | Implements code, runs pre-submission lint, writes and runs tests, fixes findings         |
| Designer     | Gemini 3.1 Pro    | UI/UX validation, design token management, WCAG audits, reports findings to Orchestrator |

## Instruction Files

| File                        | Governs                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `response-style`            | UK English spelling and brevity rules                                                             |
| `brand-guidelines`          | Brand colours, typography, logo usage, spacing, and voice and tone (customise per project)        |
| `multi-agent-orchestration` | Architecture patterns, context isolation, tool restrictions, parallelisation                      |
| `wcag-accessibility`        | WCAG 2.2 AA standards, POUR principles, Context7 lookup protocol                                  |
| `review-quality-gates`      | Mandatory halt after code changes, lint gate, accessibility gate, security gate, remediation loop |
| `testing-and-feedback`      | Functional testing, reviewer checklist, structured finding schema, user reports                   |
| `git-workflow`              | Branching strategy, commit message format, PR process, commit scope rules                         |
| `memory-conventions`        | What to persist in agent memory, entry format, pruning rules                                      |

## Workflow

```
You → Orchestrator
        → Planner: research + phased implementation plan
        → Execute phase(s):
            → Coder / Designer (parallel where safe)
        → HALT: Review Phase
            → Gate 1: Code Quality (lint + type check)
            → Gate 2: Accessibility (Context7 + WCAG 2.2 AA)
            → Gate 3: Security (SAST + dependency audit)
            → Testing: functional tests + reviewer checklist
        → Status report → You
```

Repeat per phase. All gates and tests must pass before the next phase begins. Unresolved Blocking findings escalate to the user.

## Key Conventions

- Response style (UK English, brevity): `response-style.instructions.md`
- Agent design and parallelisation: `multi-agent-orchestration.instructions.md`
- WCAG 2.2 criteria and Context7 protocol: `wcag-accessibility.instructions.md`
- Halt-and-review cycle: `review-quality-gates.instructions.md`
- Finding schema and user report format: `testing-and-feedback.instructions.md`
- Git branching, commits, and PR process: `git-workflow.instructions.md`
- Agent memory structure and pruning: `memory-conventions.instructions.md`
