# Local Learning Engine

A local-first learning application for selecting learning packages, studying structured lesson pages, taking tests, tracking progress, and administering content and users. Runtime AI is optional and restricted to admin-only package generation and refresh workflows.

---

## Current status

The application is implemented and contains active backend, frontend, tests, CI, and multi-agent workflow scaffolding. Earlier documentation that described the repo as Phase 0 scaffolding has been superseded.

---

## Stack

| Layer                         | Technology                       |
| ----------------------------- | -------------------------------- |
| Backend                       | Python 3.11+, FastAPI, SQLModel  |
| Frontend                      | React 18, TypeScript, Vite       |
| Content packages              | YAML                             |
| Persistence                   | SQLite                           |
| Backend testing               | pytest                           |
| End-to-end testing            | Playwright                       |
| Python linting                | Ruff                             |
| Frontend linting / formatting | Biome                            |
| Accessibility                 | WCAG 2.2 AA target               |
| Optional admin AI integration | `pydantic-ai` with Google Gemini |

---

## Core capabilities

- Browse YAML-backed learning packages
- Study lesson pages with free navigation
- Complete test mode with randomised questions and answers
- Track authenticated user progress, XP, streaks, and per-difficulty results
- Manage user library and catalogue availability
- Administer users, settings, packages, and audit logs
- Optionally generate or refresh packages through admin-only AI workflows

---

## Local setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

API runs on `http://localhost:8000`

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Frontend runs on `http://localhost:5173`

---

## Folder structure

```text
LocalLearningEngine/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models/          # Pydantic + SQLModel models
│   │   ├── routers/         # FastAPI route handlers
│   │   └── services/        # Business logic and infrastructure helpers
│   ├── data/                # SQLite database files
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── types/
│   │   └── utils/
│   ├── tests/e2e/
│   └── package.json
├── packages/                # YAML learning packages
├── docs/                    # Project documentation
└── .github/                 # Multi-agent workflow scaffold, hooks, CI
```

---

## Documentation

| File                                                                           | Description                                                      |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `docs/PROJECT_REQUIREMENTS.md`                                                 | Current product scope, constraints, and open questions           |
| `docs/PROJECT_PLAN.md`                                                         | Historical multi-agent delivery plan and current implementation summary |
| `docs/ARCHITECTURE.md`                                                         | Current backend, frontend, persistence, and admin architecture   |
| `docs/CONTENT_PACKAGE_TEMPLATE.md`                                             | YAML package format with annotated example                       |
| `docs/ENGINEERING_STANDARDS.md`                                                | Branching, commits, linting, testing, security                   |
| `docs/ACCESSIBILITY_STANDARD.md`                                               | WCAG 2.2 AA standard, design tokens, voice and tone             |
| `docs/BRANCHING_AND_RELEASE_PROCESS.md`                                        | PR process, review gates, release tagging                        |

---

## Environment variables

| Variable                       | Default                         | Description                                               |
| ------------------------------ | ------------------------------- | --------------------------------------------------------- |
| `PACKAGES_DIR`                 | `packages/`                     | Directory scanned for YAML learning packages              |
| `PORT`                         | `8000`                          | Backend API port                                          |
| `DATABASE_URL`                 | `sqlite:///backend/data/lle.db` | SQLModel database connection string                       |
| `VITE_API_BASE_URL`            | `http://localhost:8000`         | Backend URL used by the frontend                          |
| `GEMINI_API_KEY`               | unset                           | Optional admin AI provider key                            |
| `GEMINI_MODEL`                 | `gemini-2.0-flash-exp`          | Optional model override for admin AI workflows            |
| `LLE_BOOTSTRAP_ADMIN_USERNAME` | unset                           | Optional initial admin username                           |
| `LLE_BOOTSTRAP_ADMIN_EMAIL`    | unset                           | Optional initial admin email                              |
| `LLE_BOOTSTRAP_ADMIN_PASSWORD` | unset                           | Optional initial admin password                           |

---

## Contributing

See `docs/BRANCHING_AND_RELEASE_PROCESS.md` for branch naming, commit format, PR flow, and review gate expectations.
