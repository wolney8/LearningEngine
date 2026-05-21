# Local Learning Engine

A local web application for selecting learning packages, studying structured pages, and taking multiple-choice tests. No AI dependency at runtime - AI is used only to help build and maintain the project.

---

## Stack

| Layer                         | Technology                 |
| ----------------------------- | -------------------------- |
| Backend                       | Python, FastAPI            |
| Frontend                      | React 18, TypeScript, Vite |
| Content packages              | YAML                       |
| Backend testing               | pytest                     |
| End-to-end testing            | Playwright                 |
| Python linting                | Ruff                       |
| Frontend linting / formatting | Biome                      |
| Accessibility                 | WCAG 2.2 AA                |

---

## Local Setup

> **Note:** Application code does not exist yet. These are the intended setup commands once scaffolding is complete.

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

API runs on **http://localhost:8000**

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Frontend runs on **http://localhost:5173**

---

## Folder Structure

```
LocalLearningEngine/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models/          # Pydantic data models
│   │   ├── routers/         # FastAPI route handlers
│   │   └── services/        # Business logic (loader, scoring)
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Screen-level components
│   │   ├── schemas/         # Zod schemas
│   │   ├── services/        # API client
│   │   ├── utils/           # Randomisation, scoring helpers
│   │   └── styles/          # CSS design tokens
│   ├── tests/e2e/           # Playwright specs
│   ├── biome.json
│   ├── vite.config.ts
│   └── playwright.config.ts
├── packages/                # YAML learning packages (editable)
├── docs/                    # Project documentation
└── .github/                 # Copilot agents, instructions, workflows
```

---

## Documentation

| File                                                                           | Description                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| [docs/PROJECT_REQUIREMENTS.md](docs/PROJECT_REQUIREMENTS.md)                   | Core requirements, out of scope, open questions        |
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md)                                   | Phased implementation plan (Phases 0-9)                |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                   | System overview, backend/frontend design, API contract |
| [docs/CONTENT_PACKAGE_TEMPLATE.md](docs/CONTENT_PACKAGE_TEMPLATE.md)           | YAML package format with annotated example             |
| [docs/ENGINEERING_STANDARDS.md](docs/ENGINEERING_STANDARDS.md)                 | Branching, commits, linting, testing, security         |
| [docs/ACCESSIBILITY_STANDARD.md](docs/ACCESSIBILITY_STANDARD.md)               | WCAG 2.2 AA standard, design tokens, voice and tone    |
| [docs/BRANCHING_AND_RELEASE_PROCESS.md](docs/BRANCHING_AND_RELEASE_PROCESS.md) | PR process, review gates, release tagging              |

---

## Environment Variables

| Variable            | Default                 | Description                                  |
| ------------------- | ----------------------- | -------------------------------------------- |
| `PACKAGES_DIR`      | `packages/`             | Directory scanned for YAML learning packages |
| `PORT`              | `8000`                  | Backend API port                             |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend URL used by the frontend             |

---

## Contributing

See [docs/BRANCHING_AND_RELEASE_PROCESS.md](docs/BRANCHING_AND_RELEASE_PROCESS.md) for the branching strategy, commit message format, PR process, and review gate requirements.

---

> **Status:** Application code does not exist yet. This project is at the documentation and scaffolding phase (Phase 0).
