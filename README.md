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
| Optional admin AI integration | `pydantic-ai` with Gemini, OpenAI, Anthropic, Groq, and Mistral |

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
| `APP_ENV_FILE`                 | repo-root `.env`                | Bootstrap dotenv file loaded at backend startup           |
| `APP_AI_KEY_STORE_FILE`        | `<runtime>/ai-provider-secrets.yaml` | Persistent runtime AI provider key store              |
| `DATABASE_URL`                 | `sqlite:///backend/data/lle.db` | SQLModel database connection string                       |
| `PACKAGE_STORAGE_BUDGET_BYTES` | `104857600`                    | Runtime package YAML storage budget for stateless deployments |
| `VITE_API_BASE_URL`            | `/api`                          | Backend base path used by the frontend; local Vite dev may use `http://localhost:8000` |
| `GEMINI_API_KEY`               | unset                           | Optional Gemini API key                                   |
| `OPENAI_API_KEY`               | unset                           | Optional OpenAI API key                                   |
| `ANTHROPIC_API_KEY`            | unset                           | Optional Anthropic API key                                |
| `GROQ_API_KEY`                 | unset                           | Optional Groq API key                                     |
| `MISTRAL_API_KEY`              | unset                           | Optional Mistral API key                                  |
| `AI_API_KEY_LAST_UPDATED_AT`   | unset                           | Timestamp written when an admin rotates the provider key  |
| `GEMINI_MODEL`                 | `gemini-2.0-flash-exp`          | Optional model override for admin AI workflows            |
| `LLE_BOOTSTRAP_ADMIN_USERNAME` | unset                           | Optional initial admin username                           |
| `LLE_BOOTSTRAP_ADMIN_EMAIL`    | unset                           | Optional initial admin email                              |
| `LLE_BOOTSTRAP_ADMIN_PASSWORD` | unset                           | Optional initial admin password                           |

## AI key storage policy

- Local development:
  - By default, the backend loads bootstrap env vars from the repo-root `.env`.
  - Admin AI key changes made in the UI persist to the dedicated runtime key store and are used immediately by the running backend.
- Docker and k3s:
  - The backend uses `APP_AI_KEY_STORE_FILE=/app/runtime/ai-provider-secrets.yaml`.
  - That file lives on the backend runtime volume, so UI-saved AI provider keys survive pod or container restarts as long as the same volume is kept.
- Kubernetes:
  - `JWT_SECRET_KEY` remains a Kubernetes Secret.
  - `GEMINI_API_KEY` and the other provider env vars may still be injected from a Kubernetes Secret as bootstrap or fallback values.
  - Admin-saved AI provider keys are not written back into Kubernetes Secret objects. They are stored in the backend runtime key store on the PVC instead.
  - If you prefer declarative secret management, set the provider key via deployment env/Secret and avoid changing it through the admin UI.

Operational notes:

- Rotating an AI key through the admin UI writes `/app/runtime/ai-provider-secrets.yaml` and the running backend uses that new key immediately.
- After a backend restart, the app first checks the persisted runtime key store and only falls back to environment variables if no runtime key exists for that provider.
- Rotating the Kubernetes Secret changes only the bootstrap or fallback value and requires a backend restart to affect new pods.
- If the backend PVC is moved or recreated, copy `ai-provider-secrets.yaml` with the rest of the backend runtime data if you want to preserve the saved AI key state.
- Do not commit real `.env` files or copied runtime secret files.

---

## Contributing

See `docs/BRANCHING_AND_RELEASE_PROCESS.md` for branch naming, commit format, PR flow, and review gate expectations.

## Deployment to local k3s

The repository includes container and Kubernetes manifests for a simple LAN deployment on k3s.

- Frontend NodePort URL: `http://<minipc-or-node-ip>:30180`
- Backend exposure: internal-only ClusterIP, reached by the frontend through nginx `/api` proxying
- Node pinning: both frontend and backend are pinned to `kubernetes.io/hostname=minipc`
- Storage: backend state is persisted through a local-path PVC, including SQLite and admin-written YAML/config files

Image tags:

- `local-learning-engine-backend:0.1.0-k3s`
- `local-learning-engine-frontend:0.1.0-k3s`

Build commands from the repo root:

```bash
docker build -t local-learning-engine-backend:0.1.0-k3s -f backend/Dockerfile .
docker build -t local-learning-engine-frontend:0.1.0-k3s -f frontend/Dockerfile --build-arg VITE_API_BASE_URL=/api .
```

Push to Docker Hub or another registry if needed:

