---
name: project-bootstrap
description: Adapts the multi-agent engineering framework to any repository - discovers the project, inventories existing agents/skills/hooks, maps requirements to reusable framework components, enables only the agents the project needs, generates justified project specialists, gap tasks, framework config, profile and README usage section, validates everything, and reports what was created, reused, modified or omitted. Supports audit, plan, apply and validate modes; idempotent and safe for user customizations. Use when setting up or refreshing the agent framework in a project.
---

# Project bootstrap

> `<plugin-root>` in commands below means `${CLAUDE_PLUGIN_ROOT}`. If that
> still shows literally, it is the plugin folder that contains the `skills/`
> directory you read this file from.

Bootstrap is deterministic. Mapping and file generation are done by
`<plugin-root>/scripts/bootstrap.mjs`, using `config/capability-map.json`
rules, so reruns give identical results. Your job is to run the modes in
order, explain the results, get approval where needed, and add judgment
the script can't supply.

## Modes

| Mode | Writes | Use |
|---|---|---|
| `audit` | nothing | What exists, what is missing, which agents would be enabled and why |
| `plan` | nothing | Exact per-file actions: create, update, unchanged, conflict, skip. Exits 3 if there are conflicts |
| `apply` | yes | Executes the plan, never overwrites customizations, writes `reports/bootstrap-report.md` |
| `validate` | nothing | Checks config, aliases, specialists, routing overrides, manifest, profile freshness and tasks. Exits 1 on errors |

## Workflow

1. **Audit.**
   `node "<plugin-root>/scripts/bootstrap.mjs" audit`.
   Summarize for the user in 5–10 lines: stack, existing agent setup,
   agents to enable and to omit, specialists, gaps.
2. **Plan.**
   `node "<plugin-root>/scripts/bootstrap.mjs" plan`. Show the action
   list.
   - **Conflicts** mean a user changed a generated file, or a same-named
     file already existed. Explain each one. Without `--force`, apply will
     not overwrite it; it writes a proposal to
     `.claude/agent-framework/proposed/` instead.
   - Ask before using `--force`. It overwrites, keeping a backup in
     `.claude/agent-framework/backup/`.
3. **Apply.** Run it once the user has approved the plan, or straight
   away when there are no conflicts and the user asked for setup:
   `node "<plugin-root>/scripts/bootstrap.mjs" apply`.
4. **Enrich (judgment).**
   - Dispatch the `project-discoverer` agent to fill the profile's Notes.
     For small repos, do it yourself following `project-discovery`.
   - Review the generated gap tasks in `tasks/` (status `draft`). Fix
     placeholder validation commands and adjust scopes. Promote the ready
     ones with `tasks.mjs transition <ID> ready`.
   - Propose an extra project specialist **only** if one domain needs
     knowledge that no framework agent covers *and* at least two tasks
     will use it. Write it in `.claude/agents/`, add it to `specialists` in
     `.claude/agent-framework.json`, and justify it in the report. Never
     generate agents speculatively.
5. **Validate.**
   `node "<plugin-root>/scripts/bootstrap.mjs" validate` must exit 0. Then
   `node "<plugin-root>/scripts/tasks.mjs" validate`.
6. **Report.** Summarize `reports/bootstrap-report.md`: what was created,
   updated, reused, omitted and in conflict, and the next command
   (`/project-kickstarter:run-task` or `/project-kickstarter:plan <goal>`).

## Guarantees (enforced by the script and its tests)

- **Idempotent.** A second `apply` with no source changes writes nothing,
  apart from the report.
- **Ownership tracking.** Hashes live in
  `.claude/agent-framework/manifest.json`. A file or marker section edited
  by a user becomes a conflict, never a silent overwrite.
- **User content is preserved.** README and CLAUDE.md get only a
  marker-delimited section. CLAUDE.md is never created, only appended to
  when it exists.
- **Existing agents are reused.** A same-name project agent overrides the
  framework agent. Known equivalents become aliases (`qa-engineer` →
  test-engineer tasks, `tech-lead` → planner tasks, `fullstack-engineer` →
  implementer tasks).
- **No duplicate gap tasks.** Each generated task carries
  `origin: bootstrap:<gap>`, and the gap is never regenerated, even after
  the task is cancelled.
- **Secrets are never read.** Only their file names are listed.
- **Nothing is deleted.**
