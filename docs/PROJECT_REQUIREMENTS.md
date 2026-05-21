# Project Requirements

## Project goal

Local Learning Engine is a local-first learning and assessment application that loads editable YAML learning packages, allows learners to study package content in learning mode, then complete a test mode that scores performance and provides actionable revision guidance, whilst keeping runtime behaviour fully deterministic and independent of AI services.

## Core requirements

- REQ-001: Learning packages must be stored as editable YAML files in the packages/ directory.
- REQ-002: Each package must include metadata, learning pages, questions, answers, scoring weights, feedback, and revision page references.
- REQ-003: The application must read available packages at runtime and present a package selection screen.
- REQ-004: Learning mode must support free forward and backward navigation through learning pages.
- REQ-005: Test mode must randomise question order for each test attempt.
- REQ-006: Test mode must randomise answer order within each question.
- REQ-007: During test mode, users must be able to move between questions and change answers before final submission.
- REQ-008: During test mode, users must not return to learning mode until the test is submitted or abandoned.
- REQ-009: Abandoning a test must navigate to the package selection screen, not back to learning mode.
- REQ-010: Final submission must show weighted score, per-question feedback, and recommended revision areas.
- REQ-011: Recommended revision areas must be derived from revision_page_ids of incorrectly answered questions.
- REQ-012: The runtime application must not depend on AI.
- REQ-013: AI usage is limited to creating packages, code, tests, and documentation.

## Out of scope

- User accounts, authentication, or profile management.
- Remote hosting or cloud-dependent runtime services.
- Real-time multiplayer or collaborative sessions.
- Runtime AI features, inference, or external model calls.
- Any requirement not explicitly defined in this document.

## Open questions

- OQ-001: Should learning page content support Markdown or plain text only? (Planner flagged this)
- OQ-002: Should there be a configurable passing score threshold per package, or a global default?
- OQ-003: Is a time limit on tests a future requirement or explicitly out of scope?

## Non-functional requirements

- Accessibility: WCAG 2.2 AA minimum.
- Theme support: light, dark, and system preference.
- No AI dependency at runtime.
- Local-only operation; no external network required once running.
