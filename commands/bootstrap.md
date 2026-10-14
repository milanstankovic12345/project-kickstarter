---
description: Set up or refresh the multi-agent framework in this repository (audit | plan | apply | validate). Enables only the agents this project needs.
argument-hint: "[audit|plan|apply|validate]"
disable-model-invocation: true
---

Invoke the `project-kickstarter:project-bootstrap` skill and follow it for this repository.

Requested mode: `$ARGUMENTS`.

- **Empty:** run audit, then plan, and apply only after the user approves the plan.
- Always ask before using `--force`.

Report what was created, updated, reused, omitted and in conflict, and end with the next command to run.
