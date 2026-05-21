This plan was produced by the Planner agent and approved by the Orchestrator on 2026-05-21. No application code exists yet. Phase 0 is the current phase.

---

## Recommended Tooling: Biome

Biome is used instead of ESLint + Prettier for the frontend. It handles both linting and formatting in a single tool with full TypeScript support and Vite/pnpm integration.

---

## Proposed Project Structure

```
LocalLearningEngine/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models/
│   │   ├── routers/
│   │   └── services/
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── utils/
│   │   └── styles/
│   ├── tests/e2e/
│   ├── biome.json
│   ├── vite.config.ts
│   └── playwright.config.ts
├── packages/
├── .github/workflows/
└── README.md
```

---

## Phase 0 — Documentation and Schema Design

**Goal**: Produce all reference documents the Coder and Designer agents will consult before writing a single line of code.

**Status**: In progress (current phase).

**Tasks**:

- **T1**: Update `README.md` — Agent: Coder — Depends on: none
- **T2**: Write `docs/package-schema.md` (YAML package schema spec) — Agent: Coder — Depends on: none
- **T3**: Write `docs/api-contract.md` (REST API contract) — Agent: Coder — Depends on: T2

**Review gates**: None (documentation only)

**Phase complete when**: T1, T2, T3 merged; team has agreed on YAML schema field names and API error envelope format.

---

## Phase 1 — Project Scaffolding

**Goal**: Establish the full toolchain, folder structure, and CI skeleton.

**Tasks**:

- **T4**: Initialise Python backend — `backend/pyproject.toml`, `backend/app/main.py`, Ruff config — Agent: Coder — Depends on: none
- **T5**: Initialise React/TypeScript frontend — Vite, Biome, React Router, Zod, Playwright — Agent: Coder — Depends on: none
- **T6**: Root layout and `.gitignore` — Agent: Coder — Depends on: T4, T5
- **T7**: CI skeleton (`.github/workflows/ci.yml`) — Agent: Coder — Depends on: T4, T5

**Review gates**: Code Quality, Security

**Phase complete when**: `ruff check` and `biome check` pass locally; `GET /health` returns 200; CI runs without errors.

---

## Phase 2 — Data Models and Validation

**Goal**: Validated data models on both sides of the API.

**Tasks**:

- **T8**: Pydantic models — Agent: Coder — Depends on: T2, T4
- **T9**: Zod schemas — Agent: Coder — Depends on: T2, T5
- **T10**: Sample YAML package (`packages/intro-to-python.yaml`) — Agent: Coder — Depends on: T2
- **T11**: Model unit tests — Agent: Coder — Depends on: T8, T10

**Review gates**: Code Quality, Security, Testing

**Phase complete when**: `pytest backend/tests/test_models.py` passes; sample YAML validates.

---

## Phase 3 — Package API

**Goal**: REST API for reading packages.

**Tasks**:

- **T12**: Package loader service — Agent: Coder — Depends on: T8
- **T13**: Package router (`GET /packages`, `GET /packages/{id}`) — Agent: Coder — Depends on: T12
- **T14**: Router tests — Agent: Coder — Depends on: T13, T10

**Review gates**: Code Quality, Security, Testing

**Phase complete when**: All router tests pass; endpoints return correct shapes for sample package.

---

## Phase 4 — Package Selection Screen

**Goal**: First visible screen — select a package.

**Tasks**:

- **T15**: API client (`frontend/src/services/api.ts`) — Agent: Coder — Depends on: T9, T5
- **T16**: `PackageCard` component — Agent: Designer — Depends on: T9, T5
- **T17**: `PackageSelectionScreen` page — Agent: Coder — Depends on: T15, T16
- **T18**: Wire React Router routes — Agent: Coder — Depends on: T17
- **T19**: Playwright test — Agent: Coder — Depends on: T18

**Review gates**: Code Quality, Accessibility, Security, Testing

**Phase complete when**: Selection screen renders with live data; keyboard navigation reaches every card; Playwright test passes.

---

## Phase 5 — Learning Mode

**Goal**: Read through all pages of a package, free forward/backward navigation.

**Tasks**:

- **T20**: `LearningPage` component — Agent: Designer — Depends on: T9, T5
- **T21**: `PageNavigator` component — Agent: Designer — Depends on: T5
- **T22**: `LearningModeScreen` page — Agent: Coder — Depends on: T15, T20, T21
- **T23**: Wire route — Agent: Coder — Depends on: T22
- **T24**: Playwright test — Agent: Coder — Depends on: T23

**Review gates**: Code Quality, Accessibility, Security, Testing

**Phase complete when**: All pages navigable; Previous disabled on page 1; "Enter test" appears on last page; tests pass.

---

## Phase 6 — Test Mode UI

**Goal**: Randomised test with per-question answer state, navigation, and submission.

**Tasks**:

- **T25**: `randomise.ts` utility — Agent: Coder — Depends on: T9
- **T26**: `QuestionCard` component — Agent: Designer — Depends on: T25
- **T27**: `TestNavigator` component — Agent: Designer — Depends on: T5
- **T28**: `TestModeScreen` page — Agent: Coder — Depends on: T15, T25, T26, T27
- **T29**: Learning mode lock / route guard — Agent: Coder — Depends on: T28, T23
- **T30**: Playwright test — Agent: Coder — Depends on: T29

**Review gates**: Code Quality, Accessibility, Security, Testing

**Phase complete when**: All questions answerable and submittable; route guard prevents returning to learning mode; tests pass.

---

## Phase 7 — Scoring Engine and Results

**Goal**: Weighted scoring, per-question feedback, revision recommendations.

