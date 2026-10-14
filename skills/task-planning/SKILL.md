---
name: task-planning
description: Decomposes goals, specs, audits or review findings into small, self-contained task files (tasks/TASK-NNN-*.md) that each fit one agent session, with file scopes, dependencies, exact validation commands, acceptance criteria, assigned agent, skills and model tier. Use when planning work for the agent framework, splitting an oversized task, or turning findings into actionable tasks.
---

# Task planning

> `<plugin-root>` in commands below means `${CLAUDE_PLUGIN_ROOT}`. If that
> still shows literally, it is the plugin folder that contains the `skills/`
> directory you read this file from.

The orchestrator can only run what you specify precisely. A good task:
one agent, one session, one objective, a bounded set of files, and a
pass/fail check that a script can run.

## Procedure

1. **Gather context.** Read the goal or spec, the relevant sections of
   `project-context/project-profile.md`, and existing tasks
   (`tasks.mjs status --json`) so you don't duplicate work.
2. **Choose a slicing.** Slice vertically (each task delivers testable
   behaviour) rather than by layer, unless a contract has to land first
   (schema, API, design tokens). Then that contract becomes its own task
   that the others depend on.
3. **Size check.** Split a task when any of these is true:
   - more than about 15 steps or 10 acceptance criteria;
   - more than one agent's specialty (e.g. a migration and a UI screen);
   - `files_allowed` needs repo-wide globs (`**`, `src/**`);
   - you can't name its validation command.
4. **Create the files.** For each task:
   ```bash
   node "<plugin-root>/scripts/tasks.mjs" new --title "..." --agent <agent> \
     --scope "src/feature/**,tests/feature/**" --depends TASK-002 \
     --validation "npm test -- feature;;npm run lint" --acceptance "criterion one;;criterion two" \
     --tier coding --review code
   ```
   Then edit the body: Objective (one sentence), Context (paths and
   decisions only), Steps (numbered, short), Blockers (when to stop),
   Deliverables.
5. **Validate.** Run `tasks.mjs validate` and repeat until there are no
   errors. Fix warnings or justify them in the task's Context section.
6. **Promote.** Run `tasks.mjs transition <ID> ready` only for fully
   specified tasks. Anything that still needs a human decision stays
   `draft`, with the open question written in Context.
7. **Summarize.** Report the task list, the dependency order, and what
   `tasks.mjs batches` says can run in parallel first.

## Field rules

| Field | Rule |
|---|---|
| `title` | Imperative, ≤ 100 characters, unique across tasks |
| `agent` | The most specific enabled agent (`.claude/agent-framework.json` `enabled_agents`), or a project specialist |
| `skills` | Only skills the agent must load beyond its defaults |
| `model_tier` | Leave the agent default unless the task is unusually mechanical (`fast`) or subtle (`reasoning`) |
| `files_allowed` | The narrowest globs that cover the change, including its tests. Disjoint scopes allow parallelism |
| `files_excluded` | Generated files, vendored code, lockfiles (unless the task is a dependency change), secrets |
| `validation` | Exact commands from the profile's command table, scoped where possible (`npm test -- path`). `expect` describes success (`exit 0`, or `exit 0; output contains "3 passed"`) |
| `acceptance` | Observable outcomes ("POST /login with a bad password returns 401 and no session cookie"), never "code is clean" |
| `review` | `code` by default. Add `security` for auth, payments, data access or input handling; `ui` and `visual` for UI; `architecture` for cross-module changes. Sensitive paths add `security` automatically |
| `depends_on` | Only real ordering constraints. Over-constraining kills parallelism |
| `max_retries` | 2 by default. Lower it for expensive tasks, raise it (≤ 5) only with a reason |

## Anti-patterns

- Umbrella tasks ("Implement authentication"): split them into contract,
  backend, UI, security tests.
- Tasks whose validation is "manually check". Find or create a command, or
  make a `test-engineer` task that creates one.
- Copying spec paragraphs into Context. Link the section instead.
- Assigning review to the implementing agent.
- Planning work for agents the project hasn't enabled. Note the gap for
  `/project-kickstarter:bootstrap` instead.
