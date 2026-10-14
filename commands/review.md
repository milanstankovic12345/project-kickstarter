---
description: Independent code review (correctness, regressions, tests, maintainability) of a task, a path, or the current diff, in a separate read-only reviewer session.
argument-hint: "[TASK-ID | path]"
---

Target: `$ARGUMENTS` (empty = the current `git diff HEAD`).

1. Resolve the reviewer model:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/routing.mjs" resolve code-reviewer --json`.
2. Dispatch the `project-kickstarter:code-reviewer` subagent with:
   - the target:
     - a task: task file + handoff + `git diff <base> -- <files>`;
     - a path;
     - or `git diff HEAD`;
   - the plugin root path (`${CLAUDE_PLUGIN_ROOT}`);
   - the instruction to follow the code-review skill.

   Where the result goes:
   - **Task:** the reviewer saves `reports/reviews/<ID>-code.md` with the
     reports script.
   - **No task:** the reviewer can't write files, so it returns its
     findings in its final message. Present them to the user.
3. If the change spans several modules, also dispatch
   `project-kickstarter:architecture-reviewer` **in the same message**, so
   the two reviews run in parallel and independently.
4. Summarize the findings by severity. Critical and High findings block
   task completion until they are either fixed and re-verified, or
   accepted by a named human in `project-context/risk-acceptances.md`.
