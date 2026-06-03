# Known Issues

## Current repository concerns

- Legacy documentation drift exists between older upper-case docs and current code. Some of that has been corrected, but both doc sets now coexist.
- `frontend/src/services/api.ts` is large and likely to become a maintenance hotspot.
- SQLite schema evolution is managed with compatibility helpers instead of a formal migration tool.
- Local generated/runtime artefacts are present in the working tree and surrounding directories; avoid editing or committing them.
- The repository currently has an untracked `AGENTS.md` in this branch until committed.

## Areas to treat carefully

- Admin user, package, and settings flows
- Authentication and token handling
- Progress, XP, streak, and spend logic
- AI generation and refresh behaviour
- Accessibility-sensitive frontend flows

## To confirm

- Whether lower-case docs should replace the older upper-case docs fully
- Whether user deletion should remain hard-delete only
- Whether a migration framework should be introduced for SQLite
