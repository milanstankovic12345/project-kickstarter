---
description: Show framework status - tasks by state, what can run next in parallel, blocked/failed reasons, review gates, recent progress and project health.
argument-hint: "[TASK-ID]"
---

Show status for `$ARGUMENTS` (empty = the whole project). This is
read-only: don't modify anything.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tasks.mjs" status
node "${CLAUDE_PLUGIN_ROOT}/scripts/tasks.mjs" batches
node "${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.mjs" validate
node "${CLAUDE_PLUGIN_ROOT}/scripts/metrics.mjs" summary
```

For a single task, also run:
- `gate.mjs check <ID>`
- `reports.mjs check handoff <ID>`

Also show the last 5 lines of `reports/progress.md`, if it exists.

Present a compact summary of at most 20 lines:
- counts by state;
- what is runnable now;
- blocked and failed tasks, with reasons;
- gate status;
- validation errors;
- the suggested next command.

If the framework isn't bootstrapped, say so and suggest
`/project-kickstarter:bootstrap`.
