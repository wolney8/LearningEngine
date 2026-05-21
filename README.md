# AgentMatrix

A pull-and-use orchestration scaffold for VS Code + GitHub Copilot. Drop it into any project to get a multi-agent workflow with built-in review gates and a feedback loop.

Uses Copilot Agents, custom instructions, custom skills, MCP server (using Docker MCP for Context7 and GitHub Official) and hooks. Additional setup is required for the Docker MCP Gateway — see [MCP Setup](#mcp-setup--docker-gateway) below.

> Built on [Ultralight Orchestration](https://gist.github.com/burkeholland/0e68481f96e94bbb98134fa6efd00436) by [Burke Holland](https://github.com/burkeholland).

---

## What's Included

### Agents

| Agent            | Model             | Role                                                                               |
| ---------------- | ----------------- | ---------------------------------------------------------------------------------- |
| **Orchestrator** | Claude Sonnet 4.6 | Coordinates all work, enforces review gates, reports to you                        |
| **Planner**      | Claude Sonnet 4.6 | Researches the codebase, produces phased implementation plans                      |
| **Coder**        | GPT-5.3-Codex     | Writes code, runs lint and tests, fixes findings                                   |
| **Designer**     | Gemini 3.1 Pro    | Validates UI against specs and WCAG 2.2, reports deviations as structured findings |

### Instructions

| File                        | Summary                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `response-style`            | UK English, brevity                                                 |
| `brand-guidelines`          | Brand colours, typography, logo, spacing, voice and tone (template) |
| `multi-agent-orchestration` | Architecture patterns and parallelisation                           |
| `wcag-accessibility`        | WCAG 2.2 AA, POUR principles, Context7 lookup                       |
| `review-quality-gates`      | Mandatory halt after code changes, three quality gates              |
| `testing-and-feedback`      | Functional testing and structured findings                          |
| `git-workflow`              | Branching strategy and PR process                                   |
| `memory-conventions`        | Memory format and pruning rules                                     |

### Skills

| Skill              | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `lint-and-analyse` | Detects and runs linters and type checkers               |
| `task-board`       | Tracks task dependencies and creates GitHub issues       |
| `ui-inspect`       | Inspects UI components against design specs and WCAG 2.2 |

### Hooks

Hooks run deterministically at agent lifecycle events. They enforce policy rather than guide it.

| Hook                       | Event        | Blocks?  | Description                                                                          |
| -------------------------- | ------------ | -------- | ------------------------------------------------------------------------------------ |
| `format-on-save`           | PostToolUse  | No       | Runs Prettier on any file the agent edits                                            |
| `lint-on-change`           | PostToolUse  | Yes      | Runs ESLint/Biome (JS/TS) or Ruff/Flake8 (Python) + `tsc --noEmit` after each edit   |
| `vulnerability-check`      | PostToolUse  | No\*     | Runs `npm audit`, `pip-audit`, or `govulncheck` when manifest or lock files change   |
| `scan-secrets`             | PostToolUse  | Yes      | Blocks hardcoded API keys and secret tokens; skips `.env.example` and tests          |
| `block-dangerous-commands` | PreToolUse   | Deny/Ask | Hard-blocks irreversible shell commands; prompts confirmation for risky ones         |
| `session-context`          | SessionStart | No       | Injects branch, last commit, detected stack, and available agents into every session |
| `context-snapshot`         | PreCompact   | No       | Prompts the agent to save a work summary to session memory before context compacts   |

\* Uncomment `exit 2` in `vulnerability-check.sh` to make audit findings blocking.

---

## Quick Start

### Prerequisites

**Required**

- VS Code 1.99 or later with the **GitHub Copilot** extension installed
- A GitHub Copilot subscription with access to multiple models (Claude Sonnet 4.6, GPT-5.3-Codex, Gemini 3.1 Pro)

**VS Code settings to enable** (search in the Settings UI):

- `github.copilot.chat.agent.subagent.enabled` — required for the Orchestrator to spawn subagents
- `github.copilot.chat.agent.memory.enabled` — recommended for override traceability

**Required — Docker Desktop (MCP tools)**
Context7 documentation lookups and GitHub issue integration both run through the Docker MCP Gateway:

- Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 4.40
- Install the **MCP Docker** extension in VS Code from the marketplace

### MCP Setup — Docker Gateway

Both Context7 (library documentation) and GitHub Official (issue management) run through the Docker MCP Gateway. The config is stored at user level and is not included in this repository.

1. Ensure Docker Desktop is running.
2. Open the **MCP Docker** panel in VS Code and create a profile named `mcp_docker_profile_`.
3. Add **Context7** and **GitHub Official** to the profile.
4. For GitHub Official, store your personal access token via **Docker Desktop → Settings → MCP Toolkit → Secrets** under the key `github.personal_access_token`.

**Verify it works:** Ask an agent to look up documentation for any library — it should call `resolve-library-id` then `get-library-docs` automatically.

### Setup

1. Copy the `.github/` folder and `README.md` from this repo into your project root.
2. Open `.github/copilot-instructions.md` and fill in the **Stack Declaration** block with your language, framework, test runner, and linter.
3. Fill in the **Build, Test, and Lint Commands** block once your tooling is configured.
4. If using company branding, open `.github/instructions/brand-guidelines.instructions.md` and replace the `TODO:` placeholders with your brand values.
5. Open a Copilot Chat panel, select the **Orchestrator** agent, and send your first prompt.

---

## How the Workflow Works

```
You → Orchestrator
        → Planner: research + phased implementation plan
        → Execute phase(s):
            → Coder / Designer  (parallel where file scopes allow)
        → HALT: Review Phase:
            → Gate 1: Code Quality  (lint + type check)
            → Gate 2: Accessibility (Context7 + WCAG 2.2 AA)
            → Gate 3: Security      (SAST + dependency audit)
            → Testing:              functional tests + reviewer checklist
        → Status report → You
```

Each phase repeats this loop. All gates and tests must pass before the next phase begins. If a Blocking finding cannot be resolved within 3 iterations, the Orchestrator halts and escalates to you with a full report.

---

## Customising the Scaffold

### Stack

Fill in the **Stack Declaration** in `copilot-instructions.md`. Agents will automatically:

- Detect the linter and type checker from config files (`eslint.config.*`, `tsconfig.json`, `pyproject.toml`, etc.)
- Scope the accessibility gate to the frontend file types you declare
- Use Context7 to fetch current documentation for your chosen libraries and frameworks

### Language

The scaffold defaults to **British English** (colour, behaviour, organise, licence). To switch to **American English** or any other locale:

1. Open `.github/instructions/response-style.instructions.md`.
2. Replace the spelling list and British conventions with your preferred equivalents.

### AI Models

Each agent declares its model in the `model:` frontmatter field. To swap a model, open the relevant `.github/agents/*.agent.md` file and edit that line.

| Agent        | Default model     |
| ------------ | ----------------- |
| Orchestrator | Claude Sonnet 4.6 |
| Planner      | Claude Sonnet 4.6 |
| Coder        | GPT-5.3-Codex     |
| Designer     | Gemini 3.1 Pro    |

### Branding

A brand guidelines template is included at `.github/instructions/brand-guidelines.instructions.md`. The Designer agent reads it when validating UI components and generating design specs. To apply your organisation's brand:

1. Open `.github/instructions/brand-guidelines.instructions.md`.
2. Replace all `TODO:` placeholder values with your brand colours, typography, logo paths, spacing scale, and voice and tone rules.
3. Link your Figma workspace or design system in the Design System Reference table.

If no brand guidelines exist yet, leave the defaults and fill them in incrementally.

### Disabling unused agents

If your project has no frontend UI:

- The Designer agent and Gate 2 (Accessibility) are safely unused — the Orchestrator marks Gate 2 as `NOT APPLICABLE` automatically.
- No files need to be removed; unused agents are simply never called.

---

## Extending the Scaffold

| Want to add              | Where                                         |
| ------------------------ | --------------------------------------------- |
| New agent                | `.github/agents/<name>.agent.md`              |
| New standing instruction | `.github/instructions/<name>.instructions.md` |
| New on-demand skill      | `.github/skills/<name>/SKILL.md`              |

See the [agent-customization skill](https://code.visualstudio.com/docs/copilot/copilot-customization) for guidance on creating effective instruction files.

---

## File Structure

```
.github/
├── copilot-instructions.md          # Stack declaration + workflow overview (edit this first)
├── agents/
│   ├── orchestrator.agent.md
│   ├── planner.agent.md
│   ├── coder.agent.md
│   └── designer.agent.md
├── instructions/
│   ├── response-style.instructions.md           # Edit to change language locale
│   ├── brand-guidelines.instructions.md         # Edit to add your organisation's brand
│   ├── multi-agent-orchestration.instructions.md
│   ├── wcag-accessibility.instructions.md
│   ├── review-quality-gates.instructions.md
│   ├── testing-and-feedback.instructions.md
│   ├── git-workflow.instructions.md
│   └── memory-conventions.instructions.md
├── skills/
│   ├── lint-and-analyse/SKILL.md
│   ├── task-board/SKILL.md
│   └── ui-inspect/SKILL.md
README.md
```