**Tasks**:

- **T31**: `scoring.py` service — Agent: Coder — Depends on: T12
- **T32**: `POST /sessions/submit` endpoint — Agent: Coder — Depends on: T31, T13
- **T33**: Scoring unit tests — Agent: Coder — Depends on: T31, T10
- **T34**: Sessions router tests — Agent: Coder — Depends on: T32, T33
- **T35**: `ResultsScreen` page — Agent: Designer — Depends on: T9, T5
- **T36**: Wire submit + results route — Agent: Coder — Depends on: T32, T35
- **T37**: Playwright test — Agent: Coder — Depends on: T36

**Review gates**: Code Quality, Accessibility, Security, Testing

**Phase complete when**: Full submission returns correct weighted score; revision areas match wrong answers; all tests pass.

---

## Phase 8 — Theming

**Goal**: Light/dark/system theme support.

**Tasks**:

- **T38**: Design tokens (`tokens.css`) — Agent: Designer — Depends on: T5
- **T39**: Theme utility + `useTheme` hook — Agent: Coder — Depends on: T38
- **T40**: `ThemeToggle` component — Agent: Designer — Depends on: T39
- **T41**: Apply tokens across all stylesheets — Agent: Designer — Depends on: T38, T40

**Review gates**: Code Quality, Accessibility, Security

**Phase complete when**: App switches theme without reload; system preference honoured; toggle is keyboard accessible; all colour pairs pass 4.5:1 contrast.

---

## Phase 9 — Accessibility Audit and End-to-End Polish

**Goal**: Close all WCAG 2.2 AA gaps; wire axe-core assertions into CI.

**Tasks**:

- **T42**: Systematic WCAG 2.2 AA audit with `@axe-core/playwright` — Agent: Designer — Depends on: T41
- **T43**: Skip-navigation link + heading hierarchy — Agent: Coder — Depends on: T42
- **T44**: axe-core assertions in all Playwright specs — Agent: Coder — Depends on: T42, T43
- **T45**: Add Playwright job to CI — Agent: Coder — Depends on: T44

**Review gates**: Code Quality, Accessibility, Security, Testing

**Phase complete when**: `checkA11y()` passes on all four pages; CI runs full Playwright suite without failures.

---

## Dependency Table

| ID  | Description                 | Depends on    | Agent    |
| --- | --------------------------- | ------------- | -------- |
| T1  | Update README               | —             | Coder    |
| T2  | YAML schema spec            | —             | Coder    |
| T3  | API contract doc            | T2            | Coder    |
| T4  | Backend scaffold            | —             | Coder    |
| T5  | Frontend scaffold           | —             | Coder    |
| T6  | Root layout / .gitignore    | T4, T5        | Coder    |
| T7  | CI skeleton                 | T4, T5        | Coder    |
| T8  | Pydantic models             | T2, T4        | Coder    |
| T9  | Zod schemas                 | T2, T5        | Coder    |
| T10 | Sample YAML package         | T2            | Coder    |
| T11 | Model unit tests            | T8, T10       | Coder    |
| T12 | Package loader service      | T8            | Coder    |
| T13 | Package router              | T12           | Coder    |
| T14 | Router tests                | T13, T10      | Coder    |
| T15 | API client (frontend)       | T9, T5        | Coder    |
| T16 | PackageCard component       | T9, T5        | Designer |
| T17 | PackageSelectionScreen      | T15, T16      | Coder    |
| T18 | Wire routes                 | T17           | Coder    |
| T19 | Playwright: selection       | T18           | Coder    |
| T20 | LearningPage component      | T9, T5        | Designer |
| T21 | PageNavigator component     | T5            | Designer |
| T22 | LearningModeScreen          | T15, T20, T21 | Coder    |
| T23 | Wire learn route            | T22           | Coder    |
| T24 | Playwright: learning        | T23           | Coder    |
| T25 | randomise.ts                | T9            | Coder    |
| T26 | QuestionCard component      | T25           | Designer |
| T27 | TestNavigator component     | T5            | Designer |
| T28 | TestModeScreen              | T15,T25–T27   | Coder    |
| T29 | Route guard                 | T28, T23      | Coder    |
| T30 | Playwright: test mode       | T29           | Coder    |
| T31 | scoring.py                  | T12           | Coder    |
| T32 | POST /sessions/submit       | T31, T13      | Coder    |
| T33 | Scoring unit tests          | T31, T10      | Coder    |
| T34 | Sessions router tests       | T32, T33      | Coder    |
| T35 | ResultsScreen               | T9, T5        | Designer |
| T36 | Wire submit + results       | T32, T35      | Coder    |
| T37 | Playwright: results         | T36           | Coder    |
| T38 | tokens.css                  | T5            | Designer |
| T39 | useTheme hook               | T38           | Coder    |
| T40 | ThemeToggle component       | T39           | Designer |
| T41 | Apply tokens to stylesheets | T38, T40      | Designer |
| T42 | axe-core audit              | T41           | Designer |
| T43 | Skip-nav + headings         | T42           | Coder    |
| T44 | axe assertions in specs     | T42, T43      | Coder    |
| T45 | Playwright CI job           | T44           | Coder    |

---

## Open Questions

- **OQ-001**: Should learning page content support Markdown or plain text only?
- **OQ-002**: Is there a configurable passing score threshold per package, or a global default?
- **OQ-003**: Is a time limit on tests a future requirement or explicitly out of scope?
- **OA-001**: If multiple packages load concurrently, is in-process caching sufficient or should a file-watcher be used?
- **OA-002**: When SQLite is added, which query library? (SQLAlchemy, SQLModel, or raw sqlite3)
