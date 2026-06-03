# Bug Fix

## Default flow

1. Identify the failing path.
2. Read the nearest implementation and test files.
3. Reproduce with the narrowest useful check if possible.
4. Fix the root cause, not only the symptom.
5. Add or adjust a focused test.
6. Re-run the relevant checks.

## Avoid

- broad refactors during a bug fix
- mixing unrelated clean-up into the same change
- changing API contracts unless required

## Hand-off

State:
- bug fixed
- root cause
- files changed
- checks run
- any residual risk
