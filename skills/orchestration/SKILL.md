---
name: orchestration
description: Executes the framework task loop - selects dependency-ready, conflict-free task batches, dispatches specialist subagents with file-based briefs and routed models (in parallel when safe), runs independent reviews, enforces the quality gate and retry limits, and keeps a resumable progress ledger. Use when running, continuing or resuming tasks in tasks/, or when the user asks to execute a plan with agents.
---

# Orchestration loop

You are the controller. You **delegate**. You do not edit source, write
tests, or review code yourself. Your job is selection, dispatch,
verification of the process, state transitions and reporting.

Deterministic decisions are made by scripts. Your job is to run them and
act on their output:

```bash
PK="${CLAUDE_PLUGIN_ROOT}/scripts"
node "$PK/tasks.mjs" validate            # task set is consistent
node "$PK/tasks.mjs" batches --json      # what can run now, in parallel, without conflicts
node "$PK/tasks.mjs" transition <ID> <state> [--reason "..."]
node "$PK/tasks.mjs" required-reviews <ID> --json
node "$PK/routing.mjs" resolve <agent> --task <ID> --json   # model + subagent_type
node "$PK/reports.mjs" check handoff <ID>
node "$PK/gate.mjs" check <ID>
node "$PK/reports.mjs" progress "<one line>"
```

`${CLAUDE_PLUGIN_ROOT}` is substituted in this file. Don't rely on it
existing as an environment variable inside Bash: use the expanded path as
written above.

## 0. Preflight (every session, including resumes)

1. Check that `.claude/agent-framework.json` exists. If it doesn't, stop and
   tell the user to run `/project-kickstarter:bootstrap` first.
2. Read the last ~20 lines of `reports/progress.md` and run `tasks.mjs status`.
   This is how you resume without the old conversation.
3. Run `tasks.mjs validate`. Errors stop the loop. Send them to the planner
   (dispatch `planner` with the error list) or report them to the user.
4. Look for stale `in_progress` tasks, left behind by a session that ended
   mid-task:
   - a valid handoff exists → continue at step 3 (process the result);
   - no handoff → re-dispatch the same task. This is not a retry, so
     `attempts` is unchanged.

## 1. Select

Run `tasks.mjs batches --json`.

- `batch` holds the tasks that may run **now**. They are dependency-complete,
  their file scopes don't overlap each other or any in-progress task, and
  the batch respects `concurrency.max_parallel`.
- `deferred` and `waiting` are not runnable yet. Don't dispatch them.
- If `batch` is empty and nothing is in progress, go to step 6 (report).

## 2. Dispatch

For each task in the batch:

1. `tasks.mjs transition <ID> in_progress`. If it is rejected, don't
   dispatch; log the reason.
2. `routing.mjs resolve <agent> --task <ID> --json` gives you
   `subagent_type`, `model` and `enabled`. If `enabled` is false, the
   project disabled this agent: transition the task to `blocked` and report
   it.
3. Note the base commit: `git rev-parse HEAD`. Reviewers diff against it.
4. Add a ledger line:
   `reports.mjs progress "TASK-007 → frontend-engineer (sonnet) base=<sha>"`.

Then call the **Agent** tool once per task with `subagent_type` and `model`
from step 2, and the brief below.

**Parallelism is real only when you issue several Agent tool calls in a
single message.** Do that for the whole batch. Tasks outside one `batches`
result run one after another. Never describe agents as "running in
parallel" unless you actually sent their calls together.

Brief (paths only, never pasted history or file contents):

```
Task file: tasks/TASK-007-<slug>.md
Project profile: project-context/project-profile.md
Attempt: <attempts from task>   Previous review(s): <paths or "none">
Base commit: <sha>
Protocol: read ${CLAUDE_PLUGIN_ROOT}/skills/handoff-protocol/SKILL.md first.
Return only the HANDOFF block described in the protocol.
```

## 3. Process the result

1. `reports.mjs check handoff <ID>`. If the handoff is missing or invalid,
   re-dispatch the same agent once with the validator output. If it is
   still invalid, transition to `failed` with that reason.
2. Then act on the handoff status:
   - `blocked` → `transition <ID> blocked --reason "<blocker>"`. Tell the
     user if a human decision is needed.
   - `failed` → `transition <ID> failed --reason "<summary>"`.
   - `done` / `done_with_concerns` → `transition <ID> review`. The
     transition re-validates the handoff, including the scope check and
     that every validation command ran and exited 0.

## 4. Independent review

1. `tasks.mjs required-reviews <ID> --json` lists the kinds and reviewer
   agents. Security is added automatically for security-sensitive scopes.
2. For each kind, resolve the reviewer's model with
   `routing.mjs resolve <reviewer> --json`. Review tiers deliberately
   differ from the coding tier.
3. Dispatch all reviewers for the task **in one message**: they are
   independent and read-only. Use this brief:

```
Review kind: <kind>   Task file: tasks/TASK-007-<slug>.md
Implementation handoff (claims to verify, not facts): reports/handoffs/TASK-007.md
Diff: git diff <base-sha> -- <files_modified from handoff>
Save via: node "${CLAUDE_PLUGIN_ROOT}/scripts/reports.mjs" save review TASK-007 <kind>
Round: <n>   Previous review (if re-review): reports/reviews/TASK-007-<kind>.md
```

4. Reviewers never fix code. Implementers never review their own task:
   `reports.mjs` and the gate both reject a review whose reviewer is the
   implementing agent.

## 5. Gate, fix loop, completion

Run `gate.mjs check <ID>`.

- **PASS** → `transition <ID> done`. The transition re-checks the handoff
  and the gate. Add a ledger line.
- **BLOCKED by findings** → enter the fix loop:
  1. `transition <ID> in_progress`. This increments `attempts`. If the
     retry budget is exhausted the transition is rejected; then run
     `transition <ID> failed --reason "retry budget exhausted: <top findings>"`
     and escalate to the human.
  2. Re-dispatch the implementer with the review file paths. On later
     attempts `routing.mjs resolve --task` escalates the model
     automatically.
  3. When the new handoff is valid, `transition <ID> review` and dispatch
     the same reviewer kinds for a re-review. They must mark each finding
     `fixed` with `verified: true`, or keep it `open`.
- **Critical/High that the user wants to accept** → you cannot accept risk.
  Ask the user to add an entry to `project-context/risk-acceptances.md`
  (format in `${CLAUDE_PLUGIN_ROOT}/docs/architecture/security-model.md`).
  Editing that file triggers a permission prompt. The reviewer then marks
  the finding `accepted` with `acceptance_ref`.

## 6. Report

When nothing is runnable, or the user's requested scope is done, give a
report of at most 30 lines:

- tasks done, blocked (with reasons), failed, waiting
- review outcomes: findings by severity, and any accepted risks
- which steps ran in parallel (batch contents) versus sequentially
- unverified items: no browser, tools missing, commands that couldn't run
- the next command to continue: `/project-kickstarter:run-task`

## Limits and safety

- Retries are bounded by each task's `max_retries` (hard cap 5); the
  transitions enforce this.
- Don't run destructive or production commands. Hooks will ask a human,
  and you must not work around them.
- Don't edit `tasks/*.md` by hand to force a state. Use transitions. If a
  transition is wrong, fix the underlying artifact or ask the user.
- Keep your own context small. Read handoff and review **frontmatter**
  through the scripts' `--json` output, not whole files, unless a decision
  needs the details.
- If you are running as a subagent rather than the main thread, the same
  loop applies. Note that nested subagents count toward the platform's
  spawn depth of 3.
