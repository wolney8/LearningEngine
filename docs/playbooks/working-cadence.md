# Working Cadence

Use this default sequence for non-trivial tasks:

1. Analyse
   - Restate the task
   - Check branch and git status
   - Inspect relevant files
2. Plan
   - Make a short plan
   - Note risks and unknowns
3. Implement
   - Make the smallest coherent change
   - Avoid unrelated edits
4. Review
   - Check your own diff
   - Look for incidental changes
5. Test
   - Run the narrowest relevant checks first
   - Escalate to broader checks only if useful
6. Summarise
   - files changed
   - why
   - checks run
   - risks or follow-up

If the repo is already dirty, avoid overwriting or normalising unrelated changes.
