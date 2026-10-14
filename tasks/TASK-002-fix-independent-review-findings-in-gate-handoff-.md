---
id: TASK-002
title: Fix independent review findings in gate, handoff scope and guards
status: review
agent: implementer
skills: []
model_tier: coding
priority: p2
depends_on: []
files_allowed:
  - scripts/lib/**
  - hooks/**
  - config/protected-paths.json
  - tests/**
  - skills/orchestration/SKILL.md
  - skills/project-kickstarter/templates/hooks/guard-bash.mjs
  - scripts/reports.mjs
  - scripts/validate.mjs
files_excluded: []
review: ["code", "security"]
validation:
  - cmd: node scripts/run-tests.mjs
    expect: exit 0
  - cmd: node scripts/validate.mjs
    expect: exit 0
acceptance:
  - Each confirmed finding F1-F12 has a regression test that fails on the old code
  - Path traversal in files_modified is rejected
  - Read-only agents can run grep/rg/git list commands
  - Implementers cannot write review files or task state via Bash or Write
  - Rework rounds archive stale handoffs and reviews
max_retries: 2
attempts: 0
created: 2026-10-14
updated: 2026-10-14
---

## Objective

Fix the confirmed findings F1-F12 from the independent review of the gate, handoff and guard code, each with a regression test.

## Context

The findings came from an independent reviewer session (feature-dev:code-reviewer, read-only). Each was reproduced with node probes in the main session before fixing. F1: review/task-state forgery by write agents. F2: `..` in files_modified. F3/F10: bash read-only false positives and comment bypass. F4: long rm options. F5: name normalisation for independence. F6/F7: retry budget and stale evidence across rounds. F8: BOM. F9: secret reads by other commands. F11: braces/case. F12: approver regex, env rule, EOL.

## Steps

1. Add failing regression tests for each finding.
2. Fix glob/handoff/gate/tasks/frontmatter/bash-rules/guard hooks.
3. Regenerate the kickstarter hook template; run the validation commands.

Scope widened during implementation (planner decision, recorded in the handoff): `scripts/reports.mjs` shares the reviewer-independence check (F5) and `scripts/validate.mjs` gained the control-character check after two real occurrences were found.

## Blockers

Stop if a fix would require weakening an existing test or gate.

## Deliverables

- Fixes and tests within scope
- reports/handoffs/TASK-002.md
