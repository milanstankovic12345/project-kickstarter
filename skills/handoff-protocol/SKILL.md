---
name: handoff-protocol
description: Shared working protocol for every framework subagent - task scope rules, evidence rules, blocker reporting and the standardized handoff format. Loaded by framework agents at the start of each task; not for direct use.
user-invocable: false
---

# Agent working protocol

You are one agent working on **one task** in one session. The orchestrator
gave you paths, not history. Everything you need is in the task file, the
project profile and the files they reference. Everything the next session
needs must end up in your handoff.

## 1. Before you start

1. Read the task file you were given (`tasks/TASK-NNN-*.md`): objective,
   `files_allowed`, `files_excluded`, `validation`, `acceptance`, blockers.
2. Read only the sections of `project-context/project-profile.md` that the
   task needs.
3. If the task is ambiguous, too large for one session, or depends on
   something missing, **stop**. Write a `blocked` handoff (section 4). Do not
   guess, and do not widen the scope.

## 2. Scope rules

- Modify only files that match `files_allowed` and do not match
  `files_excluded`. Your own handoff and review files under
  `reports/handoffs/` and `reports/reviews/` are always allowed.
- The handoff validator compares `files_modified` against the scope. A
  scope violation rejects the handoff.
- Never edit `tasks/*.md` yourself. Task state changes only through
  `scripts/tasks.mjs`, which the orchestrator runs.
- Never touch secrets: `.env*`, keys, credentials. Never print secret values.
  Refer to them by key name only.
- Destructive commands (deleting data, force-pushing, dropping tables,
  deploying, changing permissions) need explicit human approval. The
  framework's hooks will ask, and you must not try to route around them.

## 3. Evidence rules

- A claim counts only if a command you ran in this session supports it.
  "Should work" is not evidence.
- Run **every** command in the task's `validation` list. Record each one in
  the handoff `tests` list with its real `exit_code` and a one-line summary
  of the output.
- If a command can't run here (missing tool, no network, no browser), say
  so: status `blocked`, or `done_with_concerns` with the gap listed under
  `unresolved`. Never fabricate output.
- Visual or UI claims need an actual screenshot or browser check from this
  session. Otherwise write "not visually verified".

## 4. Handoff

Save the handoff through the validator. It checks the schema, the scope and
the evidence:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/reports.mjs" save handoff TASK-NNN <<'EOF'
---
task: TASK-NNN
agent: <your agent name>
model: <model you ran on, if known, else null>
attempt: <attempts value from the task>
status: done            # done | done_with_concerns | blocked | failed
summary: One to three sentences.
files_modified:
  - src/exact/path.ts
tests:
  - cmd: npm test
    exit_code: 0
    summary: 48 passed, 0 failed
unresolved: []
risks: []
decisions: []
next_steps: []
blocker: null           # required text when status is blocked
---

## What changed
## Evidence
## Notes for the next session
EOF
```

If the script prints `REJECTED`, fix what it lists and save again. Never
save a handoff that hides a failing command.

Reviewers and auditors save reviews the same way:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/reports.mjs" save review TASK-NNN <code|security|ui|architecture>`.
The format is `${CLAUDE_PLUGIN_ROOT}/templates/review.md`.

## 5. Final message (what the orchestrator sees)

Keep it to **15 lines or fewer**. Write the full detail in the handoff
file, not the chat. The final message must contain this block:

```
HANDOFF
task: TASK-NNN
status: done | done_with_concerns | blocked | failed
handoff: reports/handoffs/TASK-NNN.md   (or reports/reviews/TASK-NNN-<kind>.md)
tests: <n passed / n failed, or "not run: reason">
next: <one line>
```

A framework hook checks for this block when a framework agent stops. If
the block is missing, you will be asked to add it.