```bash
docker tag local-learning-engine-backend:0.1.0-k3s <registry>/local-learning-engine-backend:0.1.0-k3s
docker tag local-learning-engine-frontend:0.1.0-k3s <registry>/local-learning-engine-frontend:0.1.0-k3s
docker push <registry>/local-learning-engine-backend:0.1.0-k3s
docker push <registry>/local-learning-engine-frontend:0.1.0-k3s
```

Create the JWT secret without committing it:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl -n learning-engine create secret generic learning-engine-secrets \
  --from-literal=JWT_SECRET_KEY='replace-with-a-long-random-secret'
```

Apply manifests:

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/backend-service.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml
```

Verify rollout and access:

```bash
kubectl -n learning-engine get pods
kubectl -n learning-engine get svc
kubectl -n learning-engine rollout status deploy/learning-engine-backend
kubectl -n learning-engine rollout status deploy/learning-engine-frontend
kubectl -n learning-engine logs deploy/learning-engine-backend
kubectl -n learning-engine logs deploy/learning-engine-frontend
```

For more detail, see `k8s/README.md`.

## Deployment to Vercel + Neon

This repository can be deployed as a single Vercel project backed by Neon.

What persists:

- users
- auth data
- XP and progress
- admin-created or admin-edited runtime packages

What still comes from the repo:

- frontend code
- backend code
- seed package YAML files in `packages/`

### How it works

- GitHub `main` is connected to one Vercel project.
- Each push to `main` triggers a new deployment automatically.
- Vercel serves the frontend and backend under one public URL.
- Neon stores runtime data, including admin-managed package YAML content.
- Repo `packages/*.yaml` files still load as seed content, but runtime package changes are persisted in the database for stateless deployments.

### One-project Vercel structure

The repo root now contains `vercel.json` with two services:

- `frontend` rooted at `frontend/`
- `backend` rooted at `backend/`

Requests are routed like this:

- `/api/*` -> backend
- everything else -> frontend

This means production frontend calls can use same-origin `/api`.

### 1. Create the Neon database

Create a Neon project and copy the pooled connection string.

Example:

```text
postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

### 2. Create the Vercel project

In Vercel:

1. Import this GitHub repository as one project.
2. Keep the detected Services flow.
3. Add these environment variables:

```text
APP_DEPLOYMENT_MODE=stateless
DATABASE_URL=<your Neon connection string>
JWT_SECRET_KEY=<long-random-secret>
PACKAGE_STORAGE_BUDGET_BYTES=104857600
LLE_BOOTSTRAP_ADMIN_USERNAME=<optional>
LLE_BOOTSTRAP_ADMIN_EMAIL=<optional>
LLE_BOOTSTRAP_ADMIN_PASSWORD=<optional>
```

Optional AI environment variables:

```text
GEMINI_API_KEY=<optional>
OPENAI_API_KEY=<optional>
ANTHROPIC_API_KEY=<optional>
GROQ_API_KEY=<optional>
MISTRAL_API_KEY=<optional>
```

Notes:

- `PACKAGE_STORAGE_BUDGET_BYTES` defaults to `104857600` (100 MB) if omitted.
- That budget is for runtime package YAML content stored by this app in stateless mode.
- It is an app-level guardrail to help avoid consuming too much of a shared Neon free-tier database.

### 3. What persists across redeploys

These survive Vercel redeploys because they are stored in Neon:

- users
- XP
- streak and progress data
- admin-published package YAML
- admin package tag edits
- admin package availability / threshold changes
- admin package refresh output

These do not depend on Vercel local disk.

### 4. Package storage budget behavior

In stateless deployments:

- runtime package YAML is stored in Neon
- the admin package page shows current runtime package storage usage
- publishing or updating packages is blocked when the configured package budget is exceeded
- deleting packages frees that runtime package budget

This budget is separate from total Neon project storage, but it gives the app a practical cap so it does not grow unchecked.

### 5. Current stateless limitations

The following still remain file-backed and are therefore better suited to k3s/stateful deployments:

- backend settings YAML saves
- runtime AI key file persistence via admin UI

On Vercel, configure those through environment variables instead.

### 6. Local test commands before pushing

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
export APP_DEPLOYMENT_MODE=stateless
export DATABASE_URL='postgresql://<user>:<password>@<host>/<database>?sslmode=require'
export PACKAGE_STORAGE_BUDGET_BYTES='104857600'
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
pnpm install
VITE_API_BASE_URL=http://localhost:8000 pnpm dev
```

### 7. Operational note

If you continue to use the k3s deployment, the stateful filesystem-backed package and settings flow still works there. The stateless database-backed runtime package path is primarily for Vercel-style deployments where local disk is not durable.
