---
description: Execute ready tasks with specialist subagents - parallel-safe batches, routed models, independent reviews, quality gates, bounded retries, resumable ledger.
argument-hint: "[TASK-ID | all]"
disable-model-invocation: true
---

Invoke the `project-kickstarter:orchestration` skill and run its loop in
this session, as the controller.

Scope: `$ARGUMENTS`

- **A single task id** restricts the loop to that task, plus the reviews
  and fixes it needs.
- **Empty or `all`** runs batches until nothing is runnable.

You delegate. Never implement, test or review yourself. Dispatch in
parallel (several Agent calls in one message) only for tasks returned
together by the batch command. End with the orchestration report.
