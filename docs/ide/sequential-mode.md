# Running the task loop without subagent dispatch

Applies to Cursor, Codex and GitHub Copilot. These IDEs do not give the
framework isolated, parallel subagents, so one agent plays the roles one
after another. The scripts keep doing what they do in Claude Code: they own
the state machine, the scope check, the handoff check and the quality gate.
You run them and act on their output.

```bash
PK="<plugin-root>/scripts"
node "$PK/tasks.mjs" validate
node "$PK/tasks.mjs" batches --json
node "$PK/tasks.mjs" transition <ID> <state> [--reason "..."]
node "$PK/tasks.mjs" required-reviews <ID> --json
node "$PK/reports.mjs" check handoff <ID>
node "$PK/gate.mjs" check <ID>
node "$PK/reports.mjs" progress "<one line>"
```

## Loop

1. **Preflight.** `.claude/agent-framework.json` must exist. If it doesn't,
   run `node <plugin-root>/scripts/bootstrap.mjs apply`. Read the last lines
   of `reports/progress.md`, run `tasks.mjs status` and `tasks.mjs validate`.
   Errors stop the loop.
2. **Select.** Run `tasks.mjs batches --json`. Take the first task in
   `batch` and ignore the rest of the batch: tasks run one at a time here.
3. **Start.** `tasks.mjs transition <ID> in_progress`, note the base commit
   with `git rev-parse HEAD`, and add a ledger line.
4. **Implement as the task's `agent` role.** Open that role's definition and
   work only inside the task's `files_allowed`. Run every `validation`
   command. Save the handoff by piping the handoff document to
   `reports.mjs save handoff <ID>` on stdin.
5. **Check the handoff.** `reports.mjs check handoff <ID>`, then
   `tasks.mjs transition <ID> review`.
6. **Review independently.** `tasks.mjs required-reviews <ID> --json` lists
   the review kinds. For each kind, **start a new chat or session** (fresh
   context, not the implementing conversation), take the reviewer role, and
   save the result with `reports.mjs save review <ID> <kind>`. The scripts
   reject a review written by the implementing agent.
7. **Gate.** `gate.mjs check <ID>`.
   - PASS: `tasks.mjs transition <ID> done`.
   - BLOCKED: `transition <ID> in_progress` (this counts a retry and is
     refused when the budget is spent), fix as the implementer using the
     review files, then repeat from step 4 and re-review.
8. **Report.** Summarize done, blocked and failed tasks and the next command.

## What is different from Claude Code

- **No parallel batches.** Run tasks sequentially.
- **No automatic model routing.** Pick the model yourself. The tier is shown
  by `node <plugin-root>/scripts/routing.mjs resolve <agent> --task <ID> --json`.
- **Read-only roles are not enforced by tool permissions.** Reviewer and
  auditor roles are instructed never to edit source files. Nothing stops a
  tool call except the hooks, and only Cursor has them (experimental).
- **Backstop.** Run `node <plugin-root>/scripts/ci-check.mjs` before you
  commit (the git hook and the CI workflow do it for you if installed).
