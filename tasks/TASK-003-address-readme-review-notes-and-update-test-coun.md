---
id: TASK-003
title: Address README review notes and update test counts
status: done
agent: docs-writer
skills: []
model_tier: fast
priority: p2
depends_on: []
files_allowed: ["README.md", "docs/architecture/security-model.md", "docs/architecture/task-lifecycle.md"]
files_excluded: []
review: ["code"]
validation:
  - cmd: node scripts/validate.mjs
    expect: exit 0
  - cmd: node scripts/run-tests.mjs
    expect: exit 0
acceptance:
  - Verification banner scoped to commands actually executed
  - IDE subsections numbered from 1 and Updating listed in Contents
  - Test counts in README match node scripts/run-tests.mjs
max_retries: 2
attempts: 0
created: 2026-10-14
updated: 2026-10-14
---

## Objective

Resolve README review findings DOC-1 and DOC-2 from reports/reviews/TASK-001-code.md and refresh test counts after TASK-002.

## Context

- DOC-1 (low): banner claims every script command was run; some commands are marked not re-verified.
- DOC-2 (info): IDE subsections start at 2; Updating missing from Contents.
- TASK-002 raised the test count to 75.
- Scope includes security-model.md and task-lifecycle.md to document TASK-002 behaviour (stricter subagent write rules, round archiving).

## Steps

1. Reword the banner, add the Claude Code heading and the Contents entry.
2. Replace stale test counts with the current run result.
3. Run the validation commands.

## Blockers

Stop if test counts are not stable across runs.

## Deliverables

- README.md
- reports/handoffs/TASK-003.md
