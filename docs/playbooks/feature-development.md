# Feature Development

## Default flow

1. Read the relevant routes, services, components, and tests.
2. Identify the smallest end-to-end slice.
3. Change backend and frontend contracts carefully.
4. Update or add focused tests.
5. Review the diff for scope creep.

## Extra care points

- API shape changes affect both backend and frontend.
- Admin features often need audit or permission checks.
- Progress and XP features can affect multiple flows.
- Package changes may touch YAML, backend validation, and frontend rendering.

## Minimum handoff

Report:
- files changed
- behaviour added or changed
- tests run
- risks or `To confirm`
