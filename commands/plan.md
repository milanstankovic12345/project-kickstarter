---
description: Decompose a goal, spec or finding list into small, validated one-session tasks in tasks/ with scopes, dependencies, validation commands and acceptance criteria.
argument-hint: "<goal | spec path | findings <report path>>"
---

Plan this goal: `$ARGUMENTS`

1. If `.claude/agent-framework.json` is missing, stop and suggest
   `/project-kickstarter:bootstrap`.
2. Dispatch the `project-kickstarter:planner` subagent with:
   - the goal;
   - `project-context/project-profile.md`;
   - the plugin root path (`${CLAUDE_PLUGIN_ROOT}`).

   For a very small goal you may follow the
   `project-kickstarter:task-planning` skill yourself instead.
3. Afterwards, run the task validator and the batch preview (the commands
   are in the task-planning skill). Show:
   - the task list;
   - dependencies;
   - which tasks can run in parallel first;
   - any open questions left in `draft` tasks.
