# Project Requirements

## Project goal

Local Learning Engine is a local-first learning and assessment application that loads editable YAML learning packages, allows learners to study package content, complete tests, and review actionable feedback, while supporting authenticated progress tracking and administrator-led content and user management.

## Core runtime requirements

- REQ-001: Learning packages are stored as editable YAML files in `packages/`.
- REQ-002: Each package includes metadata, lesson pages, questions, answers, scoring weights, feedback, and revision page references.
- REQ-003: The application reads available packages at runtime and presents package selection flows.
- REQ-004: Learning mode supports free forward and backward navigation through lesson pages.
- REQ-005: Test mode randomises question order for each attempt.
- REQ-006: Test mode randomises answer order within each question.
- REQ-007: During test mode, users can move between questions and change answers before submission.
- REQ-008: During test mode, users cannot return to learning mode until the attempt is submitted or abandoned.
- REQ-009: Abandoning a test returns to package selection, not back into lesson mode.
- REQ-010: Final submission shows weighted score, per-question feedback, and recommended revision areas.
- REQ-011: Recommended revision areas are derived from `revision_page_ids` of incorrectly answered questions.
- REQ-012: Authenticated users can persist progress, XP, streaks, and library selections.
- REQ-013: Administrators can manage settings, packages, users, and audit data.
- REQ-014: Runtime AI use, when enabled, is restricted to admin package generation and refresh workflows.

## Constraints

- The application remains usable locally without mandatory cloud dependencies for core learning flows.
- YAML packages remain the primary editable content source.
- Frontend and backend validation must continue to agree on package structure.
- Admin-only routes must enforce role checks on the backend.

## Out of scope

- Social or multiplayer learning
- Real-time collaboration
- Generic user-generated content outside the package/admin workflows
- Runtime AI tutoring in learner-facing flows

## Current implementation notes

- SQLite is an implemented persistence layer, not a future placeholder.
- Authentication and profile management are implemented and in scope.
- Admin AI features exist, but remain operationally optional and should degrade safely when provider configuration is absent.

## Open questions

- OQ-001: Should lesson page content continue to allow Markdown as the canonical format, or should richer structured content be introduced?
- OQ-002: Should package passing thresholds remain package-local only, or should admin settings support a global default/override model?
- OQ-003: Should user deletion be hard-delete only, or should the system introduce soft-delete and retention rules?
- OQ-004: Should database schema evolution move to managed migrations?

## Non-functional requirements

- Accessibility target: WCAG 2.2 AA minimum
- Theme support: light, dark, and system preference
- Predictable local development workflow
- Automated backend, frontend, and accessibility validation in CI
